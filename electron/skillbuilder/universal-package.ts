import { createWriteStream, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

import { ZipArchive } from "archiver";

import type { SkillExportMode, SkillPackageSummary } from "../../common/ipc";
import { resolveOverlaps, scanStructuredPii, type SensitiveMatch } from "../../common/sensitive";
import { normalizeSkillTerminology, slugifySkillName, type BuiltSkill } from "../../common/skill";
import { tokenize } from "../../common/values";
import { scanSecrets } from "../sensitive/secrets";

const SECRET_NAME_RE = /(?:api[\s_-]*key|access[\s_-]*key|token|secret|password|passwd|credential|private[\s_-]*key|cookie|authorization|auth[\s_-]*key)/i;
const HOST_SPECIFIC_RE = /\b(?:Scout|WorkIQ|Cowork|Microsoft\s+365\s+Copilot)\b/i;
const LOCAL_PATH_RE = /(?:\/Users\/[^\s'"`<>]+|\/home\/[^\s'"`<>]+|[A-Za-z]:\\Users\\[^\s'"`<>]+)/g;
const KNOWN_BINS = [
  "bash",
  "brew",
  "curl",
  "docker",
  "git",
  "gh",
  "go",
  "jq",
  "node",
  "npm",
  "npx",
  "osascript",
  "pnpm",
  "python3",
  "rg",
  "sh",
  "uv",
] as const;

type PackageFiles = Map<string, string>;

interface PackageState {
  config: Record<string, string>;
  env: Map<string, string>;
  configuredValueCount: number;
  protectedSecretCount: number;
  portablePathCount: number;
  usedConfigKeys: Set<string>;
}

export interface PreparedSkillPackage {
  name: string;
  mode: SkillExportMode;
  files: PackageFiles;
  configuredValueCount: number;
  protectedSecretCount: number;
  portablePathCount: number;
  removedAllowedToolCount: number;
  requiredBins: string[];
  warnings: string[];
}

function uniqueKey(raw: string, used: Set<string>): string {
  const base = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "value";
  let key = base;
  let n = 2;
  while (used.has(key)) key = `${base}_${n++}`;
  used.add(key);
  return key;
}

function envName(raw: string, used: Map<string, string>): string {
  let base = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 56) || "SKILL_SECRET";
  if (/^[0-9]/.test(base)) base = `SKILL_${base}`;
  let name = base;
  let n = 2;
  while (used.has(name)) name = `${base}_${n++}`;
  return name;
}

function isLocalAbsolutePath(value: string): boolean {
  if (!value) return false;
  return /^\/(?:Users|home)\//.test(value) || /^[A-Za-z]:\\Users\\/.test(value);
}

async function sensitiveMatches(text: string): Promise<SensitiveMatch[]> {
  if (!text) return [];
  return resolveOverlaps([...(await scanSecrets(text)), ...scanStructuredPii(text)]);
}

async function valueIsSensitive(name: string, value: string): Promise<boolean> {
  if (SECRET_NAME_RE.test(name)) return true;
  return (await sensitiveMatches(value)).length > 0;
}

function renderTokens(text: string, replacements: Map<string, string>): string {
  return tokenize(text)
    .map((segment) => {
      if (segment.kind === "text") return segment.text;
      return replacements.get(segment.id) ?? `{{${segment.id}}}`;
    })
    .join("");
}

function replaceCapturedValues(
  text: string,
  values: BuiltSkill["values"],
  replacements: Map<string, string>,
): string {
  let cleaned = text;
  for (const value of [...values].sort((a, b) => b.value.length - a.value.length)) {
    const replacement = replacements.get(value.id);
    if (!value.value || !replacement) continue;
    cleaned = cleaned.split(value.value).join(replacement);
  }
  return cleaned;
}

function replaceRanges(
  text: string,
  matches: SensitiveMatch[],
  replacement: (match: SensitiveMatch, index: number) => string,
): string {
  let out = text;
  [...matches]
    .sort((a, b) => b.start - a.start)
    .forEach((match, index) => {
      out = out.slice(0, match.start) + replacement(match, index) + out.slice(match.end);
    });
  return out;
}

async function sanitizeResidualText(text: string, state: PackageState): Promise<string> {
  const matches = await sensitiveMatches(text);
  let cleaned = replaceRanges(text, matches, (match) => {
    const secret = ["private-key", "api-key", "jwt", "password", "credit-card", "ssn"].includes(
      match.category,
    );
    if (secret) {
      const name = envName(`SKILL_SECRET_${state.protectedSecretCount + 1}`, state.env);
      state.env.set(name, "Set this protected value before running the Skill.");
      state.protectedSecretCount++;
      return `{{env.${name}}}`;
    }
    const key = uniqueKey(`personal_value_${state.configuredValueCount + 1}`, state.usedConfigKeys);
    state.config[key] = "<configure-value>";
    state.configuredValueCount++;
    return `{{config.${key}}}`;
  });

  const pathKeys = new Map<string, string>();
  cleaned = cleaned.replace(LOCAL_PATH_RE, (found) => {
    let key = pathKeys.get(found);
    if (!key) {
      key = uniqueKey(`local_path_${state.portablePathCount + 1}`, state.usedConfigKeys);
      pathKeys.set(found, key);
      state.config[key] = "<configure-path>";
      state.configuredValueCount++;
      state.portablePathCount++;
    }
    return `{{config.${key}}}`;
  });
  return cleaned;
}

function extractRequiredBins(skill: BuiltSkill, body: string): string[] {
  const found = new Set<string>();
  const addKnown = (text: string): void => {
    for (const bin of KNOWN_BINS) {
      const re = new RegExp(`(?:^|[^a-z0-9_-])${bin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^a-z0-9_-])`, "i");
      if (re.test(text)) found.add(bin);
    }
  };

  for (const tool of skill.allowedTools) {
    const bash = tool.match(/^Bash\(\s*([A-Za-z0-9._+-]+)/i);
    if (bash) addKnown(bash[1]);
  }
  for (const step of skill.plan?.steps ?? []) addKnown(step.tool);
  for (const match of body.matchAll(/(?:^|\n|`)\s*([A-Za-z0-9._+-]+)(?=\s|`|$)/g)) addKnown(match[1]);
  return [...found].sort();
}

function yamlString(value: string): string {
  return JSON.stringify(value.trim());
}

function renderFrontmatter(name: string, description: string): string {
  // Keep the common denominator understood by multiple Skill-capable agents.
  // Host-specific metadata belongs to adapters,
  // not the exported Skill itself.
  return ["---", `name: ${name}`, `description: ${yamlString(description)}`, "---"].join("\n");
}

function requirementsSection(bins: string[], chinese: boolean): string {
  if (!bins.length) return "";
  return chinese
    ? `## 运行要求\n\n需要以下命令行工具：${bins.map((bin) => `\`${bin}\``).join("、")}。`
    : `## Requirements\n\nRequired command-line tools: ${bins.map((bin) => `\`${bin}\``).join(", ")}.`;
}

function configurationSection(state: PackageState, chinese: boolean): string {
  if (!Object.keys(state.config).length && !state.env.size) return "";
  const lines = chinese
    ? [
        "## 配置",
        "",
        ...(Object.keys(state.config).length
          ? [
              "- 首次使用时，将 `config.example.json` 复制为同目录下的 `config.json`，填写实际值。",
              "- 将正文中的 `{{config.<key>}}` 替换为 `config.json` 对应字段。",
            ]
          : []),
        ...(state.env.size
          ? [
              "- 运行前通过环境变量提供 `{{env.<NAME>}}`；不要把密钥写入 Skill、配置文件、提示词或日志。",
            ]
          : []),
      ]
    : [
        "## Configuration",
        "",
        ...(Object.keys(state.config).length
          ? [
              "- Before first use, copy `config.example.json` to `config.json` in this directory and fill in the real values.",
              "- Resolve every `{{config.<key>}}` token from the matching `config.json` field.",
            ]
          : []),
        ...(state.env.size
          ? [
              "- Resolve `{{env.<NAME>}}` from the environment at runtime; never put secrets in the Skill, config files, prompts, or logs.",
            ]
          : []),
      ];
  return lines.join("\n");
}

/**
 * Convert a finished on-demand Skill into either a share-safe or personal package.
 * Raw recordings, analysis artifacts, and schedules are never package inputs.
 */
export async function prepareSkillPackage(
  skill: BuiltSkill,
  mode: SkillExportMode,
): Promise<PreparedSkillPackage> {
  const name = slugifySkillName(skill.name);

  if (mode === "personal") {
    const replacements = new Map(skill.values.map((value) => [value.id, value.value]));
    const body = renderTokens(normalizeSkillTerminology(skill.body), replacements).trim();
    const bins = extractRequiredBins(skill, body);
    const chinese = /[\u3400-\u9fff]/.test(`${skill.description}\n${body}`);
    const requirements = requirementsSection(bins, chinese);
    const markdownBody = [requirements, body].filter(Boolean).join("\n\n");
    return {
      name,
      mode,
      files: new Map([[
        "SKILL.md",
        `${renderFrontmatter(name, normalizeSkillTerminology(skill.description))}\n\n${markdownBody}\n`,
      ]]),
      configuredValueCount: skill.values.length,
      protectedSecretCount: 0,
      portablePathCount: 0,
      removedAllowedToolCount: skill.allowedTools.filter((tool) => tool.trim()).length,
      requiredBins: bins,
      warnings: [],
    };
  }

  const state: PackageState = {
    config: {},
    env: new Map(),
    configuredValueCount: 0,
    protectedSecretCount: 0,
    portablePathCount: 0,
    usedConfigKeys: new Set(),
  };
  const replacements = new Map<string, string>();

  for (const value of skill.values) {
    const key = uniqueKey(value.id, state.usedConfigKeys);
    if (await valueIsSensitive(value.name || value.id, value.value)) {
      const variable = envName(value.id || value.name, state.env);
      state.env.set(variable, `Provide ${value.name || value.id} for this Skill.`);
      replacements.set(value.id, `{{env.${variable}}}`);
      state.protectedSecretCount++;
      continue;
    }
    // A value does not need to be a credential to identify the person or system
    // that created the Skill (project refs, repository names, tenant ids, template
    // choices, and similar instance data all do). Examples therefore contain only
    // typed placeholders; the captured value is never copied into a shareable file.
    state.config[key] = isLocalAbsolutePath(value.value) ? "<configure-path>" : "<configure-value>";
    replacements.set(value.id, `{{config.${key}}}`);
    state.configuredValueCount++;
    if (isLocalAbsolutePath(value.value)) state.portablePathCount++;
  }

  let body = replaceCapturedValues(skill.body, skill.values, replacements);
  body = normalizeSkillTerminology(renderTokens(body, replacements));
  body = await sanitizeResidualText(body, state);
  let description = normalizeSkillTerminology(
    replaceCapturedValues(skill.description.trim(), skill.values, replacements),
  );
  if ((await sensitiveMatches(description)).length || LOCAL_PATH_RE.test(description)) {
    description = /[\u3400-\u9fff]/.test(skill.description)
      ? "按需执行已配置的通用工作流程。"
      : "Run the configured portable workflow on demand.";
  }
  LOCAL_PATH_RE.lastIndex = 0;

  const chinese = /[\u3400-\u9fff]/.test(`${description}\n${body}`);
  const setup = configurationSection(state, chinese);
  if (setup) body = `${setup}\n\n${body.trim()}`;

  const bins = extractRequiredBins(skill, body);
  const requirements = requirementsSection(bins, chinese);
  if (requirements) body = `${requirements}\n\n${body.trim()}`;
  const files: PackageFiles = new Map();
  files.set("SKILL.md", `${renderFrontmatter(name, description)}\n\n${body.trim()}\n`);
  if (Object.keys(state.config).length) {
    files.set("config.example.json", `${JSON.stringify(state.config, null, 2)}\n`);
  }
  if (state.env.size) {
    files.set(".env.example", `${[...state.env.keys()].map((key) => `${key}=`).join("\n")}\n`);
  }
  files.set(".gitignore", ["config.json", ".env", ".DS_Store", "__MACOSX/", "*.log", ""].join("\n"));

  const warnings: string[] = [];
  if (HOST_SPECIFIC_RE.test(body)) {
    warnings.push("The instructions still mention a host-specific agent or integration; review before publishing.");
  }
  if ([...bins].some((bin) => ["osascript", "brew"].includes(bin))) {
    warnings.push("The Skill uses macOS-oriented commands and may not run unchanged on other platforms.");
  }

  return {
    name,
    mode,
    files,
    configuredValueCount: state.configuredValueCount,
    protectedSecretCount: state.protectedSecretCount,
    portablePathCount: state.portablePathCount,
    removedAllowedToolCount: skill.allowedTools.filter((tool) => tool.trim()).length,
    requiredBins: bins,
    warnings,
  };
}

function uniqueZipPath(baseDir: string, name: string, mode: SkillExportMode): string {
  const suffix = mode === "share" ? "share" : "personal";
  const base = path.join(baseDir, `${name}-${suffix}.zip`);
  if (!existsSync(base)) return base;
  let n = 2;
  let candidate = path.join(baseDir, `${name}-${suffix}-${n}.zip`);
  while (existsSync(candidate)) candidate = path.join(baseDir, `${name}-${suffix}-${++n}.zip`);
  return candidate;
}

function writeZip(zipPath: string, name: string, files: PackageFiles): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const done = (err?: Error): void => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve();
    };
    const output = createWriteStream(zipPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    output.on("close", () => done());
    output.on("error", (err) => done(err));
    archive.on("error", (err) => done(err));
    archive.pipe(output);
    for (const [relative, content] of files) {
      archive.append(content, { name: `${name}/${relative}`, mode: 0o644 });
    }
    void archive.finalize();
  });
}

/** Write one host-neutral ZIP without leaving an expanded copy beside it. */
export async function writeSkillPackage(
  skill: BuiltSkill,
  baseDir: string,
  mode: SkillExportMode,
): Promise<SkillPackageSummary> {
  const prepared = await prepareSkillPackage(skill, mode);
  const resolvedBase = path.resolve(baseDir);
  mkdirSync(resolvedBase, { recursive: true });
  const zipPath = uniqueZipPath(resolvedBase, prepared.name, mode);
  try {
    await writeZip(zipPath, prepared.name, prepared.files);
  } catch (err) {
    rmSync(zipPath, { force: true });
    throw err;
  }

  return {
    name: prepared.name,
    mode,
    zipPath,
    files: [...prepared.files.keys()].sort(),
    configuredValueCount: prepared.configuredValueCount,
    protectedSecretCount: prepared.protectedSecretCount,
    portablePathCount: prepared.portablePathCount,
    removedAllowedToolCount: prepared.removedAllowedToolCount,
    requiredBins: prepared.requiredBins,
    warnings: prepared.warnings,
  };
}

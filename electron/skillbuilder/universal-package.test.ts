import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import AdmZip from "adm-zip";

import { BuiltSkillSchema } from "../../common/skill";
import {
  prepareSkillPackage,
  writeSkillPackage,
} from "./universal-package";

const secret = "sk-test-1234567890abcdefghijklmnop";

function sampleSkill() {
  return BuiltSkillSchema.parse({
    version: 1,
    sessionId: "universal-test",
    architecture: "agent-skill",
    name: "Portable Review",
    description: "Review a repository with configured values.",
    allowedTools: ["Bash(gh *)", "Read"],
    body: [
      "Use {{repo}} and authenticate with {{api_key}}. 这是一个可复用技能。",
      "The captured repository was owner/project and must not remain in a shared package.",
      "Read the local template at {{template_path}}.",
      "Run `gh pr list -R {{repo}}` and summarize the result.",
    ].join("\n\n"),
    values: [
      { id: "repo", name: "Repository", value: "owner/project" },
      { id: "api_key", name: "API key", value: secret },
      { id: "template_path", name: "Template path", value: "/Users/alice/private/template.md" },
    ],
    plan: {
      architecture: "agent-skill",
      name: "portable-review",
      title: "Portable review",
      description: "Review a repository with configured values.",
      values: [],
      steps: [{ kind: "calculation", title: "List PRs", text: "Run gh", tool: "gh CLI" }],
      allowedTools: ["Bash(gh *)"],
    },
    createdAt: Date.now(),
  });
}

test("share package configures fixed values and keeps secrets out of every file", async () => {
  const prepared = await prepareSkillPackage(sampleSkill(), "share");
  const markdown = prepared.files.get("SKILL.md") ?? "";
  const config = prepared.files.get("config.example.json") ?? "";
  const env = prepared.files.get(".env.example") ?? "";
  const all = [...prepared.files.values()].join("\n");

  assert.match(markdown, /^---\nname: portable-review\n/m);
  assert.doesNotMatch(markdown, /version:/);
  assert.doesNotMatch(markdown, /metadata:|openclaw|clawhub/i);
  assert.match(markdown, /\{\{config\.repo\}\}/);
  assert.match(markdown, /\{\{env\.API_KEY\}\}/);
  assert.doesNotMatch(markdown, /allowed-tools/);
  assert.doesNotMatch(markdown, /技能/);
  assert.match(markdown, /Skill/);
  assert.doesNotMatch(all, new RegExp(secret));
  assert.doesNotMatch(all, /\/Users\/alice/);
  assert.match(config, /"repo": "<configure-value>"/);
  assert.doesNotMatch(all, /owner\/project/);
  assert.match(config, /"template_path": "<configure-path>"/);
  assert.doesNotMatch(config, /api_key/i);
  assert.match(env, /^API_KEY=$/m);
  assert.deepEqual(prepared.requiredBins, ["gh"]);
  assert.equal(prepared.protectedSecretCount, 1);
  assert.equal(prepared.portablePathCount, 1);
  assert.equal(prepared.removedAllowedToolCount, 2);
});

test("written share ZIP contains only allowlisted package files under the Skill folder", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "skill-recorder-universal-"));
  try {
    const summary = await writeSkillPackage(sampleSkill(), root, "share");
    assert.equal(path.basename(summary.zipPath), "portable-review-share.zip");
    assert.deepEqual(await readdir(root), ["portable-review-share.zip"]);

    const zip = new AdmZip(summary.zipPath);
    const entries = zip.getEntries().map((entry) => entry.entryName).sort();
    assert.deepEqual(
      entries,
      summary.files.map((file) => `portable-review/${file}`).sort(),
    );
    const skillMd = zip.readAsText("portable-review/SKILL.md");
    assert.doesNotMatch(skillMd, new RegExp(secret));
    assert.ok(entries.includes("portable-review/SKILL.md"));
    assert.ok(!entries.includes("portable-review/.clawhubignore"));
    assert.ok(entries.every((entry) => !entry.includes("automation.json")));
    assert.ok(entries.every((entry) => !entry.includes(".DS_Store") && !entry.includes("__MACOSX")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("personal package keeps captured values but stays host-neutral", async () => {
  const prepared = await prepareSkillPackage(sampleSkill(), "personal");
  const markdown = prepared.files.get("SKILL.md") ?? "";

  assert.equal(prepared.mode, "personal");
  assert.deepEqual([...prepared.files.keys()], ["SKILL.md"]);
  assert.match(markdown, new RegExp(secret));
  assert.match(markdown, /owner\/project/);
  assert.match(markdown, /\/Users\/alice\/private\/template\.md/);
  assert.doesNotMatch(markdown, /allowed-tools|metadata:|openclaw|clawhub/i);
  assert.match(markdown, /## (?:Requirements|运行要求)/);
});

test("personal export writes only one ZIP with the Skill directory", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "skill-recorder-personal-"));
  try {
    const summary = await writeSkillPackage(sampleSkill(), root, "personal");
    assert.equal(path.basename(summary.zipPath), "portable-review-personal.zip");
    assert.deepEqual(await readdir(root), ["portable-review-personal.zip"]);
    const zip = new AdmZip(summary.zipPath);
    assert.deepEqual(zip.getEntries().map((entry) => entry.entryName), ["portable-review/SKILL.md"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

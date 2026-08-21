import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import AdmZip from "adm-zip";

import { BuiltSkillSchema } from "../../common/skill";
import {
  prepareUniversalSkillPackage,
  writeUniversalSkillPackage,
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
      "Use {{repo}} and authenticate with {{api_key}}.",
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

test("universal package configures fixed values and keeps secrets out of every file", async () => {
  const prepared = await prepareUniversalSkillPackage(sampleSkill());
  const markdown = prepared.files.get("SKILL.md") ?? "";
  const config = prepared.files.get("config.example.json") ?? "";
  const env = prepared.files.get(".env.example") ?? "";
  const all = [...prepared.files.values()].join("\n");

  assert.match(markdown, /^---\nname: portable-review\n/m);
  assert.match(markdown, /version: 1\.0\.0/);
  assert.match(markdown, /\{\{config\.repo\}\}/);
  assert.match(markdown, /\{\{env\.API_KEY\}\}/);
  assert.doesNotMatch(markdown, /allowed-tools/);
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

test("written universal ZIP contains only allowlisted package files under the Skill folder", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "skill-recorder-universal-"));
  try {
    const summary = await writeUniversalSkillPackage(sampleSkill(), root);
    assert.equal(path.basename(summary.zipPath), "portable-review.zip");
    assert.deepEqual(await readdir(root), ["portable-review.zip"]);

    const zip = new AdmZip(summary.zipPath);
    const entries = zip.getEntries().map((entry) => entry.entryName).sort();
    assert.deepEqual(
      entries,
      summary.files.map((file) => `portable-review/${file}`).sort(),
    );
    const skillMd = zip.readAsText("portable-review/SKILL.md");
    assert.doesNotMatch(skillMd, new RegExp(secret));
    assert.ok(entries.includes("portable-review/SKILL.md"));
    assert.ok(entries.includes("portable-review/.clawhubignore"));
    assert.ok(entries.every((entry) => !entry.includes("automation.json")));
    assert.ok(entries.every((entry) => !entry.includes(".DS_Store") && !entry.includes("__MACOSX")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

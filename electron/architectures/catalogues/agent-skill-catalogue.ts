import { defineCatalogueProvider } from "../catalogue-provider";

/**
 * A **static, versioned** catalogue for a *generic* target: any AI agent that
 * supports skills. Unlike the Scout and Cowork catalogues, it deliberately lists
 * NO proprietary built-in tools — a skill built for this target must rely only on
 * portable capabilities (files, shell/CLIs, documented HTTP APIs) so it can load
 * into whatever agent the user chooses.
 */
export const AGENT_SKILL_CATALOGUE_VERSION = "2026-08-21";

const AGENT_SKILL_CATALOGUE = `
# Target: Any AI agent with skill support — generic skill catalogue (portable capabilities only)

An **Agent skill** is a portable \`SKILL.md\` file: minimal YAML frontmatter followed by a
markdown **instructions body**. It targets no specific host and should work across Skill-capable
agents such as Codex, Claude Code, and OpenClaw without assuming proprietary built-in tools.

Frontmatter fields:
- \`name\` — kebab-case, \`^[a-z0-9-]+$\`.
- \`description\` — one line of trigger keywords (when the agent should reach for this skill).
- Keep exported frontmatter to \`name\` and \`description\`. Describe required CLIs in the body
  instead of adding host-specific metadata or permission fields.

The body is plain instructions written TO the agent (imperative voice): when to use the
skill, the procedure to follow, and how to handle inputs and edge cases.

## Assume only portable capabilities

- Do NOT assume host-specific integrations — no Teams / Outlook / Calendar / WorkIQ, and no
  browser automation. Rely only on capabilities every agent can reasonably provide: reading
  and writing files, running shell commands and standard CLIs, and calling documented HTTP APIs.
- Map each recorded UI action to a portable tool, an API call, or a CLI — never write
  "click" / "type" UI steps.

## Writing the SKILL.md body

- Write a GENERALIZED procedure: if the recording acted on N specific items, the body loops
  over ALL items of that kind, not the specific examples that were recorded.
- Resolve each input via the plan (a fixed value / the user provides it / the agent locates it).
- Keep it concise and imperative. Include a short "When to use" and the ordered steps.
`.trim();

export default defineCatalogueProvider({
  architecture: "agent-skill",
  skill: {
    version: AGENT_SKILL_CATALOGUE_VERSION,
    content: AGENT_SKILL_CATALOGUE,
  },
});

# Repository instructions for coding agents

- Base changes on `main` unless the issue or maintainer names another branch
- Current product and release target is macOS Apple Silicon only
- Do not reintroduce GitHub Copilot runtime, Windows, Linux, or Intel Mac dependencies
  without an approved product decision and native validation
- Preserve the configurable OpenAI-compatible runtime boundary
- Never place API keys, recordings, exported personal Skills, or local absolute paths in Git
- Use Node.js `>=24.19.0 <25` and npm `>=11.17.0`
- Keep `package.json#allowScripts`, lockfile checks, and compliance gates enabled
- Update tests, user documentation, changelog, and third-party notices with behavior changes
- Run type checks, tests, and the production build before opening a pull request

# Contributing

Thank you for improving Better Skill Recorder.

## Before opening a pull request

1. Open or reference an issue for significant behavior changes
2. Keep changes focused and preserve unrelated work
3. Add or update tests for behavior changes
4. Run:

   ```bash
   npm run check:lockfile
   npm run typecheck
   npm run typecheck:evals
   npm test
   npm run build
   ```

5. Update user documentation and `CHANGELOG.md` when behavior changes

Do not commit API keys, recordings, screenshots with personal data, exported personal
Skills, local absolute paths, generated release directories, or configuration containing
credentials.

Third-party code, images, fonts, models, and binaries require documented provenance,
compatible redistribution terms, and updated notices. Dependency install scripts must be
reviewed and explicitly covered by `package.json#allowScripts`.

By contributing, you confirm that you have the right to submit the work under the project's
MIT License and agree to follow the Code of Conduct.

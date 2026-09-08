import { prepareCompliance } from "./compliance.mjs";

const licensesOnly = process.argv.includes("--licenses-only");
const networkSources = process.argv.includes("--network-sources");
const result = await prepareCompliance({
  sourceMode: licensesOnly ? "none" : networkSources ? "network" : "embedded",
});

console.log(
  `Prepared ${result.packageCount} package licenses and ${result.sourceCount} source materials in ` +
    result.outputDir,
);

import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { excludedWasmPackages, verifyComplianceDirectory } from "./compliance.mjs";

const require = createRequire(import.meta.url);
const { listPackage } = require("@electron/asar");

const arch = process.argv[2];
if (arch !== "x64" && arch !== "arm64") {
  throw new Error("Usage: node scripts/verify-windows-package.mjs <x64|arm64>");
}

const outputRoot = path.resolve("release");
const unpacked = readdirSync(outputRoot)
  .map((name) => path.join(outputRoot, name))
  .find(
    (entry) =>
      statSync(entry).isDirectory() &&
      path.basename(entry) === (arch === "arm64" ? "win-arm64-unpacked" : "win-unpacked"),
  );
if (!unpacked) throw new Error(`Could not find the ${arch} unpacked Windows application.`);

const appExe = path.join(unpacked, "Better Skill Recorder.exe");
const expectedMachine = arch === "arm64" ? 0xaa64 : 0x8664;
verifyPeMachine(appExe, expectedMachine);
verifyPeMachine(path.join(unpacked, "ffmpeg.dll"), expectedMachine);

const asarPath = path.join(unpacked, "resources", "app.asar");
const asarEntries = listPackage(asarPath).map((entry) =>
  entry.replace(/^[\\/]+/, "").replaceAll("\\", "/").toLowerCase(),
);
const asarFiles = asarEntries.map((entry) => `${asarPath}!${entry}`);
const files = [...walk(unpacked), ...asarFiles];
const normalizedFiles = files.map((file) => file.toLowerCase().replaceAll("\\", "/"));
const expectedPayloads = [
  {
    packagePath: `/@koromix/koffi-win32-${arch}/`,
    executable: `/@koromix/koffi-win32-${arch}/win32_${arch}/koffi.node`,
  },
  {
    packagePath: `/@img/sharp-win32-${arch}/`,
    // sharp 0.35 suffixes the native addon with the package version.
    executable: new RegExp(
      `/@img/sharp-win32-${arch}/lib/sharp-win32-${arch}(?:-[0-9][^/]*)?\\.node$`,
    ),
  },
  {
    packagePath: `/onnxruntime-node/bin/napi-v6/win32/${arch}/`,
    executable: `/onnxruntime-node/bin/napi-v6/win32/${arch}/onnxruntime_binding.node`,
  },
  {
    packagePath: `/@github/copilot-win32-${arch}/`,
    executable: `/@github/copilot-win32-${arch}/copilot.exe`,
  },
];
for (const payload of expectedPayloads) {
  if (!normalizedFiles.some((file) => file.includes(payload.packagePath))) {
    throw new Error(`Packaged ${arch} application is missing ${payload.packagePath}.`);
  }

  const executableIndex = normalizedFiles.findIndex((file) =>
    payload.executable instanceof RegExp
      ? payload.executable.test(file)
      : file.endsWith(payload.executable),
  );
  if (executableIndex === -1) {
    throw new Error(`Packaged ${arch} application is missing ${payload.executable}.`);
  }
  verifyPeMachine(files[executableIndex], expectedMachine);
}

for (const excluded of excludedWasmPackages) {
  const prefix = `/${excluded.toLowerCase()}/`;
  const leaked = normalizedFiles.find((file) => file.includes(prefix));
  if (leaked) {
    throw new Error(`Packaged ${arch} application contains excluded WASM payload ${leaked}.`);
  }
}
const wasmBinary = normalizedFiles.find(
  (file) => file.includes("/@img/") && file.endsWith(".wasm"),
);
if (wasmBinary) {
  throw new Error(
    `Packaged ${arch} application contains an unreviewed Sharp WebAssembly binary ${wasmBinary}.`,
  );
}

const otherArch = arch === "arm64" ? "x64" : "arm64";
const wrongArchitecturePayloads = [
  `/@koromix/koffi-win32-${otherArch}/`,
  `/@img/sharp-win32-${otherArch}/`,
  `/@github/copilot-win32-${otherArch}/copilot.exe`,
];
for (const wrongPayload of wrongArchitecturePayloads) {
  if (normalizedFiles.some((file) => file.includes(wrongPayload))) {
    throw new Error(`Packaged ${arch} application contains ${wrongPayload}.`);
  }
}

const forbiddenStandaloneFfmpeg = normalizedFiles.filter(
  (file) =>
    file.includes("/ffmpeg-static/") ||
    /\/ffmpeg(?:\.exe)?$/.test(file),
);
if (forbiddenStandaloneFfmpeg.length > 0) {
  throw new Error(
    `Packaged application contains a forbidden standalone FFmpeg payload:\n${forbiddenStandaloneFfmpeg.join("\n")}`,
  );
}

for (const notice of ["LICENSE.electron.txt", "LICENSES.chromium.html"]) {
  if (!normalizedFiles.includes(path.join(unpacked, notice).toLowerCase().replaceAll("\\", "/"))) {
    throw new Error(`Packaged application is missing Electron license notice ${notice}.`);
  }
}
for (const notice of ["third-party-notices.md", "license"]) {
  if (!normalizedFiles.some((file) => file.endsWith(`app.asar!${notice}`))) {
    throw new Error(`Packaged application is missing application notice ${notice}.`);
  }
}

await verifyComplianceDirectory(path.join(unpacked, "resources", "compliance"), {
  requireSources: true,
  requireElectronNotices: true,
});

const nestedOutput = asarEntries.find(
  (entry) =>
    entry.startsWith("release/") ||
    /^dist\/(?:win(?:-[^/]+)?-unpacked|mac(?:-[^/]+)?|linux(?:-[^/]+)?-unpacked)\//.test(
      entry,
    ),
);
if (nestedOutput) {
  throw new Error(`Packaged application recursively contains build output ${nestedOutput}.`);
}
const forbiddenSourceRoots = ["common", "docs", "electron", "evals", "scripts", "src"];
for (const root of forbiddenSourceRoots) {
  if (asarEntries.some((entry) => entry === root || entry.startsWith(`${root}/`))) {
    throw new Error(`Packaged application contains source-only directory ${root}/.`);
  }
}

console.log(
  `Verified native ${arch} package, compliance sources, notices, and no standalone FFmpeg: ` +
    path.relative(process.cwd(), unpacked),
);

function verifyPeMachine(file, expected) {
  const executable = readFileSync(file);
  if (executable.length < 0x40) throw new Error(`${file} is too short to be a PE executable.`);

  const peOffset = executable.readUInt32LE(0x3c);
  if (peOffset + 6 > executable.length) {
    throw new Error(`${file} has an invalid PE header offset.`);
  }

  const signature = executable.toString("ascii", peOffset, peOffset + 4);
  if (signature !== "PE\u0000\u0000") throw new Error(`${file} is not a PE executable.`);

  const machine = executable.readUInt16LE(peOffset + 4);
  if (machine !== expected) {
    throw new Error(
      `${file} has PE machine 0x${machine.toString(16)}, expected 0x${expected.toString(16)}.`,
    );
  }
}

function walk(root) {
  const output = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...walk(absolute));
    else output.push(absolute);
  }
  return output;
}

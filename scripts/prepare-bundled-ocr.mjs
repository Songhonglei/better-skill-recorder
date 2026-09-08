#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const policy = JSON.parse(
  await readFile(path.join(root, "third_party", "compliance-policy.json"), "utf8"),
);
const revision = policy.tesseract?.tessdata?.revision;
const expected = policy.tesseract?.tessdata?.files?.["eng.traineddata"];
if (!/^[a-f0-9]{40}$/.test(revision ?? "") || !/^[a-f0-9]{64}$/.test(expected ?? "")) {
  throw new Error("Reviewed English OCR revision or SHA-256 is missing from compliance policy.");
}

const destination = path.join(
  root,
  "electron",
  "assets",
  "models",
  "tessdata",
  "eng.traineddata",
);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

try {
  const existing = await readFile(destination);
  if (digest(existing) === expected) {
    console.log("Bundled English OCR model is already present and verified.");
    process.exit(0);
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const url =
  `https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/` +
  `${revision}/eng.traineddata`;
const response = await fetch(url);
if (!response.ok) throw new Error(`Could not download English OCR model: HTTP ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
const actual = digest(bytes);
if (actual !== expected) {
  throw new Error(`English OCR SHA-256 mismatch: expected ${expected}, received ${actual}`);
}

await mkdir(path.dirname(destination), { recursive: true });
await writeFile(destination, bytes, { mode: 0o644 });
console.log(`Prepared verified English OCR model (${bytes.length} bytes).`);

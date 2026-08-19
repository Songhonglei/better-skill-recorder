import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  findLocalSigningIdentity,
  LOCAL_MACOS_SIGNING_IDENTITY,
} from "./macos-signing.mjs";

if (process.platform !== "darwin") {
  console.error("Local macOS signing setup can only run on macOS.");
  process.exit(1);
}

const existingIdentity = findLocalSigningIdentity();
if (existingIdentity) {
  console.log(
    `${LOCAL_MACOS_SIGNING_IDENTITY} is already ready (${existingIdentity}).`,
  );
  process.exit(0);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: options.inherit ? "inherit" : "pipe",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(
      `${command} ${args[0] ?? ""} failed${detail ? `:\n${detail}` : ""}`,
    );
  }
  return result.stdout?.trim() ?? "";
}

const defaultKeychain = run("/usr/bin/security", [
  "default-keychain",
  "-d",
  "user",
]).replace(/^"|"$/gu, "");
const signingDirectory = join(
  homedir(),
  "Library",
  "Application Support",
  "Better Skill Recorder",
  "signing",
);
mkdirSync(signingDirectory, { recursive: true, mode: 0o700 });
chmodSync(signingDirectory, 0o700);

const rootKey = join(signingDirectory, "local-root.key");
const rootCertificate = join(signingDirectory, "local-root.pem");
const leafKey = join(signingDirectory, "local-codesign.key");
const leafRequest = join(signingDirectory, "local-codesign.csr");
const leafCertificate = join(signingDirectory, "local-codesign.pem");
const leafExtensions = join(signingDirectory, "local-codesign.ext");
const leafBundle = join(signingDirectory, "local-codesign.p12");
const serialFile = join(signingDirectory, "local-root.srl");
const bundlePassword = randomBytes(32).toString("hex");

writeFileSync(
  leafExtensions,
  [
    "basicConstraints=critical,CA:FALSE",
    "keyUsage=critical,digitalSignature",
    "extendedKeyUsage=critical,codeSigning",
    "subjectKeyIdentifier=hash",
    "authorityKeyIdentifier=keyid,issuer",
    "",
  ].join("\n"),
  { mode: 0o600 },
);

try {
  run("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:3072",
    "-sha256",
    "-days",
    "3650",
    "-nodes",
    "-subj",
    "/CN=Better Skill Recorder Local Root/O=Local Development",
    "-addext",
    "basicConstraints=critical,CA:TRUE,pathlen:0",
    "-addext",
    "keyUsage=critical,keyCertSign,cRLSign",
    "-addext",
    "subjectKeyIdentifier=hash",
    "-keyout",
    rootKey,
    "-out",
    rootCertificate,
  ]);
  run("openssl", [
    "req",
    "-new",
    "-newkey",
    "rsa:3072",
    "-sha256",
    "-nodes",
    "-subj",
    `/CN=${LOCAL_MACOS_SIGNING_IDENTITY}/O=Local Development`,
    "-keyout",
    leafKey,
    "-out",
    leafRequest,
  ]);
  run("openssl", [
    "x509",
    "-req",
    "-in",
    leafRequest,
    "-CA",
    rootCertificate,
    "-CAkey",
    rootKey,
    "-CAcreateserial",
    "-days",
    "1825",
    "-sha256",
    "-extfile",
    leafExtensions,
    "-out",
    leafCertificate,
  ]);
  run("openssl", [
    "pkcs12",
    "-export",
    "-out",
    leafBundle,
    "-inkey",
    leafKey,
    "-in",
    leafCertificate,
    "-certfile",
    rootCertificate,
    "-name",
    LOCAL_MACOS_SIGNING_IDENTITY,
    "-passout",
    `pass:${bundlePassword}`,
  ]);

  console.log(
    "macOS may ask you to approve a Keychain trust change for the local development root.",
  );
  run(
    "/usr/bin/security",
    [
      "add-trusted-cert",
      "-r",
      "trustRoot",
      "-p",
      "codeSign",
      "-k",
      defaultKeychain,
      rootCertificate,
    ],
    { inherit: true },
  );
  run(
    "/usr/bin/security",
    [
      "import",
      leafBundle,
      "-k",
      defaultKeychain,
      "-f",
      "pkcs12",
      "-P",
      bundlePassword,
      "-T",
      "/usr/bin/codesign",
    ],
    { inherit: true },
  );

  const identityHash = findLocalSigningIdentity();
  if (!identityHash) {
    throw new Error(
      "The certificate was imported but macOS does not report a valid code-signing identity.",
    );
  }
  console.log(
    `${LOCAL_MACOS_SIGNING_IDENTITY} is ready (${identityHash}).`,
  );
} finally {
  for (const sensitiveFile of [
    rootKey,
    leafKey,
    leafRequest,
    leafExtensions,
    leafBundle,
    serialFile,
  ]) {
    rmSync(sensitiveFile, { force: true });
  }
}

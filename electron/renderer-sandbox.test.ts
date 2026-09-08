import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readBoundedAudio } from "./audio/bounded-read";
import { markProcessing, finishProcessing, pendingProcessing } from "./recorder/processing-journal";
import { ipcMain, type BrowserWindow } from "electron";
import { applicationIpc, trustApplicationWindow } from "./trusted-ipc";
import { DEFAULT_APP_SETTINGS, validateAppSettings, reservedShortcutReason } from "../common/app-settings";
import { recordingExpired, cleanExpiredRecordings } from "./recording-retention";
import { applyShortcutSettings } from "./shortcut-settings";

test("global settings validate numeric boundaries and modifier keys", () => {
  for (const recordingRetentionDays of [0, 3651, 1.5]) assert.throws(() => validateAppSettings({ ...DEFAULT_APP_SETTINGS, recordingRetentionDays }));
  assert.ok(reservedShortcutReason("Shift+Command+R"));
  for (const recordingShortcut of ["Command+Shift+R", "Command+C", "Command+Q", "Command+Shift+5", "Command+Alt+I"]) assert.throws(() => validateAppSettings({ ...DEFAULT_APP_SETTINGS, recordingShortcut }), /Reserved shortcut/);
  assert.equal(reservedShortcutReason("Alt+Shift+R"), null);
  assert.deepEqual(validateAppSettings(DEFAULT_APP_SETTINGS), DEFAULT_APP_SETTINGS);
  for (const minimumRecordingSeconds of [0, 101, 2.5, NaN]) assert.throws(() => validateAppSettings({ ...DEFAULT_APP_SETTINGS, minimumRecordingSeconds }));
  for (const maximumAudioMB of [9, 1001, 10.5]) assert.throws(() => validateAppSettings({ ...DEFAULT_APP_SETTINGS, maximumAudioMB }));
  for (const recordingShortcut of ["R", "Shift+R", "Alt+Alt+R", "bad"]) assert.throws(() => validateAppSettings({ ...DEFAULT_APP_SETTINGS, recordingShortcut }));
  assert.equal(validateAppSettings({ ...DEFAULT_APP_SETTINGS, minimumRecordingSeconds: 1, maximumAudioMB: 1000 }).maximumAudioMB, 1000);
});

test("retention boundaries exclude unfinished, future and invalid recordings", () => {
  const now = 100 * 86_400_000;
  assert.equal(recordingExpired(now - 30 * 86_400_000, 30, now), true);
  assert.equal(recordingExpired(now - 30 * 86_400_000 + 1, 30, now), false);
  for (const date of [null, 0, NaN, Infinity, now + 1]) assert.equal(recordingExpired(date, 30, now), false);
});

test("retention only trashes expired idle finalized sessions", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "retention-test-"));
  try {
    for (const id of ["expired", "busy", "pending", "recent", "unfinished"]) {
      await mkdir(path.join(root, id));
      await writeFile(path.join(root, id, "session.json"), JSON.stringify({ id, stoppedAt: id === "unfinished" ? null : id === "recent" ? 99 * 86_400_000 : 1 }));
    }
    await writeFile(path.join(root, "pending", ".processing-pending"), "1");
    const paths: string[] = [];
    const removed = await cleanExpiredRecordings(root, 30, id => id === "busy", async dir => { paths.push(dir); }, 100 * 86_400_000);
    assert.deepEqual(removed, ["expired"]);
    assert.deepEqual(paths, [path.join(root, "expired")]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("shortcut conflicts and persistence failures keep the previous binding", () => {
  const old = DEFAULT_APP_SETTINGS;
  const next = { ...old, recordingShortcut: "Control+Alt+R" };
  const keys = new Set([old.recordingShortcut]);
  let conflict = true;
  const registry = { isRegistered: (key: string) => keys.has(key), register: (key: string) => { if (conflict) return false; keys.add(key); return true; }, unregister: (key: string) => { keys.delete(key); } };
  let saved = false;
  assert.throws(() => applyShortcutSettings(next, old, registry, () => {}, () => { saved = true; }), /conflicts/);
  assert.equal(saved, false);
  assert.deepEqual([...keys], [old.recordingShortcut]);
  conflict = false;
  assert.throws(() => applyShortcutSettings(next, old, registry, () => {}, () => { throw new Error("disk full"); }), /disk full/);
  assert.deepEqual([...keys], [old.recordingShortcut]);
  applyShortcutSettings(next, old, registry, () => {}, () => { saved = true; });
  assert.equal(saved, true);
  assert.deepEqual([...keys], [next.recordingShortcut]);
});
import test from "node:test";

const windowSources = [
  "electron/window.ts",
  "electron/video/recorder.ts",
  "electron/audio/recorder.ts",
  "electron/audio/decode.ts",
];

test("every renderer BrowserWindow explicitly enables the Chromium sandbox", async () => {
  for (const sourcePath of windowSources) {
    const source = await readFile(sourcePath, "utf8");
    const browserWindows = source.match(/new BrowserWindow\s*\(\s*\{/g) ?? [];
    const sandboxedWindows = source.match(/sandbox:\s*true/g) ?? [];

    assert.ok(browserWindows.length > 0, `${sourcePath} must create a BrowserWindow`);
    assert.equal(
      sandboxedWindows.length,
      browserWindows.length,
      `${sourcePath} must explicitly sandbox every BrowserWindow`,
    );
    assert.doesNotMatch(source, /sandbox:\s*false/);
  }
});

test("sandboxed preloads do not import Node file-system modules", async () => {
  const source = await readFile("electron/audio/capture-preload.cjs", "utf8");

  assert.doesNotMatch(source, /node:fs|require\(["']fs(?:\/promises)?["']\)/);
  assert.match(source, /encoded instanceof Uint8Array/);
});

test("development startup never disables Chromium's sandbox", async () => {
  const source = await readFile("vite.config.ts", "utf8");

  assert.doesNotMatch(source, /--no-sandbox|--disable-setuid-sandbox/);
});

test("bounded audio rejects empty and oversized files and reads a valid file", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "recorder-audio-test-"));
  try {
    const file = path.join(dir, "audio");
    await writeFile(file, "");
    await assert.rejects(readBoundedAudio(file, 4), /size is invalid/);
    await writeFile(file, "12345");
    await assert.rejects(readBoundedAudio(file, 4), /size is invalid/);
    await writeFile(file, "1234");
    assert.equal((await readBoundedAudio(file, 4)).toString(), "1234");
    await assert.rejects(readBoundedAudio(dir, 4));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("processing journal survives interrupted work and ignores live or finished sessions", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "recorder-journal-test-"));
  try {
    const dir = path.join(root, "session");
    await mkdir(dir);
    await writeFile(path.join(dir, "session.json"), JSON.stringify({ stoppedAt: null }));
    assert.deepEqual(pendingProcessing(root), []);
    await writeFile(path.join(dir, "session.json"), JSON.stringify({ stoppedAt: 42 }));
    assert.deepEqual(pendingProcessing(root), [dir]);
    markProcessing(dir);
    await writeFile(path.join(dir, "bundle.json"), "{}");
    assert.deepEqual(pendingProcessing(root), [dir]); // interrupted after bundle, before narration
    finishProcessing(dir);
    assert.deepEqual(pendingProcessing(root), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("public IPC rejects foreign windows, child frames and navigated documents", () => {
  let handler: (...args: any[]) => unknown = () => undefined;
  const original = ipcMain.handle;
  ipcMain.handle = (_channel, listener) => { handler = listener; };
  try {
    const frame = { url: "file:///app/index.html#library" };
    const navigation = new Map<string, (e: any) => void>();
    let popup: (() => { action: string }) | undefined;
    const sender = { mainFrame: frame, isDestroyed: () => false,
      on: (name: string, cb: (e: any) => void) => navigation.set(name, cb),
      setWindowOpenHandler: (cb: typeof popup) => { popup = cb; } };
    trustApplicationWindow({ webContents: sender } as unknown as BrowserWindow, "file:///app/index.html");
    applicationIpc.handle("test", () => "ok");
    assert.equal(handler({ sender, senderFrame: frame }), "ok");
    assert.throws(() => handler({ sender: {}, senderFrame: frame }), /Untrusted/);
    assert.throws(() => handler({ sender, senderFrame: { ...frame } }), /Untrusted/);
    frame.url = "https://example.com/";
    assert.throws(() => handler({ sender, senderFrame: frame }), /Untrusted/);
    assert.equal(popup?.().action, "deny");
    let prevented = false;
    navigation.get("will-navigate")?.({ preventDefault: () => { prevented = true; } });
    assert.equal(prevented, true);
  } finally { ipcMain.handle = original; }
});

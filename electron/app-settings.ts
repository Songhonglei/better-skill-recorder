import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import path from "node:path";
import { app } from "electron";
import { DEFAULT_APP_SETTINGS, reservedShortcutReason, validateAppSettings, type AppSettings } from "../common/app-settings";

let current: AppSettings | undefined;
const settingsFile = () => path.join(app.getPath("userData"), "app-settings.json");
export function appSettings(): AppSettings {
  if (!current) {
    current = { ...DEFAULT_APP_SETTINGS };
    try {
      if (existsSync(settingsFile())) {
        const raw = JSON.parse(readFileSync(settingsFile(), "utf8"));
        if (typeof raw.recordingShortcut === "string" && reservedShortcutReason(raw.recordingShortcut)) raw.recordingShortcut = DEFAULT_APP_SETTINGS.recordingShortcut;
        current = validateAppSettings(raw);
      }
    } catch (error) { console.warn("Invalid global settings; using defaults", error); }
  }
  return { ...current };
}
export function saveAppSettings(value: unknown): AppSettings {
  const next = validateAppSettings(value);
  const file = settingsFile();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify(next, null, 2), { mode: 0o600 });
  renameSync(`${file}.tmp`, file);
  current = next;
  return appSettings();
}

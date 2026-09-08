export interface AppSettings {
  minimumRecordingSeconds: number;
  maximumAudioMB: number;
  recordingShortcut: string;
  recordingRetentionDays: number;
}
export const DEFAULT_APP_SETTINGS: AppSettings = {
  minimumRecordingSeconds: 5,
  maximumAudioMB: 100,
  recordingShortcut: "Alt+Shift+R",
  recordingRetentionDays: 30,
};
export function canonicalShortcut(key: string): string {
  const parts = key.split("+");
  return [...["Command", "Control", "Alt", "Shift"].filter(p => parts.includes(p)), parts.at(-1)].join("+");
}
/** Conservative app policy, based on Apple and Chrome's shortcut references. */
export function reservedShortcutReason(key: string): string | null {
  const k = canonicalShortcut(key);
  if (["Command+R", "Command+Shift+R", "Command+Alt+R", "Control+R", "Control+Shift+R"].includes(k)) return "刷新页面 / Refresh page";
  if (/^(Command|Control)\+(A|C|X|V|Z|Y|S|O|P|F|G|N|T|W|Q|L|H|M|D|J|B|[0-9])$/.test(k)) return "常用编辑、窗口或浏览器操作 / Standard app shortcut";
  if (/^(Command|Control)\+Shift\+(Z|V|S|N|T|W|Q|G|P|B|D|J|H|[345])$/.test(k)) return "常用应用操作或系统截图 / App or screenshot shortcut";
  if (["Command+Alt+I", "Command+Alt+J", "Command+Alt+C", "Control+Shift+I", "Control+Shift+J", "Control+Shift+C", "Command+Control+Q", "Command+Control+F", "Command+Alt+H", "Command+Alt+M", "Command+Alt+W", "Command+Alt+Shift+V", "Command+Alt+Shift+Q"].includes(k)) return "系统操作或开发者工具 / System or developer tools";
  return null;
}
export function validateAppSettings(value: unknown): AppSettings {
  const v = value as AppSettings;
  if (!v || !Number.isInteger(v.minimumRecordingSeconds) || v.minimumRecordingSeconds < 1 || v.minimumRecordingSeconds > 100)
    throw new Error("Minimum recording duration must be 1–100 seconds");
  if (!Number.isInteger(v.maximumAudioMB) || v.maximumAudioMB < 10 || v.maximumAudioMB > 1000)
    throw new Error("Maximum audio size must be 10–1000 MB");
  const retention = v.recordingRetentionDays ?? 30;
  if (!Number.isInteger(retention) || retention < 1 || retention > 3650) throw new Error("Recording retention must be 1–3650 days");
  if (typeof v.recordingShortcut !== "string" || !/^(?:(?:Command|Control|Alt|Shift)\+)+[A-Z0-9]$/.test(v.recordingShortcut))
    throw new Error("Use modifiers and a letter or number for the shortcut");
  const parts = v.recordingShortcut.split("+");
  if (new Set(parts).size !== parts.length || !parts.some(p => ["Command", "Control", "Alt"].includes(p)))
    throw new Error("Use Command, Control or Option with a letter or number");
  const reason = reservedShortcutReason(v.recordingShortcut);
  if (reason) throw new Error(`禁用快捷键 / Reserved shortcut: ${reason}`);
  return { minimumRecordingSeconds: v.minimumRecordingSeconds, maximumAudioMB: v.maximumAudioMB, recordingShortcut: canonicalShortcut(v.recordingShortcut), recordingRetentionDays: retention };
}

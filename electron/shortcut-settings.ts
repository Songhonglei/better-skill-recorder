import { validateAppSettings, type AppSettings } from "../common/app-settings";
interface ShortcutRegistry {
  isRegistered(key: string): boolean;
  register(key: string, callback: () => void): boolean;
  unregister(key: string): void;
}
export function applyShortcutSettings(input: unknown, previous: AppSettings, registry: ShortcutRegistry, callback: () => void, persist: (next: AppSettings) => void): AppSettings {
  const next = validateAppSettings(input);
  const changed = next.recordingShortcut !== previous.recordingShortcut;
  if ((changed || !registry.isRegistered(next.recordingShortcut)) && !registry.register(next.recordingShortcut, callback))
    throw new Error("Shortcut is unavailable or conflicts with another app");
  try { persist(next); }
  catch (error) { if (changed) registry.unregister(next.recordingShortcut); throw error; }
  if (changed) registry.unregister(previous.recordingShortcut);
  return next;
}

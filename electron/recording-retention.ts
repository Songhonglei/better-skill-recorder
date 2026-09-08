import { readdir, readFile, lstat } from "node:fs/promises";
import path from "node:path";

export function recordingExpired(stoppedAt: unknown, days: number, now: number): boolean {
  return typeof stoppedAt === "number" && Number.isFinite(stoppedAt) && stoppedAt > 0 &&
    Number.isInteger(days) && days >= 1 && days <= 3650 && stoppedAt <= now - days * 86_400_000;
}
/** Only finalized, direct child session directories; never follow symlinks. */
export async function cleanExpiredRecordings(root: string, days: number, busy: (id: string) => boolean, trash: (dir: string) => Promise<void>, now = Date.now()): Promise<string[]> {
  const removed: string[] = [];
  const entries = await readdir(root, { withFileTypes: true }).catch(error => { if (error.code === "ENOENT") return []; throw error; });
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(entry.name) || entry.name.includes("..")) continue;
    const dir = path.join(root, entry.name);
    try {
      const metaFile = path.join(dir, "session.json");
      if (!(await lstat(metaFile)).isFile()) continue;
      const meta = JSON.parse(await readFile(metaFile, "utf8"));
      if (meta.id !== entry.name || !recordingExpired(meta.stoppedAt, days, now)) continue;
      if (await lstat(path.join(dir, ".processing-pending")).then(() => true, () => false)) continue;
      if (busy(entry.name)) continue;
      await trash(dir);
      removed.push(entry.name);
    } catch (error) { console.warn("Retention skipped session", entry.name, error); }
  }
  return removed;
}

import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

const MARKER = ".processing-pending";
export function markProcessing(dir: string): void {
  writeFileSync(path.join(dir, MARKER), "1\n", { mode: 0o600 });
}
export function finishProcessing(dir: string): void {
  if (existsSync(path.join(dir, MARKER))) unlinkSync(path.join(dir, MARKER));
}
/** Recover only finalized local recordings, never a live recording or a symlink. */
export function pendingProcessing(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory()) return [];
    const dir = path.join(root, entry.name);
    try {
      const meta = JSON.parse(readFileSync(path.join(dir, "session.json"), "utf8"));
      if (!meta.stoppedAt) return [];
      return existsSync(path.join(dir, MARKER)) || !existsSync(path.join(dir, "bundle.json")) ? [dir] : [];
    } catch { return []; }
  });
}

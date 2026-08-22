import path from "node:path";
import { fileURLToPath } from "node:url";

import { nativeImage } from "electron";

/**
 * Runtime icon assets are copied next to the bundled main process into
 * `dist-electron/assets/icons` (see `copyStaticAssets` in vite.config.ts), so
 * they resolve identically in `vite dev` and in a packaged build.
 *
 * The app uses a single static identity: the teal three-stage signal mark with a
 * small coral capture light. The menu-bar glyph stays deliberately simpler.
 */
const dirname = path.dirname(fileURLToPath(import.meta.url));
const ICON_DIR = path.join(dirname, "assets", "icons");

const iconFile = (name: string): string => path.join(ICON_DIR, name);

function load(name: string): Electron.NativeImage | null {
  const image = nativeImage.createFromPath(iconFile(name));
  return image.isEmpty() ? null : image;
}

/**
 * Tray glyph for the menu bar / notification area. macOS uses the fixed-red
 * recording glyph (kept as a colour image, not a template, so it stays red);
 * elsewhere we reuse the full-colour app tile, sized down.
 */
export function trayIcon(): Electron.NativeImage | null {
  if (process.platform === "darwin") {
    return load("tray-active.png");
  }
  const tile = load("app-active.png");
  return tile ? tile.resize({ width: 32, height: 32 }) : null;
}

/** Full-resolution Better Skill Recorder identity used to drive the macOS Dock icon. */
export function dockIcon(): Electron.NativeImage | null {
  if (process.platform !== "darwin") return null;
  return load("app-active.png");
}

/**
 * Window icon for Windows/Linux (taskbar + title bar). macOS returns undefined
 * because it draws windows from the app bundle / Dock icon instead.
 */
export function windowIcon(): Electron.NativeImage | undefined {
  if (process.platform === "darwin") return undefined;
  return load("app-active.png") ?? undefined;
}

/**
 * Convert an Electron ASAR virtual path into the real path used for an unpacked
 * executable. Electron's filesystem layer can read `app.asar/...`, but the OS
 * process launcher cannot execute a child binary through that virtual archive.
 */
export function executablePathForSpawn(resolvedPath: string): string {
  return resolvedPath.replace(
    /([\\/])app\.asar([\\/])/u,
    "$1app.asar.unpacked$2",
  );
}

import { open } from "node:fs/promises";

/** Stat and read the same file handle; never allocate from an unchecked size. */
export async function readBoundedAudio(file: string, limit: number): Promise<Buffer> {
  const handle = await open(file, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size <= 0 || stat.size > limit) {
      throw new Error(`Narration audio size is invalid: ${stat.size} bytes`);
    }
    const data = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < data.length) {
      const { bytesRead } = await handle.read(data, offset, data.length - offset, offset);
      if (!bytesRead) throw new Error("Narration audio changed while being read");
      offset += bytesRead;
    }
    const extra = Buffer.alloc(1);
    if ((await handle.read(extra, 0, 1, offset)).bytesRead) {
      throw new Error("Narration audio changed while being read");
    }
    return data;
  } finally {
    await handle.close();
  }
}

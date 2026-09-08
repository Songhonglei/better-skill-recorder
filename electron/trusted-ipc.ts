import { ipcMain, type BrowserWindow, type WebContents, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";

const trusted = new WeakMap<WebContents, string>();
const documentUrl = (url: string) => url.split("#", 1)[0];

/** Only our UI's top frame may use the public application bridge. */
export function trustApplicationWindow(win: BrowserWindow, url: string): void {
  trusted.set(win.webContents, documentUrl(url));
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.webContents.on("will-redirect", (event) => event.preventDefault());
  win.webContents.on("will-attach-webview", (event) => event.preventDefault());
}

function allowed(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  const expected = trusted.get(event.sender);
  return expected !== undefined && !event.sender.isDestroyed() &&
    event.senderFrame === event.sender.mainFrame &&
    documentUrl(event.senderFrame.url) === expected;
}

export const applicationIpc = {
  handle: ((channel, listener) => ipcMain.handle(channel, (event, ...args) => {
    if (!allowed(event)) throw new Error("Untrusted IPC sender");
    return listener(event, ...args);
  })) as typeof ipcMain.handle,
  on: ((channel, listener) => ipcMain.on(channel, (event, ...args) => {
    if (allowed(event)) listener(event, ...args);
  })) as typeof ipcMain.on,
};

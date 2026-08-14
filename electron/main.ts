import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  safeStorage,
  screen,
  shell,
} from "electron";
import path from "node:path";

import { FULL_CAPTURE } from "../common/config";
import { IPC, type RecorderStatus, type StartResult } from "../common/ipc";
import { createCollectors } from "./collectors";
import { installCrashGuards } from "./crash-guards";
import { Describer } from "./describer/describer";
import {
  createAgentRuntimeFactoryFromConfig,
  type AgentRuntimeConfiguration,
} from "./agent-runtime/runtime-factory";
import { AgentSettingsStore } from "./agent-runtime/settings-store";
import { processSession } from "./pipeline";
import { registerIpc } from "./ipc";
import { createLogger } from "./logger";
import { NarrationManager } from "./narration/manager";
import { SensitiveModelManager } from "./sensitive/model-manager";
import { RecorderController } from "./recorder/controller";
import { RecordingPrivacySession } from "./recording-privacy";
import { deleteSession } from "./sessions";
import { SkillBuilder } from "./skillbuilder/builder";
import { AutomationBuilder } from "./automationbuilder/builder";
import { createTray } from "./tray";
import { dockIcon } from "./icons";
import { AudioRecorder } from "./audio/recorder";
import { VideoRecorder } from "./video/recorder";
import { ScreenSourceService } from "./video/sources";
import {
  clampRecordingControlsWindow,
  createLibraryWindow,
  createRecorderWindow,
  createRecordingControlsWindow,
  fitRecorderHeight,
  redockLibrary,
  setRecordingControlsExpanded,
} from "./window";

const log = createLogger("Main");

// Contain stray async failures so a lost stream error can't crash the main
// process (and the recording in progress). Registered before any window/IO work.
installCrashGuards(log);

/** Static red-dot tile used for the macOS Dock icon. */
const dock = dockIcon();

let recorderWindow: BrowserWindow | null = null;
let libraryWindow: BrowserWindow | null = null;
let recordingControlsWindow: BrowserWindow | null = null;
let recorderHome: Electron.Rectangle | null = null;
let controlsExpanded = false;
let quitReady = false;
let quitTask: Promise<void> | null = null;
let recordingStartPending = false;
let providerChangePending = false;
let agentSettings: AgentSettingsStore | null = null;
let describer: Describer;
let builder: SkillBuilder;
let automationBuilder: AutomationBuilder;
const recordingPrivacy = new RecordingPrivacySession();
const narration = new NarrationManager((status) =>
  broadcast(IPC.narrationStatusChanged, status),
);
const sensitiveModels = new SensitiveModelManager((status) =>
  broadcast(IPC.sensitiveStatusChanged, status),
);
const microphones = new AudioRecorder((status) =>
  broadcast(IPC.microphoneSettingsChanged, status),
);
const screens = new ScreenSourceService((status) =>
  broadcast(IPC.screenSettingsChanged, status),
);
const recorder = new RecorderController({
  resolveConfig: () => ({ ...FULL_CAPTURE }),
  buildCollectors: createCollectors,
  createVideoRecorder: () => new VideoRecorder(),
  createAudioRecorder: (onCaptureEnded) =>
    microphones.createSession(onCaptureEnded),
  deleteSession,
  postProcess: async (dir) => {
    await processSession(dir);
    try {
      await narration.transcribeIfCached(dir);
    } catch (err) {
      log.warn("Cached narration processing failed:", err);
    }
  },
});

async function startRecording(): Promise<StartResult> {
  if (recordingStartPending) {
    return { ok: false, error: "Recording is already starting." };
  }
  recordingStartPending = true;
  try {
    await Promise.all([
      microphones.whenSettingsSettled(),
      screens.whenSettingsSettled(),
    ]);
    const screenOptions = await screens.startOptions();
    return await recorder.start({
      ...microphones.startOptions(),
      ...screenOptions,
    });
  } finally {
    recordingStartPending = false;
  }
}

/** Send an event to every live window (recorder HUD + library, if open). */
function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function agentWorkIsBusy(): boolean {
  return describer?.isBusy() || builder?.isBusy() || automationBuilder?.isBusy() || false;
}

async function applyAgentConfiguration(config: AgentRuntimeConfiguration): Promise<void> {
  if (providerChangePending) throw new Error("A model change is already in progress.");
  if (agentWorkIsBusy()) {
    throw new Error("Wait for the current analysis or build to finish before changing models.");
  }
  providerChangePending = true;
  const runtimes = createAgentRuntimeFactoryFromConfig(config);
  try {
    await Promise.all([
      describer.replaceRuntime(runtimes.create("Describer")),
      builder.replaceRuntime(runtimes.create("SkillBuilder")),
      automationBuilder.replaceRuntime(runtimes.create("AutomationBuilder")),
    ]);
  } finally {
    providerChangePending = false;
  }
}

async function testAgentConfiguration(config: AgentRuntimeConfiguration): Promise<string> {
  const factory = createAgentRuntimeFactoryFromConfig(config);
  const runtime = factory.create("SettingsProbe");
  try {
    await runtime.checkConnection();
    if (runtime.id === "copilot") return "Copilot is ready.";
    let called = false;
    const vision = runtime.capabilities.vision;
    const session = await runtime.createSession({
      systemInstructions:
        vision
          ? "This is a connection test. First call provider_probe_image by itself. After the image result arrives, call provider_probe_done. Return no prose."
          : "This is a connection test. You must call provider_probe_done exactly once and return no prose.",
      tools: [
        ...(vision ? [{
          name: "provider_probe_image",
          description: "Return a harmless one-pixel PNG to verify image tool-result transport.",
          parameters: { type: "object", properties: {}, additionalProperties: false },
          handler: () => ({
            resultType: "success" as const,
            textResultForLlm: "The visual transport probe is attached. Call provider_probe_done now.",
            binaryResultsForLlm: [{
              type: "image" as const,
              mimeType: "image/png",
              data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4xQAAAAASUVORK5CYII=",
            }],
          }),
        }] : []),
        {
          name: "provider_probe_done",
          description: "Confirm that OpenAI-compatible function calling works.",
          parameters: { type: "object", properties: {}, additionalProperties: false },
          completesRun: true,
          handler: () => {
            called = true;
            return "Connection and tool calling confirmed.";
          },
        },
      ],
    });
    try {
      await session.run(
        vision
          ? "Run the two-stage tool and visual transport probe now."
          : "Call provider_probe_done now.",
        { timeoutMs: 30_000 },
      );
    } finally {
      await session.dispose().catch(() => undefined);
    }
    if (!called) {
      throw new Error("The endpoint replied, but the model did not call the required tool.");
    }
    return vision
      ? "Endpoint, authentication, tool calling, and image transport are ready."
      : "Endpoint, model, authentication, and tool calling are ready.";
  } finally {
    await runtime.dispose().catch(() => undefined);
  }
}

/** Open, focus, and re-dock the Sessions library window (creating it lazily). */
function openLibrary(): void {
  if (recorder.state === "recording") return;
  if (!recorderWindow || recorderWindow.isDestroyed()) return;
  if (libraryWindow && !libraryWindow.isDestroyed()) {
    redockLibrary(recorderWindow, libraryWindow);
    libraryWindow.show();
    libraryWindow.focus();
    return;
  }
  recorderHome = recorderWindow.getBounds();
  libraryWindow = createLibraryWindow(recorderWindow);
  libraryWindow.on("closed", () => {
    libraryWindow = null;
    // Return the recorder to where it sat before it made room for the library.
    if (recorderWindow && !recorderWindow.isDestroyed() && recorderHome) {
      recorderWindow.setBounds(recorderHome);
    }
    recorderHome = null;
    // Drop idle agent conversations now that the library is gone.
    void describer.evictIdle();
    void builder.evictIdle();
    void automationBuilder.evictIdle();
  });
}

function ensureRecordingControlsWindow(): BrowserWindow {
  if (recordingControlsWindow && !recordingControlsWindow.isDestroyed()) {
    return recordingControlsWindow;
  }
  controlsExpanded = false;
  recordingControlsWindow = createRecordingControlsWindow();
  recordingControlsWindow.on("closed", () => {
    recordingControlsWindow = null;
    controlsExpanded = false;
  });
  return recordingControlsWindow;
}

function showRecordingControls(): void {
  const win = ensureRecordingControlsWindow();
  clampRecordingControlsWindow(win);
  if (!win.isVisible()) win.showInactive();
  win.moveTop();
}

function showRecorderWindow(): BrowserWindow {
  if (!recorderWindow || recorderWindow.isDestroyed()) {
    recorderWindow = createRecorderWindow();
  }
  recorderWindow.show();
  recorderWindow.focus();
  return recorderWindow;
}

function showRecordingPrivacyWarning(): void {
  const win = showRecorderWindow();
  const notify = () => {
    if (!win.isDestroyed()) win.webContents.send(IPC.recordingPrivacyWarningRequested);
  };
  if (win.webContents.isLoading()) {
    win.webContents.once("did-finish-load", notify);
  } else {
    notify();
  }
}

async function requestStartRecording(): Promise<StartResult> {
  if (recordingPrivacy.startDecision() === "start") return startRecording();
  showRecordingPrivacyWarning();
  return { ok: false, privacyWarningRequired: true };
}

/** Keep the full HUD and compact overlay mutually exclusive. */
function syncRecordingWindows(status: RecorderStatus): void {
  if (status.state === "recording") {
    if (libraryWindow && !libraryWindow.isDestroyed()) libraryWindow.close();
    if (recorderWindow && !recorderWindow.isDestroyed()) recorderWindow.hide();
    showRecordingControls();
    return;
  }
  // A start emits an idle/starting status before the session folder exists.
  if (status.transition === "starting") return;

  if (recordingControlsWindow && !recordingControlsWindow.isDestroyed()) {
    const controls = recordingControlsWindow;
    if (controlsExpanded) {
      setRecordingControlsExpanded(controls, false);
      controlsExpanded = false;
    }
    controls.hide();
    // Let an overlay-originated stop/discard IPC reply reach its renderer before
    // tearing that renderer down. A recording restarted in the same turn reuses it.
    setTimeout(() => {
      if (
        recorder.state === "idle" &&
        recordingControlsWindow === controls &&
        !controls.isDestroyed()
      ) {
        controls.destroy();
        recordingControlsWindow = null;
      }
    }, 500);
  }
  if (recorderWindow && !recorderWindow.isDestroyed()) {
    const wasHidden = !recorderWindow.isVisible();
    recorderWindow.show();
    if (wasHidden) recorderWindow.focus();
  }
}

function clampControlsToDisplay(): void {
  if (recordingControlsWindow && !recordingControlsWindow.isDestroyed()) {
    clampRecordingControlsWindow(recordingControlsWindow);
  }
}

app.whenReady().then(async () => {
  if (process.platform === "win32") Menu.setApplicationMenu(null);
  if (dock && app.dock) app.dock.setIcon(dock);

  const userData = app.getPath("userData");
  const configuredPath = process.env.SKILL_RECORDER_CONFIG_FILE?.trim();
  agentSettings = new AgentSettingsStore({
    configPath: configuredPath
      ? path.resolve(configuredPath)
      : path.join(userData, "agent-provider.json"),
    secretPath: path.join(userData, "agent-provider.secrets.json"),
    codec: {
      available: () =>
        safeStorage.isEncryptionAvailable() &&
        safeStorage.getSelectedStorageBackend() !== "basic_text",
      encrypt: (value) => safeStorage.encryptString(value),
      decrypt: (value) => safeStorage.decryptString(value),
    },
  });
  const agentRuntimes = createAgentRuntimeFactoryFromConfig(
    agentSettings.runtimeConfiguration(),
  );
  describer = new Describer(
    (progress) => broadcast(IPC.analyzeProgress, progress),
    agentRuntimes.create("Describer"),
  );
  builder = new SkillBuilder(
    (progress) => broadcast(IPC.skillProgress, progress),
    agentRuntimes.create("SkillBuilder"),
  );
  automationBuilder = new AutomationBuilder(
    (progress) => broadcast(IPC.automationProgress, progress),
    agentRuntimes.create("AutomationBuilder"),
  );

  narration.initialize();
  try {
    await microphones.initialize();
  } catch (error) {
    log.warn(
      "Microphone service initialization failed:",
      error instanceof Error ? error.message : error,
    );
  }
  try {
    await screens.initialize();
  } catch (error) {
    log.warn(
      "Screen source initialization failed:",
      error instanceof Error ? error.message : error,
    );
  }
  registerIpc(
    recorder,
    describer,
    builder,
    automationBuilder,
    narration,
    microphones,
    screens,
    sensitiveModels,
    () => recordingStartPending,
  );
  sensitiveModels.initialize();
  ipcMain.handle(IPC.start, () => requestStartRecording());
  ipcMain.handle(IPC.startConfirmed, () => startRecording());
  ipcMain.handle(IPC.recordingPrivacyReviewed, () => recordingPrivacy.markReviewed());
  log.info("Capture: recording all sources");

  ipcMain.handle(IPC.openLibrary, () => openLibrary());
  ipcMain.handle(IPC.closeLibrary, () => {
    if (libraryWindow && !libraryWindow.isDestroyed()) libraryWindow.close();
  });
  ipcMain.handle(IPC.recordingControlsExpanded, (event, expanded: boolean) => {
    const win = recordingControlsWindow;
    if (
      !win ||
      win.isDestroyed() ||
      event.sender !== win.webContents ||
      typeof expanded !== "boolean" ||
      recorder.state !== "recording"
    ) {
      return;
    }
    controlsExpanded = expanded;
    setRecordingControlsExpanded(win, expanded);
  });
  ipcMain.on(IPC.fitRecorderHeight, (event, height: unknown) => {
    const win = recorderWindow;
    if (
      !win ||
      win.isDestroyed() ||
      event.sender !== win.webContents ||
      typeof height !== "number"
    ) {
      return;
    }
    fitRecorderHeight(win, height);
  });

  ipcMain.handle(IPC.agentSettings, () => agentSettings!.snapshot());
  ipcMain.handle(IPC.agentSettingsSave, async (_event, input) => {
    try {
      if (providerChangePending || agentWorkIsBusy()) {
        throw new Error("Wait for the current analysis or build to finish before changing models.");
      }
      agentSettings!.preview(input);
      const settings = agentSettings!.save(input);
      await applyAgentConfiguration(agentSettings!.runtimeConfiguration());
      broadcast(IPC.agentSettingsChanged, settings);
      return { ok: true, settings };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle(IPC.agentSettingsTest, async (_event, input) => {
    const startedAt = Date.now();
    try {
      const message = await testAgentConfiguration(agentSettings!.preview(input));
      return { ok: true, message, latencyMs: Date.now() - startedAt };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - startedAt,
      };
    }
  });
  ipcMain.handle(IPC.agentSettingsReload, async () => {
    try {
      if (providerChangePending || agentWorkIsBusy()) {
        throw new Error("Wait for the current analysis or build to finish before changing models.");
      }
      const settings = agentSettings!.reload();
      if (settings.configError) throw new Error(settings.configError);
      await applyAgentConfiguration(agentSettings!.runtimeConfiguration());
      broadcast(IPC.agentSettingsChanged, settings);
      return { ok: true, settings };
    } catch (error) {
      return {
        ok: false,
        settings: agentSettings!.snapshot(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
  ipcMain.handle(IPC.agentSettingsReveal, async () => {
    try {
      const configPath = agentSettings!.snapshot().configPath;
      if (await shell.openPath(path.dirname(configPath))) {
        throw new Error("Could not open the configuration folder.");
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  recorder.onStatusChanged((status) => {
    broadcast(IPC.statusChanged, status);
    syncRecordingWindows(status);
  });
  recorderWindow = createRecorderWindow();

  const handleDisplayChange = () => {
    clampControlsToDisplay();
    void screens.refresh();
  };
  screen.on("display-added", handleDisplayChange);
  screen.on("display-removed", handleDisplayChange);
  screen.on("display-metrics-changed", handleDisplayChange);

  try {
    createTray(
      recorder,
      requestStartRecording,
      showRecorderWindow,
      showRecordingControls,
    );
  } catch (err) {
    log.warn("Tray unavailable:", err);
  }

  const toggle = () => {
    const status = recorder.status();
    if (status.transition !== "none") return;
    void (status.state === "recording" ? recorder.stop() : requestStartRecording());
  };
  if (!globalShortcut.register("CommandOrControl+Shift+R", toggle)) {
    log.warn("Global shortcut registration failed");
  }

  app.on("activate", () => {
    if (recorder.state === "recording") {
      showRecordingControls();
      return;
    }
    showRecorderWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", (event) => {
  if (quitReady) return;
  event.preventDefault();
  if (quitTask) return;
  recorder.beginShutdown();
  quitTask = (async () => {
    // stop() is serialized behind any start/mic/discard operation already in
    // flight, and is a harmless "Not recording" result when the app is idle.
    await recorder.stop();
    await recorder.whenProcessed();
  })()
    .catch((error) => {
      log.warn("graceful shutdown failed:", error);
    })
    .finally(() => {
      quitReady = true;
      app.quit();
    });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  void describer.dispose();
  void builder.dispose();
  void automationBuilder.dispose();
  microphones.dispose();
  void sensitiveModels.dispose();
});

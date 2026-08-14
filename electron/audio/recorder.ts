import { randomUUID } from "node:crypto";
import { createWriteStream, existsSync, type WriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, ipcMain, type IpcMainEvent } from "electron";

import {
  AUDIO_MANIFEST_VERSION,
  alignAudioSegmentsToVideo,
  type AudioManifestV2,
  type AudioSegment,
  type LegacyAudioMetadata,
} from "../../common/audio";
import type {
  MicrophonePermissionState,
  MicrophoneSettingsResult,
  MicrophoneSettingsStatus,
  StartOptions,
} from "../../common/ipc";
import {
  microphonePreference,
  resolveMicrophonePreference,
  SYSTEM_DEFAULT_MICROPHONE,
  SYSTEM_DEFAULT_MICROPHONE_ID,
  type MicrophoneDevice,
  type MicrophonePreference,
} from "../../common/microphone";
import type { NarrationLanguage } from "../../common/narration";
import { createLogger } from "../logger";
import type {
  AudioCaptureEnded,
  SessionAudioRecorder,
} from "../recorder/controller";

const log = createLogger("Narration/audio");
const dirname = path.dirname(fileURLToPath(import.meta.url));

/** Kept as a source-compatible name for readers of legacy `audio.json` files. */
export type AudioResult = LegacyAudioMetadata;

// Opus at 24 kbps mono is transparent for speech and keeps narration files tiny.
const BITS_PER_SECOND = 24_000;
const START_TIMEOUT_MS = 10_000;
const STOP_TIMEOUT_MS = 4_000;
const PROBE_TIMEOUT_MS = 10_000;
const AUDIO_DIR = "audio";
const PREFERENCES_FILE = "microphone-preferences.json";
const SERVICE_UNAVAILABLE = "The microphone service is unavailable.";

interface PendingSegment {
  id: string;
  file: string;
  relativeFile: string;
  stream: WriteStream;
  bytes: number;
  startEpoch: number | null;
  stopEpoch: number | null;
  failed: boolean;
  error: string | null;
  ended: boolean;
  stopRequested: boolean;
  requestedDeviceId: string;
  device: MicrophoneDevice | null;
  startedResolve: ((device: MicrophoneDevice) => void) | null;
  startedReject: ((error: Error) => void) | null;
  stoppedResolve: (() => void) | null;
}

interface StoredPreferences {
  narrationEnabled: boolean;
  microphone: MicrophonePreference;
}

interface ProbeOutcome {
  ok: boolean;
  error?: string;
}

interface PendingProbe {
  resolve: (outcome: ProbeOutcome) => void;
  timeout: NodeJS.Timeout;
}

/**
 * App-lifetime microphone service plus one-at-a-time session writer. Keeping the
 * hidden renderer alive makes device ids consistent between preflight selection
 * and the MediaRecorder stream that ultimately uses them.
 */
export class AudioRecorder {
  private win: BrowserWindow | null = null;
  private readyTask: Promise<void> | null = null;
  private disposed = false;
  private ipcRegistered = false;
  private preferencesLoaded = false;
  private preferencesFile = "";
  private preferenceWrites: Promise<void> = Promise.resolve();
  private preferences: StoredPreferences = {
    narrationEnabled: false,
    microphone: microphonePreference(SYSTEM_DEFAULT_MICROPHONE),
  };
  private permission: MicrophonePermissionState = "unknown";
  private devices: MicrophoneDevice[] = [SYSTEM_DEFAULT_MICROPHONE];
  private settingsError: string | null = null;
  private readonly probes = new Map<string, PendingProbe>();
  private readonly settingsOperations = new Set<Promise<unknown>>();

  private dir = "";
  private sessionStartedAt = 0;
  private narrationLanguage: NarrationLanguage = "en";
  private sequence = 0;
  private active: PendingSegment | null = null;
  private disableTask: Promise<AudioSegment | null> | null = null;
  private readonly segments: AudioSegment[] = [];
  private onCaptureEnded: (event: AudioCaptureEnded) => void = () => undefined;

  constructor(
    private readonly onSettingsChanged: (
      status: MicrophoneSettingsStatus,
    ) => void = () => undefined,
  ) {}

  createSession(
    onCaptureEnded: (event: AudioCaptureEnded) => void,
  ): SessionAudioRecorder {
    return {
      start: (sessionDir, sessionStartedAt, narrationLanguage) =>
        this.startSession(
          sessionDir,
          sessionStartedAt,
          narrationLanguage,
          onCaptureEnded,
        ),
      enable: (deviceId) => this.enable(deviceId),
      disable: () => this.disable(),
      finish: (videoStartEpoch) => this.finishSession(videoStartEpoch),
    };
  }

  async initialize(): Promise<void> {
    if (this.disposed) throw new Error("The microphone service has been disposed.");
    await this.loadPreferences();
    await this.ensureWindow();
    this.emitSettings();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const probe of this.probes.values()) {
      clearTimeout(probe.timeout);
      probe.resolve({ ok: false, error: "Better Skill Recorder is shutting down." });
    }
    this.probes.clear();
    if (this.ipcRegistered) {
      ipcMain.removeListener("audio:chunk", this.onChunk);
      ipcMain.removeListener("audio:started", this.onStarted);
      ipcMain.removeListener("audio:stopped", this.onStopped);
      ipcMain.removeListener("audio:error", this.onError);
      ipcMain.removeListener("audio:devices", this.onDevices);
      ipcMain.removeListener("audio:device-error", this.onDeviceError);
      ipcMain.removeListener("audio:probe-result", this.onProbeResult);
      this.ipcRegistered = false;
    }
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.win = null;
    this.readyTask = null;
  }

  settings(): MicrophoneSettingsStatus {
    const resolved = resolveMicrophonePreference(
      this.preferences.microphone,
      this.devices,
    );
    const preferredLabel =
      this.preferences.microphone.label || "Selected microphone";
    return {
      narrationEnabled: this.preferences.narrationEnabled,
      permission: this.permission,
      devices: this.devices.map((device) => ({ ...device })),
      preferredDeviceId: this.preferences.microphone.id,
      preferredDeviceLabel: preferredLabel,
      selectedDeviceId: resolved.device.id,
      selectedDeviceLabel: resolved.device.label,
      preferredDeviceUnavailable: resolved.unavailable,
      fallback: resolved.unavailable
        ? `${preferredLabel} is unavailable. System default will be used.`
        : null,
      error: this.settingsError,
    };
  }

  startOptions(): StartOptions {
    return {
      narration: this.preferences.narrationEnabled,
      microphoneDeviceId: this.effectiveDeviceId(),
    };
  }

  effectiveDeviceId(): string {
    return resolveMicrophonePreference(
      this.preferences.microphone,
      this.devices,
    ).device.id;
  }

  async setNarrationEnabled(
    enabled: boolean,
  ): Promise<MicrophoneSettingsResult> {
    return this.trackSettingsOperation(
      this.setNarrationEnabledInternal(enabled),
    );
  }

  selectDevice(deviceId: string): Promise<MicrophoneSettingsResult> {
    return this.trackSettingsOperation(this.selectDeviceInternal(deviceId));
  }

  async whenSettingsSettled(): Promise<void> {
    while (this.settingsOperations.size > 0) {
      await Promise.allSettled([...this.settingsOperations]);
    }
  }

  private async setNarrationEnabledInternal(
    enabled: boolean,
  ): Promise<MicrophoneSettingsResult> {
    try {
      await this.loadPreferences();
      if (enabled) await this.ensureWindow();
    } catch (error) {
      return this.settingsFailure(error);
    }

    if (enabled && !this.preferences.narrationEnabled) {
      const probe = await this.requestPermission();
      if (!probe.ok) {
        return {
          ok: false,
          status: this.settings(),
          error: probe.error ?? "Microphone permission was not granted.",
        };
      }
    }

    const previous = this.preferences.narrationEnabled;
    this.preferences.narrationEnabled = enabled;
    this.settingsError = null;
    try {
      await this.persistPreferences();
    } catch (error) {
      this.preferences.narrationEnabled = previous;
      return this.settingsFailure(error, "Could not save the narration preference");
    }
    this.emitSettings();
    return { ok: true, status: this.settings() };
  }

  private async selectDeviceInternal(
    deviceId: string,
  ): Promise<MicrophoneSettingsResult> {
    try {
      await this.initialize();
    } catch (error) {
      return this.settingsFailure(error);
    }

    const device = this.devices.find((candidate) => candidate.id === deviceId);
    if (!device) {
      const error = "That microphone is no longer available.";
      this.settingsError = error;
      this.emitSettings();
      return { ok: false, status: this.settings(), error };
    }

    const previous = this.preferences.microphone;
    this.preferences.microphone = microphonePreference(device);
    this.settingsError = null;
    try {
      await this.persistPreferences();
    } catch (error) {
      this.preferences.microphone = previous;
      return this.settingsFailure(error, "Could not save the microphone selection");
    }
    this.emitSettings();
    return { ok: true, status: this.settings() };
  }

  private trackSettingsOperation<T>(operation: Promise<T>): Promise<T> {
    this.settingsOperations.add(operation);
    void operation.then(
      () => this.settingsOperations.delete(operation),
      () => this.settingsOperations.delete(operation),
    );
    return operation;
  }

  private async startSession(
    sessionDir: string,
    sessionStartedAt: number,
    narrationLanguage: NarrationLanguage,
    onCaptureEnded: (event: AudioCaptureEnded) => void,
  ): Promise<void> {
    if (this.dir) throw new Error("Microphone recorder is already initialized.");
    await this.initialize();
    await mkdir(path.join(sessionDir, AUDIO_DIR), { recursive: true });
    this.dir = sessionDir;
    this.sessionStartedAt = sessionStartedAt;
    this.narrationLanguage = narrationLanguage;
    this.sequence = 0;
    this.segments.length = 0;
    this.onCaptureEnded = onCaptureEnded;
  }

  /** Request microphone access and begin a new independently timestamped segment. */
  private async enable(
    deviceId = SYSTEM_DEFAULT_MICROPHONE_ID,
  ): Promise<MicrophoneDevice> {
    if (!this.dir) {
      throw new Error("Microphone capture is not available for this recording.");
    }
    if (!this.win || this.win.isDestroyed()) {
      throw new Error("The microphone service is unavailable.");
    }
    if (this.active) throw new Error("Microphone capture is already active.");

    const number = ++this.sequence;
    const id = `segment-${String(number).padStart(4, "0")}`;
    const name = `${id}.webm`;
    const file = path.join(this.dir, AUDIO_DIR, name);
    const stream = createWriteStream(file);
    const active: PendingSegment = {
      id,
      file,
      relativeFile: path.posix.join(AUDIO_DIR, name),
      stream,
      bytes: 0,
      startEpoch: null,
      stopEpoch: null,
      failed: false,
      error: null,
      ended: false,
      stopRequested: false,
      requestedDeviceId: deviceId,
      device: null,
      startedResolve: null,
      startedReject: null,
      stoppedResolve: null,
    };
    stream.once("error", (error) => {
      active.failed = true;
      active.error = error.message;
      active.startedReject?.(error);
      log.warn("microphone segment write failed:", error.message);
      if (active.startEpoch != null) {
        this.finishUnexpected(active, error.message, true);
      }
    });
    this.active = active;

    const started = new Promise<MicrophoneDevice>((resolve, reject) => {
      active.startedResolve = resolve;
      active.startedReject = reject;
    });
    this.win.webContents.send("audio:start", {
      id,
      bitsPerSecond: BITS_PER_SECOND,
      deviceId,
    });

    try {
      return await withTimeout(
        started,
        START_TIMEOUT_MS,
        "Timed out starting microphone capture.",
      );
    } catch (error) {
      await this.disable();
      throw error;
    }
  }

  /** Flush and close the active segment, releasing the microphone device. */
  private async disable(): Promise<AudioSegment | null> {
    if (this.disableTask) return this.disableTask;
    const task = this.disableInternal();
    this.disableTask = task;
    try {
      return await task;
    } finally {
      if (this.disableTask === task) this.disableTask = null;
    }
  }

  private async disableInternal(): Promise<AudioSegment | null> {
    const active = this.active;
    if (!active) return null;

    active.stopRequested = true;
    if (!active.ended) {
      const stopped = new Promise<void>((resolve) => {
        active.stoppedResolve = resolve;
      });
      if (this.win && !this.win.isDestroyed()) {
        this.win.webContents.send("audio:stop", { id: active.id });
      } else {
        active.failed = true;
        active.error ??= "Microphone capture window is unavailable.";
        active.ended = true;
        active.stoppedResolve?.();
      }

      try {
        await withTimeout(
          stopped,
          STOP_TIMEOUT_MS,
          "Timed out stopping microphone capture.",
        );
      } catch (error) {
        log.warn(error instanceof Error ? error.message : String(error));
        active.stopEpoch ??= Date.now();
      }
    }

    await closeStream(active.stream);
    this.active = null;

    if (
      active.failed ||
      active.bytes === 0 ||
      active.startEpoch == null ||
      active.stopEpoch == null
    ) {
      if (existsSync(active.file)) await unlink(active.file).catch(() => undefined);
      if (active.error) {
        log.warn("discarded unusable microphone segment:", active.error);
      }
      return null;
    }

    const startEpoch = active.startEpoch;
    const stopEpoch = Math.max(startEpoch, active.stopEpoch);
    const segment: AudioSegment = {
      file: active.relativeFile,
      startEpoch,
      stopEpoch,
      durationMs: stopEpoch - startEpoch,
      sessionStartMs: Math.round(startEpoch - this.sessionStartedAt),
      sessionEndMs: Math.round(stopEpoch - this.sessionStartedAt),
      videoStartMs: null,
      videoEndMs: null,
      bytes: active.bytes,
    };
    this.segments.push(segment);
    log.info(
      `microphone segment saved: ${segment.file} (${(segment.bytes / 1000).toFixed(0)} KB, ` +
        `${segment.durationMs} ms)`,
    );
    return segment;
  }

  /** Finish the session and atomically persist its segment manifest. */
  private async finishSession(
    videoStartEpoch: number | null,
  ): Promise<AudioManifestV2 | null> {
    if (this.active) await this.disable();

    const segments = alignAudioSegmentsToVideo(this.segments, videoStartEpoch);
    const manifest: AudioManifestV2 | null =
      segments.length > 0
        ? {
            version: AUDIO_MANIFEST_VERSION,
            narrationLanguage: this.narrationLanguage,
            segments,
          }
        : null;

    try {
      if (manifest) {
        const file = path.join(this.dir, "audio.json");
        const temp = `${file}.tmp.${process.pid}.${Date.now()}`;
        try {
          await writeFile(temp, JSON.stringify(manifest, null, 2));
          await rename(temp, file);
        } finally {
          await rm(temp, { force: true });
        }
      } else if (this.dir) {
        await rm(path.join(this.dir, "audio.json"), { force: true });
        await rm(path.join(this.dir, AUDIO_DIR), {
          recursive: true,
          force: true,
        });
      }
      return manifest;
    } finally {
      this.resetSession();
    }
  }

  private readonly onChunk = (
    event: IpcMainEvent,
    id: string,
    chunk: Uint8Array,
  ) => {
    const active = this.ownedSegment(event, id);
    if (!active || !(chunk instanceof Uint8Array) || chunk.byteLength === 0) return;
    const buffer = Buffer.from(chunk);
    active.bytes += buffer.byteLength;
    active.stream.write(buffer);
  };

  private readonly onStarted = (
    event: IpcMainEvent,
    id: string,
    epoch: number,
    rawDevice: unknown,
  ) => {
    const active = this.ownedSegment(event, id);
    if (!active || !Number.isFinite(epoch)) return;
    const device = readActiveDevice(rawDevice, active.requestedDeviceId);
    active.startEpoch = epoch;
    active.device = device;
    active.startedResolve?.(device);
    active.startedResolve = null;
    active.startedReject = null;
    this.permission = "granted";
    this.settingsError = null;
    this.emitSettings();
    log.info("microphone segment started:", device.label, "at", epoch);
  };

  private readonly onStopped = (
    event: IpcMainEvent,
    id: string,
    epoch: number,
  ) => {
    const active = this.ownedSegment(event, id);
    if (!active) return;
    const unexpected = !active.stopRequested && active.startEpoch != null;
    active.stopEpoch = Number.isFinite(epoch) ? epoch : Date.now();
    active.ended = true;
    active.stoppedResolve?.();
    active.stoppedResolve = null;
    if (unexpected) {
      this.finishUnexpected(
        active,
        "The microphone stopped unexpectedly.",
        false,
      );
    }
  };

  private readonly onError = (
    event: IpcMainEvent,
    id: string,
    error: string,
    errorName?: string,
  ) => {
    const active = this.ownedSegment(event, id);
    if (!active) return;
    const reason = error || "Microphone capture failed.";
    active.error = reason;
    if (isPermissionDenied(errorName)) {
      this.permission = "denied";
      this.settingsError = reason;
      this.emitSettings();
    }
    log.warn("microphone unavailable:", reason);
    if (active.startEpoch == null) {
      active.failed = true;
      active.startedReject?.(new Error(reason));
      active.startedResolve = null;
      active.startedReject = null;
      return;
    }
    this.finishUnexpected(active, reason, true);
  };

  private readonly onDevices = (event: IpcMainEvent, rawDevices: unknown) => {
    if (!this.ownsWindow(event)) return;
    this.applyDevices(rawDevices);
  };

  private readonly onDeviceError = (
    event: IpcMainEvent,
    error: string,
    errorName?: string,
  ) => {
    if (!this.ownsWindow(event)) return;
    if (isPermissionDenied(errorName)) this.permission = "denied";
    this.settingsError = error || "Could not list microphones.";
    this.emitSettings();
  };

  private readonly onProbeResult = (
    event: IpcMainEvent,
    requestId: string,
    rawResult: unknown,
  ) => {
    if (!this.ownsWindow(event) || typeof requestId !== "string") return;
    const pending = this.probes.get(requestId);
    if (!pending) return;
    this.probes.delete(requestId);
    clearTimeout(pending.timeout);

    const result = readProbeResult(rawResult);
    if (result.devices) this.applyDevices(result.devices, false);
    if (result.ok) {
      this.permission = "granted";
      this.settingsError = null;
      this.emitSettings();
      pending.resolve({ ok: true });
      return;
    }

    if (isPermissionDenied(result.errorName)) this.permission = "denied";
    const error = result.error || "Microphone permission was not granted.";
    this.settingsError = error;
    this.emitSettings();
    pending.resolve({ ok: false, error });
  };

  private async requestPermission(): Promise<ProbeOutcome> {
    if (!this.win || this.win.isDestroyed()) {
      return { ok: false, error: SERVICE_UNAVAILABLE };
    }
    const requestId = randomUUID();
    const outcome = new Promise<ProbeOutcome>((resolve) => {
      const timeout = setTimeout(() => {
        this.probes.delete(requestId);
        const error = "Timed out requesting microphone permission.";
        this.settingsError = error;
        this.emitSettings();
        resolve({ ok: false, error });
      }, PROBE_TIMEOUT_MS);
      this.probes.set(requestId, { resolve, timeout });
    });
    this.win.webContents.send("audio:probe", {
      requestId,
      deviceId: this.effectiveDeviceId(),
    });
    return outcome;
  }

  private applyDevices(rawDevices: unknown, emit = true): void {
    const normalized = normalizeDevices(rawDevices);
    this.devices = normalized.devices.map((device) => {
      if (
        !normalized.labeledDeviceIds.has(device.id) &&
        device.id === this.preferences.microphone.id &&
        this.preferences.microphone.label
      ) {
        return {
          ...device,
          label: this.preferences.microphone.label,
          groupId: device.groupId || this.preferences.microphone.groupId,
        };
      }
      return device;
    });
    if (normalized.hasLabels) this.permission = "granted";
    if (this.settingsError === SERVICE_UNAVAILABLE) this.settingsError = null;

    const resolved = resolveMicrophonePreference(
      this.preferences.microphone,
      this.devices,
    );
    if (resolved.changed) {
      this.preferences.microphone =
        normalized.labeledDeviceIds.has(resolved.preference.id) ||
        resolved.preference.id === this.preferences.microphone.id
          ? resolved.preference
          : {
              ...resolved.preference,
              label:
                this.preferences.microphone.label ||
                resolved.preference.label,
              groupId:
                resolved.preference.groupId ||
                this.preferences.microphone.groupId,
            };
      void this.persistPreferences().catch((error) => {
        this.settingsError = `Could not save the restored microphone selection: ${errorMessage(error)}`;
        this.emitSettings();
      });
    }
    if (emit) this.emitSettings();
  }

  private async ensureWindow(): Promise<void> {
    if (this.win && !this.win.isDestroyed() && this.readyTask) {
      return this.readyTask;
    }
    if (this.disposed) throw new Error("The microphone service has been disposed.");
    this.registerIpc();

    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(dirname, "audio", "capture-preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false,
      },
    });
    this.win = win;
    win.once("closed", () => this.handleWindowClosed(win));
    const ready = win.loadFile(path.join(dirname, "audio", "capture.html"));
    this.readyTask = ready;
    try {
      await ready;
    } catch (error) {
      if (!win.isDestroyed()) win.destroy();
      throw error;
    }
  }

  private registerIpc(): void {
    if (this.ipcRegistered) return;
    ipcMain.on("audio:chunk", this.onChunk);
    ipcMain.on("audio:started", this.onStarted);
    ipcMain.on("audio:stopped", this.onStopped);
    ipcMain.on("audio:error", this.onError);
    ipcMain.on("audio:devices", this.onDevices);
    ipcMain.on("audio:device-error", this.onDeviceError);
    ipcMain.on("audio:probe-result", this.onProbeResult);
    this.ipcRegistered = true;
  }

  private handleWindowClosed(win: BrowserWindow): void {
    if (this.win !== win) return;
    this.win = null;
    this.readyTask = null;
    if (this.disposed) return;

    this.settingsError = SERVICE_UNAVAILABLE;
    for (const probe of this.probes.values()) {
      clearTimeout(probe.timeout);
      probe.resolve({ ok: false, error: SERVICE_UNAVAILABLE });
    }
    this.probes.clear();
    this.emitSettings();

    const active = this.active;
    if (!active || active.ended) return;
    active.failed = true;
    active.error = "Microphone capture window closed unexpectedly.";
    active.startedReject?.(new Error(active.error));
    active.ended = true;
    active.stoppedResolve?.();
    this.finishUnexpected(active, active.error, true);
  }

  private ownedSegment(event: IpcMainEvent, id: string): PendingSegment | null {
    if (!this.ownsWindow(event) || this.active?.id !== id) return null;
    return this.active;
  }

  private ownsWindow(event: IpcMainEvent): boolean {
    return event.sender === this.win?.webContents;
  }

  private finishUnexpected(
    active: PendingSegment,
    error: string,
    discardSegment: boolean,
  ): void {
    if (this.active !== active || active.stopRequested) return;
    if (discardSegment) active.failed = true;
    active.stopRequested = true;
    void this.disable()
      .catch((disableError) => {
        log.warn(
          "failed to release microphone after capture ended:",
          disableError instanceof Error ? disableError.message : disableError,
        );
      })
      .finally(() => this.onCaptureEnded({ error }));
  }

  private resetSession(): void {
    this.dir = "";
    this.sessionStartedAt = 0;
    this.sequence = 0;
    this.segments.length = 0;
    this.onCaptureEnded = () => undefined;
  }

  private async loadPreferences(): Promise<void> {
    if (this.preferencesLoaded) return;
    this.preferencesLoaded = true;
    this.preferencesFile = path.join(app.getPath("userData"), PREFERENCES_FILE);
    try {
      const raw = JSON.parse(await readFile(this.preferencesFile, "utf8")) as unknown;
      this.preferences = readPreferences(raw);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return;
      this.settingsError = `Saved microphone preferences could not be read: ${errorMessage(error)}`;
      log.warn(this.settingsError);
    }
  }

  private persistPreferences(): Promise<void> {
    if (!this.preferencesFile) {
      this.preferencesFile = path.join(app.getPath("userData"), PREFERENCES_FILE);
    }
    const file = this.preferencesFile;
    const contents = JSON.stringify(this.preferences, null, 2);
    const write = this.preferenceWrites.then(async () => {
      await mkdir(path.dirname(file), { recursive: true });
      const temp = `${file}.tmp.${process.pid}.${Date.now()}`;
      try {
        await writeFile(temp, contents);
        await rename(temp, file);
      } finally {
        await rm(temp, { force: true });
      }
    });
    this.preferenceWrites = write.catch(() => undefined);
    return write;
  }

  private settingsFailure(
    error: unknown,
    prefix = "Microphone setup failed",
  ): MicrophoneSettingsResult {
    const message = `${prefix}: ${errorMessage(error)}`;
    this.settingsError = message;
    this.emitSettings();
    return { ok: false, status: this.settings(), error: message };
  }

  private emitSettings(): void {
    this.onSettingsChanged(this.settings());
  }
}

function normalizeDevices(rawDevices: unknown): {
  devices: MicrophoneDevice[];
  hasLabels: boolean;
  labeledDeviceIds: Set<string>;
} {
  if (!Array.isArray(rawDevices)) {
    return {
      devices: [SYSTEM_DEFAULT_MICROPHONE],
      hasLabels: false,
      labeledDeviceIds: new Set(),
    };
  }

  const devices: MicrophoneDevice[] = [SYSTEM_DEFAULT_MICROPHONE];
  const seen = new Set([SYSTEM_DEFAULT_MICROPHONE_ID]);
  const labeledDeviceIds = new Set<string>();
  let unnamed = 0;
  let hasLabels = false;
  for (const value of rawDevices) {
    if (!value || typeof value !== "object") continue;
    const id = "id" in value && typeof value.id === "string" ? value.id : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const rawLabel =
      "label" in value && typeof value.label === "string"
        ? value.label.trim()
        : "";
    if (rawLabel) {
      hasLabels = true;
      labeledDeviceIds.add(id);
    }
    const groupId =
      "groupId" in value && typeof value.groupId === "string"
        ? value.groupId
        : "";
    devices.push({
      id,
      label: rawLabel || `Microphone ${++unnamed}`,
      groupId,
    });
  }
  return { devices, hasLabels, labeledDeviceIds };
}

function readActiveDevice(
  value: unknown,
  requestedDeviceId: string,
): MicrophoneDevice {
  if (value && typeof value === "object") {
    const id = "id" in value && typeof value.id === "string" ? value.id : "";
    const label =
      "label" in value && typeof value.label === "string"
        ? value.label.trim()
        : "";
    const groupId =
      "groupId" in value && typeof value.groupId === "string"
        ? value.groupId
        : "";
    if (id || label) {
      return {
        id: id || requestedDeviceId,
        label: label || "Microphone",
        groupId,
      };
    }
  }
  return requestedDeviceId === SYSTEM_DEFAULT_MICROPHONE_ID
    ? SYSTEM_DEFAULT_MICROPHONE
    : { id: requestedDeviceId, label: "Microphone", groupId: "" };
}

function readProbeResult(value: unknown): {
  ok: boolean;
  error?: string;
  errorName?: string;
  devices?: unknown;
} {
  if (!value || typeof value !== "object") return { ok: false };
  return {
    ok: "ok" in value && value.ok === true,
    error:
      "error" in value && typeof value.error === "string"
        ? value.error
        : undefined,
    errorName:
      "errorName" in value && typeof value.errorName === "string"
        ? value.errorName
        : undefined,
    devices: "devices" in value ? value.devices : undefined,
  };
}

function readPreferences(value: unknown): StoredPreferences {
  if (!value || typeof value !== "object") {
    throw new Error("Expected an object.");
  }
  const narrationEnabled =
    "narrationEnabled" in value && typeof value.narrationEnabled === "boolean"
      ? value.narrationEnabled
      : false;
  const rawMicrophone =
    "microphone" in value && value.microphone && typeof value.microphone === "object"
      ? value.microphone
      : null;
  if (!rawMicrophone) {
    return {
      narrationEnabled,
      microphone: microphonePreference(SYSTEM_DEFAULT_MICROPHONE),
    };
  }
  const id =
    "id" in rawMicrophone && typeof rawMicrophone.id === "string"
      ? rawMicrophone.id
      : "";
  if (!id) throw new Error("The saved microphone id is invalid.");
  return {
    narrationEnabled,
    microphone: {
      id,
      label:
        "label" in rawMicrophone && typeof rawMicrophone.label === "string"
          ? rawMicrophone.label
          : "",
      groupId:
        "groupId" in rawMicrophone && typeof rawMicrophone.groupId === "string"
          ? rawMicrophone.groupId
          : "",
    },
  };
}

function isPermissionDenied(errorName: string | undefined): boolean {
  return errorName === "NotAllowedError" || errorName === "SecurityError";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function closeStream(stream: WriteStream): Promise<void> {
  return new Promise((resolve) => {
    if (stream.closed || stream.destroyed) {
      resolve();
      return;
    }
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    stream.once("close", done);
    stream.end(done);
  });
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, expired]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

import { useEffect, useRef } from "react";

import type { SensitiveModelStatus } from "../common/ipc";

/** Human-readable status for the on-device protection model shown in the sheet. */
function protectionModelNote(status: SensitiveModelStatus | null): string {
  if (!status) return "Checking…";
  switch (status.ocr) {
    case "ready":
      return "On-device model ready";
    case "downloading":
      return status.progress == null
        ? "Setting up the on-device model…"
        : `Setting up the on-device model… ${Math.round(status.progress)}%`;
    case "error":
      return "Couldn't set up the model";
    default:
      return "On-device model not set up yet";
  }
}

/**
 * Plain-language disclosure of what the recorder captures, where it is stored,
 * and what leaves the machine on analysis. Every claim here is grounded in the
 * actual collectors and describer behavior, so it must be kept in sync with them.
 *
 * The recorder owns the protection switch; this sheet shows either recording
 * disclosure or protection details, without mixing settings into the disclosure.
 */
export function WhatsRecorded({
  onClose,
  onReviewed,
  sensitive,
  mode = "recording",
  onDownload,
}: {
  onClose: () => void;
  onReviewed: () => void;
  sensitive: SensitiveModelStatus | null;
  mode?: "recording" | "protection";
  onDownload: () => void;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sheetRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const advancedOn = sensitive?.enabled ?? true;
  const showModelError = advancedOn && sensitive?.ocr === "error";
  const showDownloadAction =
    advancedOn && (sensitive?.ocr === "error" || sensitive?.ocr === "missing");

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        ref={sheetRef}
        className="sheet disclosure-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-recorded-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sheet-head">
          <span className="sheet-icon" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path
                d="M10 2.5 4 4.8v4.3c0 3.4 2.4 6.2 6 7.4 3.6-1.2 6-4 6-7.4V4.8L10 2.5Z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              <path
                d="m7.4 9.8 1.9 1.9 3.4-3.6"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <h2 id="whats-recorded-title">{mode === "protection" ? "Privacy and security protection" : "Recording guide"}</h2>
        </header>

        <div className="disclosure-body">
        {mode === "recording" && <>
        <p className="sheet-lead">
          This tool records your screen and activity so it can turn what you did into a reusable
          skill. Here is exactly what it captures and what leaves your computer.
        </p>

        <section className="sheet-block">
          <h3>While you're recording</h3>
          <p className="sheet-note">Only between Start and Stop.</p>
          <ul>
            <li>Which apps you switch to, and their window and document titles.</li>
            <li>Web addresses of the pages you open.</li>
            <li>A short preview of text you copy, up to 120 characters.</li>
            <li>A silent video of the screen you select, at a low frame rate.</li>
          </ul>
          <p className="sheet-caution">
            Do not type, paste, display, copy, or narrate passwords, access tokens, API keys,
            credentials, secrets, or other sensitive or confidential information. Anything visible
            on screen can appear in the recording, and copied text previews and narration are
            captured too.
          </p>
        </section>

        <section className="sheet-block">
          <h3>Voice narration (only if you turn it on)</h3>
          <p className="sheet-note">
            Off by default. Choose the initial state and microphone with Narrate, then use the
            floating recording bar.
          </p>
          <ul>
            <li>
              Enabling Narrate briefly opens and releases the microphone so the app can request
              permission and show the available inputs. No audio is saved during this check.
            </li>
            <li>Your microphone audio is saved only while it is on and a recording is running.</li>
            <li>
              Turning the microphone off ends that voice segment and releases the device. Turning it
              on again, or switching inputs, starts a new segment linked to the same recording
              timeline.
            </li>
            <li>
              The recording can be turned into text on this computer using an on-device model. The
              transcript stays in the language you select from Whisper's 99 supported choices. The
              first transcription needs a one-time ~252 MB download that you choose when to start.
            </li>
            <li>Leave Narrate and the recording-bar microphone off and no microphone is opened.</li>
          </ul>
        </section>

        <section className="sheet-block">
          <h3>Where it's stored</h3>
          <ul>
            <li>Everything is saved on this computer, in the app's own session folder.</li>
            <li>Recordings stay until you delete them. You can delete any recording from Sessions.</li>
          </ul>
        </section>

        <section className="sheet-block">
          <h3>What's sent for analysis</h3>
          <ul>
            <li>Nothing leaves your computer while you record.</li>
            <li>
              When you choose Analyze, the event timeline (window and document titles, URLs, and
              clipboard previews), plus screen images and narration text if recorded, are sent to
              the custom endpoint you configured. If no model is configured, analysis stays
              unavailable and nothing is sent.
            </li>
            <li>
              By default, before anything is sent, this computer hides sensitive details like
              passwords, keys, emails, and card or ID numbers from that text and from your screen
              images. Manage this with Privacy and security protection on the recorder.
            </li>
          </ul>
        </section>

        </>}
        {mode === "protection" && <section className={`sheet-block sheet-advp ${advancedOn ? "on" : ""}`}>
          <div className="sheet-advp-head">
            <div className="sheet-advp-copy">
              <p className="sheet-note">
                On by default: sensitive text and screen images are masked locally before analysis
              </p>
            </div>
          </div>
          {(
            <>
              <ul>
                <li>
                  Masks passwords, keys, emails, and card or ID numbers, including narration text
                </li>
                <li>
                  When off, original content is sent to your model without masking
                </li>
              </ul>
              <div className={`sheet-advp-status ${showModelError ? "is-error" : ""}`}>
                <span className="sheet-advp-model">{protectionModelNote(sensitive)}</span>
                {showDownloadAction && (
                  <button type="button" className="sheet-advp-download" onClick={onDownload}>
                    {sensitive?.ocr === "error" ? "Retry" : "Set up now"}
                  </button>
                )}
              </div>
              <p className="sheet-caution">
                Masking may miss details or hide the wrong ones — avoid recording secrets
              </p>
            </>
          )}
        </section>}

        {mode === "recording" && <section className="sheet-block">
          <h3>What it never does</h3>
          <ul>
            <li>It does not log your keystrokes.</li>
            <li>It only captures while a recording is running. Nothing runs in the background.</li>
          </ul>
        </section>}

        </div>
        <button className="sheet-close" onClick={onReviewed}>
          Got it
        </button>
      </div>
    </div>
  );
}

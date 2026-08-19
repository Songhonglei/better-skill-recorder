import React from "react";
import { createRoot } from "react-dom/client";

import { Library } from "./Library";
import { Recorder } from "./Recorder";
import { RecordingControls } from "./RecordingControls";
import { LanguageProvider, LanguageSwitcher, UiLocalizer } from "./i18n";
import "./App.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");

const route = window.location.hash.replace("#", "");
const isLibrary = route === "library";
const isRecordingControls = route === "recording-controls";
document.body.dataset.route = isLibrary
  ? "library"
  : isRecordingControls
    ? "recording-controls"
    : "recorder";

createRoot(root).render(
  <React.StrictMode>
    <LanguageProvider>
      <UiLocalizer>
        {!isRecordingControls && <LanguageSwitcher />}
        {isLibrary ? <Library /> : isRecordingControls ? <RecordingControls /> : <Recorder />}
      </UiLocalizer>
    </LanguageProvider>
  </React.StrictMode>,
);

import { useEffect, useMemo, useState } from "react";

import type {
  AgentProviderSettings,
  AgentProviderSettingsInput,
  AgentProviderTestResult,
} from "../common/provider-settings";

const EyeGlyph = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
    <path d="M3.4 12s3.1-5 8.6-5 8.6 5 8.6 5-3.1 5-8.6 5-8.6-5-8.6-5Z" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const KeyGlyph = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
    <circle cx="8.5" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.5" />
    <path d="M12 12h8m-2 0v2.2M15.2 12v2.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const LinkGlyph = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
    <path d="M9.6 14.4 14.4 9.6M7.8 16.2l-1.2 1.2a3.4 3.4 0 0 1-4.8-4.8l3.4-3.4A3.4 3.4 0 0 1 10 9M14 15a3.4 3.4 0 0 0 4.8-.2l3.4-3.4a3.4 3.4 0 0 0-4.8-4.8l-1.2 1.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const FileGlyph = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
    <path d="M6.5 3.5h7l4 4v13h-11v-17Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M13.5 3.5v4h4M9 12h6M9 15.5h4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const ReloadGlyph = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
    <path d="M19 8V4m0 0h-4m4 0-3 3a7 7 0 1 0 1.7 7.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const MODEL_ID_PATTERN = /^[A-Za-z0-9._/-]+$/;

export function ProviderSettings({
  initial,
  onChanged,
}: {
  initial: AgentProviderSettings | null;
  onChanged: (settings: AgentProviderSettings) => void;
}) {
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [customModelId, setCustomModelId] = useState("");
  const [vision, setVision] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [clearApiKey, setClearApiKey] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [tokenPlan, setTokenPlan] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [testResult, setTestResult] = useState<AgentProviderTestResult | null>(null);

  useEffect(() => {
    if (!initial) return;
    setVision(initial.vision);
    setApiKey("");
    setClearApiKey(false);
    const matchedPreset = initial.modelPresets.find((preset) => preset.id === initial.model);
    const fallbackPreset = !initial.model ? initial.modelPresets[0] : undefined;
    const activePreset = matchedPreset ?? fallbackPreset;
    const presetSelected = Boolean(fallbackPreset || (matchedPreset && (
      matchedPreset.baseUrl === initial.baseUrl || matchedPreset.tokenPlanBaseUrl === initial.baseUrl
    )));
    setBaseUrl(fallbackPreset?.baseUrl ?? initial.baseUrl);
    setModel(fallbackPreset?.id ?? initial.model);
    setCustomMode(!presetSelected);
    setCustomModelId(presetSelected ? "" : initial.model);
    setTokenPlan(Boolean(!fallbackPreset && activePreset?.tokenPlanBaseUrl === initial.baseUrl));
  }, [initial]);

  const draft = useMemo<AgentProviderSettingsInput>(() => ({
    provider: "openai-compatible",
    baseUrl,
    model,
    vision,
    ...(apiKey ? { apiKey } : {}),
    ...(clearApiKey ? { clearApiKey: true } : {}),
  }), [apiKey, baseUrl, clearApiKey, model, vision]);

  const modelIdValid = Boolean(model.trim() && MODEL_ID_PATTERN.test(model.trim()));
  const canSubmit = Boolean(baseUrl.trim() && modelIdValid);
  const overrides = initial?.environmentOverrides ?? [];
  const selectedPresetIndex = initial?.modelPresets.findIndex((preset) =>
    !customMode && preset.id === model.trim()
  ) ?? -1;
  const selectedPreset = selectedPresetIndex >= 0
    ? initial?.modelPresets[selectedPresetIndex]
    : undefined;

  const applyPreset = (presetIndex: number) => {
    const preset = initial?.modelPresets[presetIndex];
    if (!preset) return;
    setCustomMode(false);
    setModel(preset.id);
    const nextBaseUrl = tokenPlan && preset.tokenPlanBaseUrl
      ? preset.tokenPlanBaseUrl
      : preset.baseUrl;
    if (nextBaseUrl) setBaseUrl(nextBaseUrl);
    if (preset.capabilities) setVision(preset.capabilities.includes("vision"));
    setTestResult(null);
    setNotice(null);
  };

  const toggleTokenPlan = (enabled: boolean) => {
    if (!selectedPreset?.tokenPlanBaseUrl || !selectedPreset.baseUrl) return;
    setTokenPlan(enabled);
    setBaseUrl(enabled ? selectedPreset.tokenPlanBaseUrl : selectedPreset.baseUrl);
    setTestResult(null);
    setNotice(null);
  };

  const toggleCustomMode = (enabled: boolean) => {
    if (!enabled) {
      applyPreset(selectedPresetIndex >= 0 ? selectedPresetIndex : 0);
      return;
    }
    const nextModel = customModelId || (selectedPreset ? "" : model);
    setCustomMode(true);
    setModel(nextModel);
    setTestResult(null);
    setNotice(null);
    requestAnimationFrame(() => document.getElementById("provider-custom-model-id")?.focus());
  };

  const save = async () => {
    setSaving(true);
    setNotice(null);
    const result = await window.skillRecorder.saveAgentSettings(draft);
    setSaving(false);
    if (!result.ok || !result.settings) {
      setNotice({ kind: "error", text: result.error ?? "Could not save model settings" });
      return;
    }
    setApiKey("");
    setClearApiKey(false);
    onChanged(result.settings);
    setNotice({
      kind: "ok",
      text: `Custom model is active; new analyses use this configuration`,
    });
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    setNotice(null);
    const result = await window.skillRecorder.testAgentSettings(draft);
    setTestResult(result);
    setTesting(false);
  };

  const reload = async () => {
    setReloading(true);
    setNotice(null);
    const result = await window.skillRecorder.reloadAgentSettings();
    setReloading(false);
    if (!result.ok || !result.settings) {
      setNotice({ kind: "error", text: result.error ?? "Could not reload the configuration file" });
      return;
    }
    onChanged(result.settings);
    setNotice({ kind: "ok", text: "Configuration reloaded and activated" });
  };

  const reveal = async () => {
    const result = await window.skillRecorder.revealAgentSettings();
    if (!result.ok) setNotice({ kind: "error", text: result.error ?? "Could not open the folder" });
  };

  if (!initial) {
    return (
      <section className="provider-page provider-loading" aria-live="polite">
        <span className="provider-orbit" aria-hidden />
        <p>Loading model control…</p>
      </section>
    );
  }

  return (
    <section className="provider-page">
      <div className="provider-scroll">
      {!initial.configured && (
        <div className="provider-onboarding" role="status">
          <span>01</span>
          <div>
            <strong>Connect once, then record freely</strong>
            <p>Choose a verified model or type any compatible model ID, add its endpoint and key, test, then activate</p>
          </div>
        </div>
      )}

      {overrides.length > 0 && (
        <div className="provider-banner warn" role="status">
          <span>ENV</span>
          <p>
            Process environment overrides <strong>{overrides.join(", ")}</strong>. Saved file
            values remain on disk but cannot take effect until those variables are removed
          </p>
        </div>
      )}
      {initial.configError && (
        <div className="provider-banner error" role="alert">
          <span>JSON</span><p>{initial.configError}</p>
        </div>
      )}

      <div className="provider-flow">
        <section className="provider-step" aria-labelledby="provider-model-step">
          <header className="provider-step-head">
            <span className="provider-step-number">01</span>
            <div><h2 id="provider-model-step">Choose a model</h2><p>Select a preset model or enter a custom model ID</p></div>
          </header>
          <div className="provider-model-input">
            <div className="provider-model-row">
              <div className="provider-field provider-model-field">
                <div className="provider-field-title">
                  <label htmlFor={customMode ? "provider-custom-model-id" : "provider-model-selector"}>Choose a model</label>
                  <label className="provider-inline-check provider-custom-model-toggle">
                    <input type="checkbox" checked={customMode} onChange={(event) => toggleCustomMode(event.target.checked)} />
                    <span>Custom model</span>
                  </label>
                </div>
                {!customMode ? (
                  <select id="provider-model-selector" value={selectedPresetIndex >= 0 ? String(selectedPresetIndex) : ""} onChange={(event) => applyPreset(Number(event.target.value))}>
                    {initial.modelPresets.map((preset, index) => (
                      <option key={`${preset.id}:${index}`} value={index}>{preset.label}[{preset.id}]</option>
                    ))}
                  </select>
                ) : (
                  <input id="provider-custom-model-id" value={model}
                    onChange={(event) => {
                      setModel(event.target.value); setCustomModelId(event.target.value);
                      setTestResult(null); setNotice(null);
                    }}
                    aria-invalid={Boolean(model && !modelIdValid)}
                    aria-describedby="provider-model-hint"
                    pattern="[A-Za-z0-9._/-]+"
                    placeholder="your-vision-model" spellCheck={false} />
                )}
                <small id="provider-model-hint" className={customMode && model && !modelIdValid ? "provider-field-error" : undefined}>
                  {customMode && model && !modelIdValid
                    ? "Use only letters, numbers, hyphens, underscores, periods, and slashes"
                    : customMode
                      ? "You can enter any OpenAI-compatible model ID"
                      : "Selecting a preset fills its BaseURL automatically"}
                </small>
              </div>
            </div>
          </div>
        </section>

        <section className="provider-step" aria-labelledby="provider-connection-step">
          <header className="provider-step-head">
            <span className="provider-step-number">02</span>
            <div>
              <h2 id="provider-connection-step">Connection details</h2>
              <p>Enter the BaseURL and API key supplied by your provider</p>
            </div>
          </header>
          <div className="provider-connection-grid">
            <div className="provider-field">
              <div className="provider-field-title">
                <label htmlFor="provider-base-url"><LinkGlyph /><span>BaseURL</span></label>
                {!customMode && selectedPreset?.tokenPlanBaseUrl && (
                  <label className="provider-inline-check provider-token-plan">
                    <input type="checkbox" checked={tokenPlan} onChange={(event) => toggleTokenPlan(event.target.checked)} />
                    <span>Token Plan</span>
                  </label>
                )}
              </div>
              <input id="provider-base-url" type="url" value={baseUrl}
                onChange={(event) => { setBaseUrl(event.target.value); setTestResult(null); setNotice(null); }}
                placeholder="https://api.example.com/v1" spellCheck={false} />
              <small>The app appends /chat/completions when needed</small>
            </div>
            <div className="provider-field provider-key-field">
              <div className="provider-field-title">
                <label htmlFor="provider-api-key"><KeyGlyph /><span>API Key</span></label>
                {initial.hasApiKey && initial.apiKeySource === "secure-storage" && (
                  <label className="provider-inline-check provider-clear-key">
                    <input type="checkbox" checked={clearApiKey} onChange={(event) => { setClearApiKey(event.target.checked); setApiKey(""); }} />
                    <span>Delete the stored key after saving</span>
                  </label>
                )}
              </div>
              <div className="provider-secret-input">
                <input id="provider-api-key" type={showKey ? "text" : "password"} value={apiKey}
                  onChange={(event) => { setApiKey(event.target.value); setClearApiKey(false); setTestResult(null); setNotice(null); }}
                  placeholder={initial.hasApiKey ? "Stored — enter to replace" : "Optional for local endpoints"}
                  disabled={clearApiKey} autoComplete="new-password" spellCheck={false} />
                <button type="button" onClick={() => setShowKey((shown) => !shown)} disabled={!apiKey}>{showKey ? "Hide" : "Show"}</button>
              </div>
              <small>{initial.apiKeySource === "secure-storage"
                ? "Encrypted by the operating system for secure storage"
                : initial.apiKeySource === "environment"
                  ? "Supplied by the process environment"
                  : initial.secureStorageAvailable
                    ? "Saved separately with operating system encryption"
                    : "Secure storage unavailable; use the API-key environment variable"}</small>
            </div>
          </div>
        </section>

        <section className="provider-step" aria-labelledby="provider-other-step">
          <header className="provider-step-head">
            <span className="provider-step-number">03</span>
            <div><h2 id="provider-other-step">Other settings</h2><p>Configure visual input, manage the JSON file, and verify the connection</p></div>
          </header>
          <div className="provider-other-grid">
            <button type="button" className={`provider-capability ${vision ? "on" : ""}`} role="switch" aria-checked={vision}
              onClick={() => { setVision((enabled) => !enabled); setTestResult(null); setNotice(null); }}>
              <span className="provider-capability-icon"><EyeGlyph /></span>
              <span className="provider-action-copy">
                <strong>Visual analysis</strong>
                <small>Send redacted screenshots and video to the model</small>
              </span>
              <span className={`provider-switch ${vision ? "on" : ""}`} aria-hidden><i /></span>
            </button>
            <button type="button" className="provider-config-action" onClick={() => void reveal()}>
              <span className="provider-capability-icon"><FileGlyph /></span>
              <span className="provider-action-copy">
                <strong>View configuration file</strong>
                <small>Open the global model settings</small>
              </span>
            </button>
            <button type="button" className="provider-config-action" onClick={() => void reload()} disabled={reloading}>
              <span className="provider-capability-icon"><ReloadGlyph /></span>
              <span className="provider-action-copy">
                <strong>{reloading ? "Reloading…" : "Load from configuration file"}</strong>
                <small>Apply changes from the JSON file</small>
              </span>
            </button>
          </div>
        </section>
      </div>
      </div>

      <footer className="ws-foot provider-foot">
        <span className={`foot-status provider-foot-status ${(notice?.kind === "error" || testResult?.ok === false) ? "error" : ""}`} role="status">
          {notice?.text ?? testResult?.message ?? "Changes apply after saving"}
          {testResult?.latencyMs != null && <code>{testResult.latencyMs} ms</code>}
        </span>
        <div className="ws-foot-actions">
          <button type="button" className="secondary provider-test" onClick={() => void test()} disabled={!canSubmit || testing || saving}>
            {testing ? <><span className="spinner" /> Testing…</> : "Test connection"}
          </button>
          <button type="button" className="record-cta" onClick={() => void save()} disabled={!canSubmit || testing || saving}>
            {saving ? "Activating…" : "Save & activate"}
          </button>
        </div>
      </footer>
    </section>
  );
}

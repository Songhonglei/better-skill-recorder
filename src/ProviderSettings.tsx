import { useEffect, useMemo, useState } from "react";

import type {
  AgentProviderSettings,
  AgentProviderSettingsInput,
  AgentProviderTestResult,
  ConfiguredAgentProvider,
} from "../common/provider-settings";

const CloudGlyph = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden>
    <path d="M7.4 18.2h10a4 4 0 0 0 .5-7.96A6.3 6.3 0 0 0 5.8 8.9 4.7 4.7 0 0 0 7.4 18.2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const NodeGlyph = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden>
    <circle cx="5" cy="12" r="2.2" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="18.5" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="18.5" cy="18" r="2.2" stroke="currentColor" strokeWidth="1.5" />
    <path d="m7 11 9.3-4.1M7 13l9.3 4.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

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

function providerName(provider: ConfiguredAgentProvider): string {
  return provider === "copilot" ? "GitHub Copilot" : "Custom model";
}

export function ProviderSettings({
  initial,
  onChanged,
}: {
  initial: AgentProviderSettings | null;
  onChanged: (settings: AgentProviderSettings) => void;
}) {
  const [provider, setProvider] = useState<ConfiguredAgentProvider>("copilot");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [vision, setVision] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [clearApiKey, setClearApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [testResult, setTestResult] = useState<AgentProviderTestResult | null>(null);

  useEffect(() => {
    if (!initial) return;
    setProvider(initial.provider);
    setBaseUrl(initial.baseUrl);
    setModel(initial.model);
    setVision(initial.vision);
    setApiKey("");
    setClearApiKey(false);
  }, [initial]);

  const draft = useMemo<AgentProviderSettingsInput>(() => ({
    provider,
    baseUrl,
    model,
    vision,
    ...(apiKey ? { apiKey } : {}),
    ...(clearApiKey ? { clearApiKey: true } : {}),
  }), [apiKey, baseUrl, clearApiKey, model, provider, vision]);

  const canSubmit = provider === "copilot" || Boolean(baseUrl.trim() && model.trim());
  const overrides = initial?.environmentOverrides ?? [];

  const save = async () => {
    setSaving(true);
    setNotice(null);
    const result = await window.skillRecorder.saveAgentSettings(draft);
    setSaving(false);
    if (!result.ok || !result.settings) {
      setNotice({ kind: "error", text: result.error ?? "Could not save model settings." });
      return;
    }
    setApiKey("");
    setClearApiKey(false);
    onChanged(result.settings);
    setNotice({
      kind: "ok",
      text: `${providerName(result.settings.provider)} is active. New analyses use this configuration.`,
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
      setNotice({ kind: "error", text: result.error ?? "Could not reload the configuration file." });
      return;
    }
    onChanged(result.settings);
    setNotice({ kind: "ok", text: "Configuration reloaded and activated." });
  };

  const reveal = async () => {
    const result = await window.skillRecorder.revealAgentSettings();
    if (!result.ok) setNotice({ kind: "error", text: result.error ?? "Could not open the folder." });
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
      <header className="provider-hero">
        <div>
          <span className="eyebrow">MODEL CONTROL</span>
          <h1>Choose the mind behind the recording.</h1>
          <p>
            Route analysis, visual understanding, Skills and Automations through Copilot or
            your own OpenAI-compatible endpoint.
          </p>
        </div>
        <div className={`provider-live ${initial.provider === "openai-compatible" ? "custom" : ""}`}>
          <span className="provider-live-pulse" aria-hidden />
          <span>
            <small>ACTIVE ROUTE</small>
            <strong>{providerName(initial.provider)}</strong>
            <em>{initial.provider === "openai-compatible" ? initial.model || "Model not set" : "Managed runtime"}</em>
          </span>
        </div>
      </header>

      {overrides.length > 0 && (
        <div className="provider-banner warn" role="status">
          <span>ENV</span>
          <p>
            Process environment overrides <strong>{overrides.join(", ")}</strong>. Saved file
            values remain on disk but cannot take effect until those variables are removed.
          </p>
        </div>
      )}
      {initial.configError && (
        <div className="provider-banner error" role="alert">
          <span>JSON</span><p>{initial.configError}</p>
        </div>
      )}

      <div className="provider-section-head">
        <div>
          <span className="eyebrow">01 / PROVIDER</span>
          <h2>Routing</h2>
        </div>
        <p>One choice powers every AI workflow in the app.</p>
      </div>

      <div className="provider-choice" role="radiogroup" aria-label="Analysis provider">
        <button
          type="button"
          role="radio"
          aria-checked={provider === "copilot"}
          className={provider === "copilot" ? "selected" : ""}
          onClick={() => { setProvider("copilot"); setTestResult(null); }}
        >
          <span className="provider-choice-icon"><CloudGlyph /></span>
          <span className="provider-choice-copy">
            <strong>GitHub Copilot</strong>
            <small>Official managed runtime</small>
          </span>
          <span className="provider-choice-radio" aria-hidden />
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={provider === "openai-compatible"}
          className={provider === "openai-compatible" ? "selected" : ""}
          onClick={() => { setProvider("openai-compatible"); setTestResult(null); }}
        >
          <span className="provider-choice-icon"><NodeGlyph /></span>
          <span className="provider-choice-copy">
            <strong>OpenAI-compatible</strong>
            <small>Self-hosted or third-party</small>
          </span>
          <span className="provider-choice-radio" aria-hidden />
        </button>
      </div>

      <div className={`provider-custom ${provider === "openai-compatible" ? "visible" : ""}`} aria-hidden={provider !== "openai-compatible"}>
        <div className="provider-section-head compact">
          <div>
            <span className="eyebrow">02 / ENDPOINT</span>
            <h2>Connection</h2>
          </div>
          <p>Chat Completions + function calling required.</p>
        </div>

        <div className="provider-form-grid">
          <label className="provider-field wide">
            <span>Base URL</span>
            <input
              type="url"
              value={baseUrl}
              onChange={(event) => { setBaseUrl(event.target.value); setTestResult(null); }}
              placeholder="https://api.example.com/v1"
              disabled={provider !== "openai-compatible"}
              spellCheck={false}
            />
            <small>The app appends /chat/completions when needed.</small>
          </label>
          <label className="provider-field">
            <span>Model ID</span>
            <input
              value={model}
              onChange={(event) => { setModel(event.target.value); setTestResult(null); }}
              placeholder="your-vision-model"
              disabled={provider !== "openai-compatible"}
              spellCheck={false}
            />
          </label>
          <div className="provider-field provider-key-field">
            <label htmlFor="provider-api-key">API Key</label>
            <div className="provider-secret-input">
              <KeyGlyph />
              <input
                id="provider-api-key"
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(event) => { setApiKey(event.target.value); setClearApiKey(false); setTestResult(null); }}
                placeholder={initial.hasApiKey ? "Stored — enter to replace" : "Optional for local endpoints"}
                disabled={provider !== "openai-compatible" || clearApiKey}
                autoComplete="new-password"
                spellCheck={false}
              />
              <button type="button" onClick={() => setShowKey((shown) => !shown)} disabled={!apiKey}>
                {showKey ? "Hide" : "Show"}
              </button>
            </div>
            <small>
              {initial.apiKeySource === "secure-storage"
                ? "Encrypted in the operating system credential store."
                : initial.apiKeySource === "environment"
                  ? "Supplied by the process environment."
                  : initial.secureStorageAvailable
                    ? "Saved separately with operating system encryption."
                    : "Secure storage unavailable; use the API-key environment variable."}
            </small>
            {initial.hasApiKey && initial.apiKeySource === "secure-storage" && (
              <label className="provider-clear-key">
                <input
                  type="checkbox"
                  checked={clearApiKey}
                  onChange={(event) => { setClearApiKey(event.target.checked); setApiKey(""); }}
                />
                Remove stored key on save
              </label>
            )}
          </div>
        </div>

        <button
          type="button"
          className={`provider-capability ${vision ? "on" : ""}`}
          role="switch"
          aria-checked={vision}
          disabled={provider !== "openai-compatible"}
          onClick={() => { setVision((enabled) => !enabled); setTestResult(null); }}
        >
          <span className="provider-capability-icon"><EyeGlyph /></span>
          <span>
            <strong>Visual analysis</strong>
            <small>Send selected, locally redacted recording frames to the model.</small>
          </span>
          <span className={`provider-switch ${vision ? "on" : ""}`} aria-hidden><i /></span>
        </button>
      </div>

      <div className="provider-config-strip">
        <div>
          <span className="eyebrow">CONFIG FILE</span>
          <code title={initial.configPath}>{initial.configPath}</code>
        </div>
        <div className="provider-config-actions">
          <button type="button" className="ghost" onClick={() => void reveal()}>Open folder</button>
          <button type="button" className="ghost" onClick={() => void reload()} disabled={reloading}>
            {reloading ? "Reloading…" : "Reload JSON"}
          </button>
        </div>
      </div>

      {(notice || testResult) && (
        <div className={`provider-result ${(notice?.kind === "error" || testResult?.ok === false) ? "error" : "ok"}`} role="status">
          <span>{(notice?.kind === "error" || testResult?.ok === false) ? "!" : "✓"}</span>
          <p>{notice?.text ?? testResult?.message}</p>
          {testResult?.latencyMs != null && <code>{testResult.latencyMs} ms</code>}
        </div>
      )}

      <footer className="provider-actions">
        <div>
          <strong>Changes apply immediately</strong>
          <small>Existing idle model conversations are cleared to prevent cross-provider context.</small>
        </div>
        <button type="button" className="secondary provider-test" onClick={() => void test()} disabled={!canSubmit || testing || saving}>
          {testing ? <><span className="spinner" /> Testing…</> : "Test connection"}
        </button>
        <button type="button" className="record-cta" onClick={() => void save()} disabled={!canSubmit || testing || saving}>
          {saving ? "Activating…" : "Save & activate"}
        </button>
      </footer>
    </section>
  );
}

import { useEffect, useState } from "react";
import { DEFAULT_APP_SETTINGS, reservedShortcutReason, validateAppSettings, type AppSettings } from "../common/app-settings";
import { useLanguage } from "./i18n";

export function AdvancedSettings() {
  const { language } = useLanguage();
  const zh = language === "zh-CN";
  const text = (cn: string, en: string) => zh ? cn : en;
  const [value, setValue] = useState<AppSettings>({ ...DEFAULT_APP_SETTINGS });
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => () => { void window.skillRecorder.shortcutCapture(false); }, []);
  useEffect(() => { void window.skillRecorder.appSettings().then(v => { setValue(v); setReady(true); }).catch(() => { setError(true); setNotice(text("无法加载设置，请重新打开页面", "Could not load settings — reopen this page")); }); }, []);
  const update = (patch: Partial<AppSettings>) => { setValue(v => ({ ...v, ...patch })); setNotice(""); };
  let valid = true;
  const reserved = reservedShortcutReason(value.recordingShortcut);
  try { validateAppSettings(value); } catch { valid = false; }
  async function save() {
    setSaving(true); setNotice("");
    try {
      const result = await window.skillRecorder.appSettingsSave(value);
      setError(!result.ok);
      if (result.ok) { setValue(result.settings!); setNotice(text("设置已保存", "Settings saved")); }
      else setNotice(result.error || text("保存失败", "Save failed"));
    } catch { setError(true); setNotice(text("保存失败，请重试", "Save failed — try again")); }
    finally { setSaving(false); }
  }
  return <div className="advanced-settings">
    <div className="advanced-scroll">
      <header className="advanced-heading"><span className="eyebrow">{text("全局配置", "GLOBAL PREFERENCES")}</span><h2>{text("高级设置", "Advanced settings")}</h2></header>
      <section className="advanced-card" aria-labelledby="recording-options-title">
        <header><span className="advanced-glyph" aria-hidden>◉</span><div><h3 id="recording-options-title">{text("录制选项", "Recording options")}</h3><p>{text("调整录制规则、音频处理与快捷操作", "Recording rules, audio processing and quick access")}</p></div></header>
        <div className="advanced-row"><div><label htmlFor="minimum-duration">{text("最短录屏时长", "Minimum recording duration")}</label><p>{text("短于此时长的录制将自动丢弃，结束时会提示", "Shorter recordings are discarded with a notice when stopped")}</p></div><div className="advanced-input"><input id="minimum-duration" type="number" min="1" max="100" step="1" disabled={!ready || saving} value={value.minimumRecordingSeconds || ""} onChange={e => update({ minimumRecordingSeconds: Number(e.target.value) })}/><span>{text("秒", "sec")}</span></div></div>
        <div className="advanced-row"><div><label htmlFor="audio-limit">{text("音频最大体积", "Maximum audio size")}</label><p>{text("建议 100 MB · 超限时不读取，并提示原文件路径", "Recommended: 100 MB · oversized files are not read; their path is shown")}</p></div><div className="advanced-input"><input id="audio-limit" type="number" min="10" max="1000" step="1" disabled={!ready || saving} value={value.maximumAudioMB || ""} onChange={e => update({ maximumAudioMB: Number(e.target.value) })}/><span>MB</span></div></div>
        <div className="advanced-row shortcut-row"><div><label htmlFor="recording-shortcut">{text("录屏快捷键", "Recording shortcut")}</label><p>{text("点击右侧后按下组合键，保存时检测冲突", "Focus the field and press a shortcut; availability is checked on save")}</p></div><input id="recording-shortcut" className="advanced-shortcut" readOnly disabled={!ready || saving} value={value.recordingShortcut.replace("Alt", "Option").replaceAll("+", " + ")} onFocus={() => void window.skillRecorder.shortcutCapture(true)} onBlur={() => void window.skillRecorder.shortcutCapture(false)} onKeyDown={e => {
          if (e.key === "Tab") return;
          e.preventDefault();
          if (!/^(Key[A-Z]|Digit[0-9])$/.test(e.code)) return;
          const key = [e.metaKey && "Command", e.ctrlKey && "Control", e.altKey && "Alt", e.shiftKey && "Shift", e.code.replace(/^(Key|Digit)/, "")].filter(Boolean).join("+");
          update({ recordingShortcut: key });
        }}/></div>
        {reserved && <p className="advanced-validation" role="alert">{text("此快捷键在禁用名单中：", "This shortcut is reserved: ")}{reserved}</p>}
        <div className="advanced-row"><div><label htmlFor="retention-days">{text("录制保留天数", "Recording retention")}</label><p>{text("默认 30 天 · 过期记录及其分析文件移入废纸篓，已导出的文件不受影响", "Default: 30 days · expired sessions and their analysis files go to Trash; exports are unaffected")}</p></div><div className="advanced-input"><input id="retention-days" type="number" min="1" max="3650" step="1" disabled={!ready || saving} value={value.recordingRetentionDays || ""} onChange={e => update({ recordingRetentionDays: Number(e.target.value) })}/><span>{text("天", "days")}</span></div></div>
        {!valid && !reserved && <p className="advanced-validation" role="alert">{text("时长须为 1–100 秒，音频为 10–1000 MB，保留 1–3650 天；快捷键须包含 Command、Control 或 Option", "Use 1–100 seconds, 10–1000 MB, 1–3650 days, and a shortcut with Command, Control or Option")}</p>}
      </section>
    </div>
    <footer className="ws-foot provider-foot"><span className={`foot-status ${error ? "error" : ""}`} role="status">{notice || text("保存后生效", "Changes apply after saving")}</span><div className="ws-foot-actions"><button className="record-cta" disabled={!ready || !valid || saving} onClick={() => void save()}>{saving ? text("检测并保存中…", "Checking and saving…") : text("保存设置", "Save settings")}</button></div></footer>
  </div>;
}

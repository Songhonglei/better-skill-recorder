import { useState } from "react";

import type { SensitiveFinding, SensitiveReport } from "../common/ipc";
import { sourceLabel } from "../common/sensitive";
import { useLanguage } from "./i18n";

const SEVERITY_LABEL: Record<SensitiveFinding["severity"], string> = {
  high: "High risk",
  medium: "Possibly sensitive",
  low: "Low confidence",
};

function headline(report: SensitiveReport, zh: boolean): string {
  const t = report.totalFindings;
  const regions = report.images?.regionsBlurred ?? 0;
  if (zh) {
    if (t > 0 && regions > 0) return `发送前已隐藏 ${t} 项敏感信息，并模糊 ${regions} 处屏幕内容`;
    if (t > 0) return `发送前已隐藏 ${t} 项敏感信息`;
    if (regions > 0) return `发送前已在屏幕图像中模糊 ${regions} 处内容`;
    return "发送前已检查敏感信息";
  }
  const details = `${t} sensitive ${t === 1 ? "detail" : "details"}`;
  const areas = `${regions} on-screen ${regions === 1 ? "area" : "areas"}`;
  if (t > 0 && regions > 0) return `Hid ${details} and blurred ${areas} before sending`;
  if (t > 0) return `Hid ${details} before sending`;
  if (regions > 0) return `Blurred ${areas} in screen images before sending`;
  return "Checked for sensitive details before sending";
}

/**
 * Informational, non-blocking result of the on-device pre-send scan. Collapsed to a
 * single indication line by default (a shield + what was hidden); the details are
 * behind a "Review" disclosure so the summary never crowds the analysis. Everything
 * shown is masked / counted upstream in the scanner, so this component never sees a
 * raw secret and image regions are reported as counts only. The user can dismiss it.
 */
export function SensitiveReview({
  report,
  onDismiss,
}: {
  report: SensitiveReport;
  onDismiss: () => void;
}) {
  const { language } = useLanguage();
  const zh = language === "zh-CN";
  const [open, setOpen] = useState(false);
  const regions = report.images?.regionsBlurred ?? 0;
  const frames = report.images?.framesBlurred ?? 0;
  const hasDetails = report.findings.length > 0 || regions > 0;

  return (
    <section className="sensitive-review" role="status" aria-live="polite">
      <div className="sensitive-review-bar">
        <svg
          className="sensitive-review-icon"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M8 1.75 3 3.6v3.7c0 3.05 2.13 5.26 5 6.65 2.87-1.39 5-3.6 5-6.65V3.6L8 1.75Z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <path
            d="M5.75 8.05 7.3 9.6l3.05-3.35"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <p className="sensitive-review-headline">{headline(report, zh)}</p>
        {hasDetails && (
          <button
            className="sensitive-review-toggle linky"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? (zh ? "隐藏" : "Hide") : (zh ? "查看" : "Review")}
          </button>
        )}
        <button className="sensitive-dismiss linky" onClick={onDismiss} aria-label="Dismiss">
          {zh ? "忽略" : "Dismiss"}
        </button>
      </div>

      {open && (
        <div className="sensitive-review-body">
          <div className="sensitive-scroll">
            {report.findings.length > 0 && (
              <ul className="sensitive-list">
                {report.findings.map((f, i) => (
                  <li key={`${f.source}-${f.label}-${i}`} className="sensitive-item">
                    <span
                      className={`sensitive-dot sev-${f.severity}`}
                      title={zh ? ({ high: "高风险", medium: "可能敏感", low: "低置信度" } as const)[f.severity] : SEVERITY_LABEL[f.severity]}
                      aria-hidden="true"
                    />
                    <div className="sensitive-item-body">
                      <div className="sensitive-item-head">
                        <span className="sensitive-label">{f.label}</span>
                        <span className="sensitive-source">
                          {zh
                            ? ({
                                "window-title": "窗口标题",
                                url: "网址",
                                command: "终端命令",
                                clipboard: "剪贴板",
                                note: "备注",
                                narration: "语音旁白",
                                frame: "屏幕文字",
                                other: "其他录制文本",
                              } as const)[f.source]
                            : sourceLabel(f.source)}
                        </span>
                        {f.occurrences > 1 && (
                          <span className="sensitive-count">×{f.occurrences}</span>
                        )}
                      </div>
                      <code className="sensitive-snippet">{f.snippet}</code>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {regions > 0 && (
              <div className="sensitive-item">
                <span className="sensitive-dot sev-high" aria-hidden="true" />
                <div className="sensitive-item-body">
                  <div className="sensitive-item-head">
                    <span className="sensitive-label">{zh ? "已模糊屏幕敏感信息" : "Blurred on-screen details"}</span>
                    <span className="sensitive-source">{zh ? "屏幕图像" : "Screen images"}</span>
                  </div>
                  <span className="sensitive-snippet">
                    {zh
                      ? `${regions} 处内容已在 ${frames} 张图像中被遮挡。屏幕文字不会被保留，因此无法在此列出。`
                      : <>{regions === 1 ? "1 area" : `${regions} areas`} covered across{" "}
                          {frames === 1 ? "1 image" : `${frames} images`}. The on-screen text is not kept,
                          so it can&apos;t be listed here.</>}
                  </span>
                </div>
              </div>
            )}
          </div>

          <p className="sensitive-caveat">
            {zh
              ? "此检查在本机运行，并在内容发送给分析服务前完成隐藏。它会处理发送文本（窗口标题、网址、剪贴板、终端命令、备注和语音）及屏幕图像中的机密和个人信息。该功能默认开启，可在“会录制什么”中关闭。"
              : "This ran on your computer and hid these before anything was sent to the analysis provider. It covers secrets and personal details in the text that is sent (window titles, URLs, clipboard, terminal commands, notes, and voice) and in your screen images. It is on by default; you can turn it off in What's recorded."}
          </p>
        </div>
      )}
    </section>
  );
}

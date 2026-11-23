import { useEffect, useState } from "react";
import { downloadText } from "../lib/download";

type ReportPanelProps = {
  areaCode: string;
  markdown: string;
};

export function ReportPanel({ areaCode, markdown }: ReportPanelProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (copyState === "idle") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 2500);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  const copy = () => {
    navigator.clipboard.writeText(markdown).then(
      () => setCopyState("copied"),
      () => setCopyState("failed")
    );
  };

  return (
    <section className="block" aria-labelledby="report-title">
      <div className="block__head">
        <h3 id="report-title">Markdownレポート</h3>
        <div className="button-row">
          <button type="button" className="button" onClick={copy}>
            {copyState === "copied" ? "コピーしました" : "コピー"}
          </button>
          <button
            type="button"
            className="button button--primary"
            onClick={() => downloadText(`local-signal-${areaCode}.md`, markdown, "text/markdown")}
          >
            ダウンロード
          </button>
        </div>
      </div>
      <p className="visually-hidden" role="status">
        {copyState === "copied" ? "レポートをクリップボードにコピーしました。" : ""}
        {copyState === "failed" ? "コピーできませんでした。下の本文を選択してコピーしてください。" : ""}
      </p>
      {copyState === "failed" && (
        <p className="notice">コピーできませんでした。下の本文を選択してコピーしてください。</p>
      )}
      <pre className="report-preview" tabIndex={0} aria-label="レポートの本文">
        {markdown}
      </pre>
      <ul className="notes">
        <li>画面と同じ指標値・シグナル・注意・出典を、1つのファイルにまとめたものです。</li>
      </ul>
    </section>
  );
}

import { useEffect, useState } from "react";
import { Check, Copy, Download } from "lucide-react";

type ReportPanelProps = {
  areaCode: string;
  markdown: string;
};

function downloadMarkdown(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

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
    <section className="panel" aria-labelledby="report-title">
      <div className="panel__head panel__head--actions">
        <div>
          <h3 id="report-title">Markdownレポート</h3>
          <p>画面と同じ指標値・シグナル・注意・出典を、1つのファイルにまとめたものです。</p>
        </div>
        <div className="button-row">
          <button type="button" className="button" onClick={copy}>
            {copyState === "copied" ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            {copyState === "copied" ? "コピーしました" : "コピー"}
          </button>
          <button
            type="button"
            className="button button--primary"
            onClick={() => downloadMarkdown(`local-signal-${areaCode}.md`, markdown)}
          >
            <Download size={16} aria-hidden="true" />
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
    </section>
  );
}

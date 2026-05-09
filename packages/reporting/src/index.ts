import { getIndicatorEntries } from "@local-signal-japan/core";
import type { AreaSignal } from "@local-signal-japan/schemas";
import { buildScoreBreakdown, calculateOverallScore, confidenceLabel } from "@local-signal-japan/scoring";

function bulletList(items: string[]): string {
  if (items.length === 0) {
    return "- なし";
  }

  return items.map((item) => `- ${item}`).join("\n");
}

function formatScore(score: number | null | undefined): string {
  return typeof score === "number" ? `${score}/100` : "欠損";
}

export function generateMarkdownReport(area: AreaSignal): string {
  const overallScore = calculateOverallScore(area);
  const scoreBreakdown = buildScoreBreakdown(area);
  const indicatorSections = getIndicatorEntries(area)
    .map(([, indicator]) => {
      const sourceLines = indicator.sources.map((source) => {
        const mockLabel = source.isMock ? "mock" : "public";
        return `  - ${source.sourceName} (${source.sourceUrlLabel}, retrieved: ${source.retrievedAt}, ${mockLabel}, license: ${source.licenseNote})`;
      });

      return [
        `### ${indicator.label}`,
        `- 値: ${indicator.value ?? "欠損"}${indicator.unit ? ` ${indicator.unit}` : ""}`,
        `- 補助スコア: ${formatScore(indicator.score)}`,
        `- 傾向: ${indicator.trend ?? "unknown"}`,
        "- 注意・根拠:",
        bulletList(indicator.notes),
        "- 出典:",
        sourceLines.join("\n")
      ].join("\n");
    })
    .join("\n\n");

  return [
    `# Local Signal Japan Report: ${area.prefectureName} ${area.areaName}`,
    "",
    `- 自治体コード: ${area.areaCode}`,
    `- 取得日: ${area.retrievedAt}`,
    `- 総合補助スコア: ${formatScore(overallScore)}`,
    `- 信頼度メモ: ${confidenceLabel(area.summary.confidence)}`,
    "",
    "> このレポートは公開データ上のシグナルを整理するためのものです。地域の成長・停滞を断定しません。",
    "",
    "## スコア内訳",
    "",
    scoreBreakdown.map((item) => `- ${item.label}: ${formatScore(item.score)} (${item.band})`).join("\n"),
    "",
    "## 成長シグナル",
    "",
    bulletList(area.summary.growthSignals),
    "",
    "## 停滞シグナル",
    "",
    bulletList(area.summary.stagnationSignals),
    "",
    "## 要注意シグナル",
    "",
    bulletList(area.summary.cautionSignals),
    "",
    "## 欠損データ",
    "",
    bulletList(area.summary.missingDataNotes),
    "",
    "## 指標詳細",
    "",
    indicatorSections,
    "",
    "## 公開前メモ",
    "",
    "- 実データconnectorを有効化する場合はサーバー側でAPIキーを扱ってください。",
    "- 検索語や検索履歴は保存しない設計を維持してください。",
    "- すべての出典・取得日時・加工有無をUIとレポートで確認してください。",
    ""
  ].join("\n");
}

import { AREA_KIND_LABELS, formatDate, formatNumber } from "./format";
import { CONFIDENCE_LABELS, SCORE_BAND_LABELS } from "./scoring";
import type { AreaRecord, Manifest } from "./schema";
import { buildSummary, SUMMARY_SECTIONS } from "./signals";
import { buildAreaView, type AreaView, type IndicatorView } from "./view";

/** レポートと画面で共通の免責文。 */
export const DISCLAIMER =
  "公開統計から読み取れるシグナルを整理したもので、地域の良し悪しや将来を断定するものではありません。";

export function formatScore(score: number | null): string {
  return score === null ? "欠損" : `${score}/100`;
}

function bulletList(items: string[]): string {
  return items.length === 0 ? "- 該当なし" : items.map((item) => `- ${item}`).join("\n");
}

function tableRow(cells: string[]): string {
  return `| ${cells.map((cell) => cell.replaceAll("|", "\\|")).join(" | ")} |`;
}

function indicatorSection(indicator: IndicatorView): string {
  const { definition } = indicator;
  const lines = [
    `### ${definition.label}`,
    "",
    `- 指標値: ${definition.metricLabel} ${indicator.valueText}（${indicator.periodText}）`,
    `- 補助スコア: ${formatScore(indicator.score)}（${SCORE_BAND_LABELS[indicator.band]}）`,
    `- 全国の中央値: ${indicator.medianText}`,
    `- 直近の動き: ${indicator.directionText}（判定基準: ${definition.directionBasis}）`,
    `- 算出方法: ${definition.method}`
  ];

  if (indicator.missingText) {
    lines.push(`- 欠損理由: ${indicator.missingText}`);
  }

  if (indicator.facts.length > 0) {
    lines.push("- 関連する値:");
    lines.push(...indicator.facts.map((fact) => `  - ${fact.label}: ${fact.value}（${fact.period}）`));
  }

  lines.push("- 読み取り時の注意:");
  lines.push(...definition.notes.map((note) => `  - ${note}`));
  lines.push("- 出典系列:");
  lines.push(
    ...indicator.sources.map(
      (source) =>
        `  - [${source.name}](${source.url})（${source.statName}、系列コード ${source.code}、最新 ${source.latestPeriod}）`
    )
  );

  return lines.join("\n");
}

export function renderMarkdownReport(view: AreaView, manifest: Manifest): string {
  const { area } = view;
  const summary = buildSummary(view, manifest);
  const population = area.population === null ? "欠損" : `${formatNumber(area.population)}人（住民基本台帳）`;
  const scoreNote =
    view.overallScore === null
      ? `（利用できる指標が${view.coverage.available}指標のため算出していません）`
      : `（${view.coverage.total}指標中${view.coverage.available}指標の平均）`;

  return [
    `# まちのものさし レポート: ${view.fullName}`,
    "",
    `- 市区町村コード: ${area.code}`,
    `- 区分: ${AREA_KIND_LABELS[area.kind]}`,
    `- 人口: ${population}`,
    `- 総合補助スコア: ${formatScore(view.overallScore)}${scoreNote}`,
    `- 信頼度メモ: ${CONFIDENCE_LABELS[view.confidence.level]}（${view.confidence.reason}）`,
    `- データ取得日: ${formatDate(manifest.generatedAt)}`,
    "",
    `> このレポートは${DISCLAIMER}`,
    "",
    "## スコア内訳",
    "",
    tableRow(["指標", "指標値", "基準時点", "補助スコア", "区分"]),
    tableRow(["---", "---", "---", "---", "---"]),
    ...view.indicators.map((indicator) =>
      tableRow([
        indicator.definition.metricLabel,
        indicator.valueText,
        indicator.periodText,
        formatScore(indicator.score),
        SCORE_BAND_LABELS[indicator.band]
      ])
    ),
    "",
    "補助スコアは、全国の市区町村の中での位置（パーセンタイル）を0〜100で表したものです。",
    "",
    ...SUMMARY_SECTIONS.flatMap((section) => [`## ${section.title}`, "", bulletList(summary[section.key]), ""]),
    "## 指標詳細",
    "",
    view.indicators.map(indicatorSection).join("\n\n"),
    "",
    "## 出典とクレジット",
    "",
    `- 出典: ${manifest.source.attribution}`,
    `- ${manifest.source.credit}`,
    `- 利用規約: [${manifest.source.license}](${manifest.source.licenseUrl})`,
    ""
  ].join("\n");
}

/** AreaRecord から直接レポートを作る簡易入口。 */
export function generateMarkdownReport(area: AreaRecord, manifest: Manifest): string {
  return renderMarkdownReport(buildAreaView(area, manifest), manifest);
}

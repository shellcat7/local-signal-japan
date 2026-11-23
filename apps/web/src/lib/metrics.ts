import {
  FACTS,
  formatFact,
  formatMetric,
  formatNumber,
  INDICATORS,
  isFactKey,
  metricPeriodText,
  type Manifest,
  type RankingMetric
} from "@local-signal-japan/core";

/** 並べ替えに使う値の名前。 */
export function metricName(metric: RankingMetric): string {
  if (metric === "residents") return "人口";
  if (metric === "overall") return "総合補助スコア";
  return isFactKey(metric) ? FACTS[metric].label : INDICATORS[metric].metricLabel;
}

/** 表の列見出しなどに使う短い名前。 */
export function metricShortName(metric: RankingMetric): string {
  if (metric === "residents") return "人口";
  if (metric === "overall") return "総合";
  return isFactKey(metric) ? FACTS[metric].columnLabel : INDICATORS[metric].columnLabel;
}

export function metricPeriod(metric: RankingMetric, manifest: Manifest): string | null {
  if (metric === "residents") return `${manifest.indicators.population.year}年1月1日`;
  if (metric === "overall") return null;
  return isFactKey(metric) ? manifest.facts[metric].period : metricPeriodText(metric, manifest.indicators[metric].year);
}

/** 値を単位つきで書く。 */
export function metricValueText(metric: RankingMetric, value: number): string {
  if (metric === "residents") return `${formatNumber(value)}人`;
  if (metric === "overall") return `${value}`;
  return isFactKey(metric) ? formatFact(FACTS[metric], value) : formatMetric(INDICATORS[metric], value);
}

/** 順位から、ものさしの上の位置（0 = 最も小さい側、100 = 最も大きい側）を求める。 */
export function positionFromRank(rank: number, total: number): number {
  return total > 1 ? ((total - rank) / (total - 1)) * 100 : 50;
}

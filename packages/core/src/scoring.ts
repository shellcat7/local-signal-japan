import { INDICATORS } from "./indicators";
import { INDICATOR_KEYS, type IndicatorKey } from "./model";
import type { AreaRecord, Distribution } from "./schema";

export type ScoreBand = "upper" | "middle" | "lower" | "missing";

export const SCORE_BAND_LABELS: Record<ScoreBand, string> = {
  upper: "上位",
  middle: "中位",
  lower: "下位",
  missing: "欠損"
};

/** 上位帯の下限。全国を3等分したときの上側。 */
export const UPPER_BAND_MIN = 67;
/** 下位帯の上限。全国を3等分したときの下側。 */
export const LOWER_BAND_MAX = 33;
/** 総合補助スコアを算出するのに必要な指標数。 */
export const MIN_INDICATORS_FOR_OVERALL = 4;

export function scoreBand(score: number | null): ScoreBand {
  if (score === null) return "missing";
  if (score >= UPPER_BAND_MIN) return "upper";
  if (score <= LOWER_BAND_MAX) return "lower";
  return "middle";
}

/**
 * 昇順に並んだ基準集団の中での value のパーセンタイル（0〜100）。
 * 同値は半分だけ数える中間順位方式なので、基準集団に含まれる値も含まれない値も同じ式で扱える。
 */
export function percentileOf(sortedReference: readonly number[], value: number): number {
  if (sortedReference.length === 0) {
    throw new Error("基準集団が空です");
  }

  let below = 0;
  let equal = 0;
  for (const reference of sortedReference) {
    if (reference < value) below += 1;
    else if (reference === value) equal += 1;
    else break;
  }

  return ((below + equal / 2) / sortedReference.length) * 100;
}

/** パーセンタイルを指標の向きにそろえた補助スコア（整数 0〜100）に変換する。 */
export function scoreFromPercentile(percentile: number, key: IndicatorKey): number {
  const oriented = INDICATORS[key].orientation === "higher" ? percentile : 100 - percentile;
  return Math.max(0, Math.min(100, Math.round(oriented)));
}

/** 補助スコアから、値の大小でみた全国での位置（0 = 最小側, 100 = 最大側）に戻す。 */
export function positionFromScore(score: number, key: IndicatorKey): number {
  return INDICATORS[key].orientation === "higher" ? score : 100 - score;
}

function quantile(sorted: readonly number[], q: number): number {
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const lowerValue = sorted[lower] as number;
  const upperValue = sorted[upper] as number;
  return lowerValue + (upperValue - lowerValue) * (position - lower);
}

export function summarizeDistribution(sortedValues: readonly number[]): Distribution {
  if (sortedValues.length === 0) {
    throw new Error("分布を要約する値がありません");
  }

  return {
    count: sortedValues.length,
    min: sortedValues[0] as number,
    p10: quantile(sortedValues, 0.1),
    p25: quantile(sortedValues, 0.25),
    p50: quantile(sortedValues, 0.5),
    p75: quantile(sortedValues, 0.75),
    p90: quantile(sortedValues, 0.9),
    max: sortedValues.at(-1) as number
  };
}

export type Coverage = { available: number; total: number };

export function coverage(area: Pick<AreaRecord, "indicators">): Coverage {
  const available = INDICATOR_KEYS.filter((key) => area.indicators[key].score !== null).length;
  return { available, total: INDICATOR_KEYS.length };
}

/** 利用できる指標の補助スコアの単純平均。指標が少なすぎる場合は null。 */
export function overallScore(area: Pick<AreaRecord, "indicators">): number | null {
  const scores = INDICATOR_KEYS.map((key) => area.indicators[key].score).filter((score) => score !== null);

  if (scores.length < MIN_INDICATORS_FOR_OVERALL) {
    return null;
  }

  return Math.round(scores.reduce((total, score) => total + score, 0) / scores.length);
}

export type Confidence = "high" | "medium" | "low";

export const CONFIDENCE_LABELS: Record<Confidence, string> = { high: "高", medium: "中", low: "低" };

/** 率の指標が安定しにくいとみなす人口規模。 */
export const SMALL_POPULATION = 5000;

/**
 * 信頼度メモ。データがどれだけそろっているかと人口規模だけで機械的に決める。
 * - 高: 全指標がそろい、人口1万人以上
 * - 中: 5指標以上がそろい、人口5千人以上
 * - 低: それ以外
 */
export function confidence(area: Pick<AreaRecord, "indicators" | "population">): { level: Confidence; reason: string } {
  const { available, total } = coverage(area);

  if (area.population === null) {
    return { level: "low", reason: "人口の値がなく、規模を確認できません。" };
  }
  const population = area.population;

  if (available === total && population >= 10000) {
    return { level: "high", reason: `${total}指標すべてがそろい、人口が1万人以上です。` };
  }

  if (available >= 5 && population >= SMALL_POPULATION) {
    const reasons = [];
    if (available < total) reasons.push(`${total}指標中${available}指標のみ利用できます`);
    if (population < 10000) reasons.push("人口が1万人未満で率の指標が変動しやすい規模です");
    return { level: "medium", reason: `${reasons.join("。")}。` };
  }

  const reasons = [];
  if (available < 5) reasons.push(`利用できる指標が${total}指標中${available}指標にとどまります`);
  if (population < SMALL_POPULATION) reasons.push("人口が5千人未満で率の指標が大きく変動します");
  return { level: "low", reason: `${reasons.join("。")}。` };
}

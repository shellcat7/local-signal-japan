import { FACTS, formatFact } from "./facts";
import { INDICATORS } from "./indicators";
import { FACT_KEYS, INDICATOR_KEYS, type MetricKey } from "./model";
import { isFactKey, rowMetricValue } from "./national";
import type { Manifest, NationalRow } from "./schema";
import { formatMetric, metricPeriodText } from "./view";

/** 抜き出す範囲（上位・下位それぞれ、同じ値の市区町村も含めてこの数まで）。 */
export const HIGHLIGHT_WITHIN = 10;
/** 人口の少ない市区町村で大きく動く指標は、この人口以上の市区町村の中で比べる。 */
export const HIGHLIGHT_MIN_POPULATION = 10_000;

/** 7指標の、値が大きい側・小さい側を言うときの言葉。 */
const INDICATOR_WORDS: Record<(typeof INDICATOR_KEYS)[number], { high: string; low: string }> = {
  population: { high: "高い", low: "低い" },
  aging: { high: "高い", low: "低い" },
  migration: { high: "高い", low: "低い" },
  business: { high: "多い", low: "少ない" },
  employment: { high: "高い", low: "低い" },
  income: { high: "多い", low: "少ない" },
  fiscal: { high: "高い", low: "低い" }
};

/** 抜き出しの対象にしない指標（意味の取りにくい言い方になるもの）。 */
export const HIGHLIGHT_EXCLUDED: ReadonlySet<MetricKey> = new Set(["furusatoNet"]);

export type Highlight = {
  key: MetricKey;
  side: "high" | "low";
  /** その側から数えた順位（1 = 最も大きい、または最も小さい）。同じ値は同順位。 */
  rank: number;
  /** 比べた市区町村の数。 */
  total: number;
  /** 人口1万人以上の市区町村だけで比べたか。 */
  limited: boolean;
  label: string;
  valueText: string;
  period: string;
  /** 例: 「全国で最も高い」「人口1万人以上の市区町村で3番目に長い」 */
  phrase: string;
};

/** 指標の名前、大きい側・小さい側の言葉、値の表示、基準時点。人口の少ない市区町村を除いて比べるかどうか。 */
export function describeMetric(key: MetricKey, value: number, manifest: Manifest) {
  if (isFactKey(key)) {
    const definition = FACTS[key];
    return {
      label: definition.label,
      words: definition.words,
      valueText: formatFact(definition, value),
      period: manifest.facts[key].period,
      limited: definition.smallAreaCaution
    };
  }
  const definition = INDICATORS[key];
  return {
    label: definition.metricLabel,
    words: INDICATOR_WORDS[key],
    valueText: formatMetric(definition, value),
    period: metricPeriodText(key, manifest.indicators[key].year),
    limited: false
  };
}

/**
 * その市区町村が、全国の上位・下位のどこかに入っている指標を抜き出す。
 * 決まった規則で選ぶだけで、良し悪しは判断しない。政令指定都市の区は基準集団に入らないので対象外。
 */
export function findHighlights(
  target: NationalRow,
  rows: readonly NationalRow[],
  manifest: Manifest,
  limit = 6
): Highlight[] {
  if (target.kind === "ward") return [];

  const reference = rows.filter((row) => row.kind !== "ward");
  const found: Highlight[] = [];

  for (const key of [...INDICATOR_KEYS, ...FACT_KEYS] as MetricKey[]) {
    if (HIGHLIGHT_EXCLUDED.has(key)) continue;
    const value = rowMetricValue(target, key);
    if (value === null) continue;

    const { label, words, valueText, period, limited } = describeMetric(key, value, manifest);
    if (limited && (target.population === null || target.population < HIGHLIGHT_MIN_POPULATION)) continue;

    const values = reference
      .filter((row) => !limited || (row.population !== null && row.population >= HIGHLIGHT_MIN_POPULATION))
      .map((row) => rowMetricValue(row, key))
      .filter((candidate) => candidate !== null);

    const highRank = 1 + values.filter((candidate) => candidate > value).length;
    const lowRank = 1 + values.filter((candidate) => candidate < value).length;
    // 同じ値の市区町村も数に入れて、端から10以内に収まるときだけ抜き出す。
    // （0%のように同じ値が何百もあるとき、「最も低い」と言うと誤解を招くため）
    const atLeast = values.filter((candidate) => candidate >= value).length;
    const atMost = values.filter((candidate) => candidate <= value).length;
    const side = atLeast <= HIGHLIGHT_WITHIN ? "high" : atMost <= HIGHLIGHT_WITHIN ? "low" : null;
    if (side === null) continue;

    const rank = side === "high" ? highRank : lowRank;
    const scope = limited ? "人口1万人以上の市区町村で" : "全国で";
    const ordinal = rank === 1 ? "最も" : `${rank}番目に`;
    found.push({
      key,
      side,
      rank,
      total: values.length,
      limited,
      label,
      valueText,
      period,
      phrase: `${scope}${ordinal}${words[side]}`
    });
  }

  // 端に近いものから。同じ順位なら、表の並び（7指標、くらしの指標の順）。
  return found.sort((a, b) => a.rank - b.rank).slice(0, limit);
}

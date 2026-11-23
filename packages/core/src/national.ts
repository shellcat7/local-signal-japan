import { INDICATOR_KEYS, type IndicatorKey } from "./model";
import { averageScore } from "./scoring";
import type { AreaRecord, NationalRow } from "./schema";

/** ランキングや比較で選べる値。総合補助スコアか、指標ごとの指標値。 */
export type RankingMetric = "overall" | IndicatorKey;

const KEY_INDEX = new Map(INDICATOR_KEYS.map((key, index) => [key, index]));

export function toNationalRow(area: AreaRecord): NationalRow {
  return {
    code: area.code,
    name: area.name,
    ...(area.parentName ? { parentName: area.parentName } : {}),
    prefCode: area.prefCode,
    kind: area.kind,
    population: area.population,
    values: INDICATOR_KEYS.map((key) => area.indicators[key].value),
    scores: INDICATOR_KEYS.map((key) => area.indicators[key].score)
  };
}

export function rowValue(row: NationalRow, key: IndicatorKey): number | null {
  return row.values[KEY_INDEX.get(key) as number] ?? null;
}

export function rowScore(row: NationalRow, key: IndicatorKey): number | null {
  return row.scores[KEY_INDEX.get(key) as number] ?? null;
}

export function rowOverallScore(row: NationalRow): number | null {
  return averageScore(row.scores);
}

/** ランキングで並べる値。総合は補助スコアの平均、指標は指標値そのもの。 */
export function rowMetric(row: NationalRow, metric: RankingMetric): number | null {
  return metric === "overall" ? rowOverallScore(row) : rowValue(row, metric);
}

export const POPULATION_BANDS = [
  { id: "all", label: "すべての規模", min: 0, max: Number.POSITIVE_INFINITY },
  { id: "under-10k", label: "1万人未満", min: 0, max: 10_000 },
  { id: "10k-50k", label: "1万〜5万人", min: 10_000, max: 50_000 },
  { id: "50k-200k", label: "5万〜20万人", min: 50_000, max: 200_000 },
  { id: "over-200k", label: "20万人以上", min: 200_000, max: Number.POSITIVE_INFINITY }
] as const;
export type PopulationBandId = (typeof POPULATION_BANDS)[number]["id"];

export type RankingOptions = {
  metric: RankingMetric;
  /** desc = 値が大きい順。 */
  order: "desc" | "asc";
  /** 都道府県コード。指定しなければ全国。 */
  prefCode?: string | null;
  populationBand?: PopulationBandId;
};

export type RankedRow = { row: NationalRow; value: number; rank: number };

/**
 * 条件に合う市区町村を並べ、順位を付ける（同じ値は同順位）。
 * 政令指定都市の区は市全体と重複するため対象外。値のない市区町村も除く。
 */
export function rankNational(rows: readonly NationalRow[], options: RankingOptions): RankedRow[] {
  const band = POPULATION_BANDS.find((candidate) => candidate.id === (options.populationBand ?? "all"));
  const direction = options.order === "desc" ? -1 : 1;

  const ranked = rows
    .filter((row) => row.kind !== "ward")
    .filter((row) => !options.prefCode || row.prefCode === options.prefCode)
    .filter((row) => {
      if (!band || band.id === "all") return true;
      return row.population !== null && row.population >= band.min && row.population < band.max;
    })
    .map((row) => ({ row, value: rowMetric(row, options.metric) }))
    .filter((entry): entry is { row: NationalRow; value: number } => entry.value !== null)
    .sort((a, b) => (a.value - b.value) * direction || a.row.code.localeCompare(b.row.code));

  let rank = 0;
  return ranked.map((entry, index) => {
    if (index === 0 || entry.value !== (ranked[index - 1] as { value: number }).value) rank = index + 1;
    return { ...entry, rank };
  });
}

/** 傾向の近さを比べるのに必要な、共通して値のある指標の数。 */
export const MIN_SHARED_INDICATORS = 5;
/** 人口規模の差（常用対数）に掛ける重み。規模が10倍違うと、補助スコアが平均50点違うのと同じ距離になる。 */
const POPULATION_WEIGHT = 0.5;

export type SimilarArea = { row: NationalRow; distance: number };

/**
 * 補助スコアの並び方と人口規模が近い市区町村を、全国から近い順に返す。
 * 距離 = √(補助スコアの差の二乗平均（0〜1に換算）+（人口の常用対数の差 × 重み）²)。
 * 総務省の「類似団体」の区分とは別の、この道具だけの目安。
 */
export function findSimilarAreas(rows: readonly NationalRow[], target: NationalRow, count = 5): SimilarArea[] {
  if (target.population === null || target.population <= 0) return [];
  const targetSize = Math.log10(target.population);
  const similar: SimilarArea[] = [];

  for (const row of rows) {
    if (row.code === target.code || row.population === null || row.population <= 0) continue;

    let shared = 0;
    let squared = 0;
    for (let index = 0; index < INDICATOR_KEYS.length; index += 1) {
      const a = target.scores[index] ?? null;
      const b = row.scores[index] ?? null;
      if (a === null || b === null) continue;
      shared += 1;
      squared += ((a - b) / 100) ** 2;
    }
    if (shared < MIN_SHARED_INDICATORS) continue;

    const sizeGap = (Math.log10(row.population) - targetSize) * POPULATION_WEIGHT;
    similar.push({ row, distance: Math.sqrt(squared / shared + sizeGap ** 2) });
  }

  return similar.sort((a, b) => a.distance - b.distance || a.row.code.localeCompare(b.row.code)).slice(0, count);
}

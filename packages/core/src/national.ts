import { INDICATORS } from "./indicators";
import { INDICATOR_KEYS, type IndicatorKey } from "./model";
import { averageScore } from "./scoring";
import type { AreaRecord, NationalRow } from "./schema";

/** 一覧で並べ替えに使える値。人口、総合補助スコア、指標ごとの指標値。 */
export type RankingMetric = "residents" | "overall" | IndicatorKey;

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

/** 一覧で並べる値。人口は住民基本台帳人口、総合は補助スコアの平均、指標は指標値そのもの。 */
export function rowMetric(row: NationalRow, metric: RankingMetric): number | null {
  if (metric === "residents") return row.population;
  return metric === "overall" ? rowOverallScore(row) : rowValue(row, metric);
}

/**
 * 指標値が全国の中でどの位置にあるかを、値の大小の向きで表す（0 = 最も小さい側、100 = 最も大きい側）。
 * 補助スコアは「値が小さいほど高い」指標で向きを反転しているので、ここで元に戻す。
 */
export function valuePosition(key: IndicatorKey, score: number | null): number | null {
  if (score === null) return null;
  return INDICATORS[key].orientation === "lower" ? 100 - score : score;
}

export const POPULATION_BANDS = [
  { id: "all", label: "すべての規模", min: 0, max: Number.POSITIVE_INFINITY },
  { id: "under-10k", label: "1万人未満", min: 0, max: 10_000 },
  { id: "10k-50k", label: "1万〜5万人", min: 10_000, max: 50_000 },
  { id: "50k-200k", label: "5万〜20万人", min: 50_000, max: 200_000 },
  { id: "over-200k", label: "20万人以上", min: 200_000, max: Number.POSITIVE_INFINITY }
] as const;
export type PopulationBandId = (typeof POPULATION_BANDS)[number]["id"];

/** 指標値の範囲（両端を含む）。単位は指標値と同じ。 */
export type RangeFilter = { min?: number; max?: number };
export type IndicatorFilters = Partial<Record<IndicatorKey, RangeFilter>>;

export type RankingOptions = {
  metric: RankingMetric;
  /** desc = 値が大きい順。 */
  order: "desc" | "asc";
  /** 都道府県コード。指定しなければ全国。 */
  prefCode?: string | null;
  populationBand?: PopulationBandId;
  /** 指標値の条件。条件を付けた指標の値がない市区町村は、対象から外れる。 */
  filters?: IndicatorFilters;
};

/** 条件として意味のある範囲だけを残す（数値でないもの、空の指定を捨てる）。 */
export function activeFilters(filters: IndicatorFilters | undefined): Array<[IndicatorKey, RangeFilter]> {
  const active: Array<[IndicatorKey, RangeFilter]> = [];
  for (const key of INDICATOR_KEYS) {
    const range = filters?.[key];
    const min = Number.isFinite(range?.min) ? (range?.min as number) : undefined;
    const max = Number.isFinite(range?.max) ? (range?.max as number) : undefined;
    if (min === undefined && max === undefined) continue;
    active.push([key, { ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }) }]);
  }
  return active;
}

/** すべての条件を満たすか。値は同梱データセットの値（画面に出る桁に丸めたもの）と比べる。 */
export function matchesFilters(row: NationalRow, filters: ReadonlyArray<[IndicatorKey, RangeFilter]>): boolean {
  return filters.every(([key, range]) => {
    const value = rowValue(row, key);
    if (value === null) return false;
    return (range.min === undefined || value >= range.min) && (range.max === undefined || value <= range.max);
  });
}

export type RankedRow = { row: NationalRow; value: number; rank: number };

/**
 * 条件に合う市区町村を並べ、順位を付ける（同じ値は同順位）。順位は、条件で絞り込んだ中で付ける。
 * 政令指定都市の区は市全体と重複するため対象外。値のない市区町村も除く。
 */
/** 並べ替え以外の条件（対象・都道府県・人口規模・指標値の範囲）に合う市区町村。 */
function inScope(rows: readonly NationalRow[], options: Omit<RankingOptions, "metric" | "order">): NationalRow[] {
  const band = POPULATION_BANDS.find((candidate) => candidate.id === (options.populationBand ?? "all"));
  const filters = activeFilters(options.filters);

  return rows
    .filter((row) => row.kind !== "ward")
    .filter((row) => matchesFilters(row, filters))
    .filter((row) => !options.prefCode || row.prefCode === options.prefCode)
    .filter((row) => {
      if (!band || band.id === "all") return true;
      return row.population !== null && row.population >= band.min && row.population < band.max;
    });
}

export function rankNational(rows: readonly NationalRow[], options: RankingOptions): RankedRow[] {
  const direction = options.order === "desc" ? -1 : 1;

  const ranked = inScope(rows, options)
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

/**
 * 条件には合うが、並べる値がないために順位を付けられない市区町村（市区町村コード順）。
 * 一覧からこれを落とすと「条件に合うものをすべて」にならないので、順位なしで末尾に並べるために使う。
 */
export function unrankedNational(rows: readonly NationalRow[], options: Omit<RankingOptions, "order">): NationalRow[] {
  return inScope(rows, options)
    .filter((row) => rowMetric(row, options.metric) === null)
    .sort((a, b) => a.code.localeCompare(b.code));
}

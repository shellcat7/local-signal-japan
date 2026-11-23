import {
  areaIndexSchema,
  buildHistogram,
  computeMetric,
  CONTEXT_UPSTREAM,
  DATASET_SCHEMA_VERSION,
  INDICATOR_KEYS,
  INDICATORS,
  manifestSchema,
  nationalFileSchema,
  percentileOf,
  prefectureFileSchema,
  rankOf,
  roundTo,
  scoreFromPercentile,
  summarizeDistribution,
  toNationalRow,
  valueAt,
  type AreaIndex,
  type AreaIndicator,
  type AreaRecord,
  type AreaSeries,
  type IndicatorKey,
  type Manifest,
  type ManifestIndicator,
  type NationalFile,
  type PrefectureFile,
  type SeriesPoint,
  type SourceSeries,
  type UpstreamSeries
} from "@local-signal-japan/core";
import type { UpstreamArea, UpstreamPrefecture, UpstreamSeriesData } from "./upstream";

export type UpstreamSnapshot = {
  prefectures: UpstreamPrefecture[];
  areas: UpstreamArea[];
  /** 上流系列の id → 取得結果。 */
  series: Record<string, UpstreamSeriesData>;
};

export type Dataset = {
  manifest: Manifest;
  index: AreaIndex;
  national: NationalFile;
  prefectures: PrefectureFile[];
};

export const SOURCE_INFO: Manifest["source"] = {
  name: "統計ダッシュボード（総務省統計局）",
  url: "https://dashboard.e-stat.go.jp/",
  apiUrl: "https://dashboard.e-stat.go.jp/static/api",
  license: "公共データ利用規約（第1.0版）",
  licenseUrl: "https://dashboard.e-stat.go.jp/static/terms",
  attribution: "統計ダッシュボード（https://dashboard.e-stat.go.jp/）のデータを加工して作成",
  credit:
    "このサービスは、統計ダッシュボードのAPI機能を使用していますが、サービスの内容は国によって保証されたものではありません。"
};

/** 各指標の基準年を決めるのに使う系列（指標キー → 保持系列キー）。 */
const YEAR_PROBE: Record<IndicatorKey, string> = {
  population: "residents",
  aging: "ratio",
  migration: "inflow",
  business: "establishments",
  employment: "unemployment",
  income: "perTaxpayer",
  fiscal: "index"
};

/**
 * ある年を基準年として採用するのに必要な、収録数の割合（収録数が最も多い年に対して）。
 * 低くしすぎると、公開途中の年を採用して基準集団が足りなくなり、更新が失敗する。
 */
const WELL_COVERED_SHARE = 0.9;

/** 上流の取りこぼしを検知するための下限。現存する市区町村は約1,900。 */
const MIN_AREAS = 1700;
const MAX_AREAS = 2100;
const MIN_REFERENCE_AREAS = 1500;

function upstreamData(snapshot: UpstreamSnapshot, id: string): UpstreamSeriesData {
  const data = snapshot.series[id];
  if (!data) {
    throw new Error(`上流系列が取得されていません: ${id}`);
  }
  return data;
}

function pointsOf(snapshot: UpstreamSnapshot, id: string, areaCode: string): SeriesPoint[] {
  return upstreamData(snapshot, id).valuesByArea.get(areaCode) ?? [];
}

/** 2つの系列を年でそろえ、両方に値がある年だけ combine の結果を返す。 */
function combine(
  a: SeriesPoint[],
  b: SeriesPoint[],
  fn: (valueA: number, valueB: number) => number | null
): SeriesPoint[] {
  const result: SeriesPoint[] = [];
  for (const [year, valueA] of a) {
    const valueB = valueAt(b, year);
    if (valueB === null) continue;
    const combined = fn(valueA, valueB);
    if (combined !== null) result.push([year, combined]);
  }
  return result;
}

/** 保持系列の値を、指標定義で決めた小数桁にそろえる。 */
function roundSeries(series: AreaSeries): AreaSeries {
  return Object.fromEntries(
    INDICATOR_KEYS.map((key) => [
      key,
      Object.fromEntries(
        INDICATORS[key].series.map((stored) => [
          stored.key,
          (series[key][stored.key] ?? []).map(([year, value]): SeriesPoint => [year, roundTo(value, stored.decimals)])
        ])
      )
    ])
  ) as AreaSeries;
}

function buildAreaSeries(snapshot: UpstreamSnapshot, areaCode: string): AreaSeries {
  const inflow = pointsOf(snapshot, "inflow", areaCode);
  const outflow = pointsOf(snapshot, "outflow", areaCode);
  // 2021年調査から系列コードが分かれているため、1本の時系列に並べ直す。
  const establishments = [
    ...pointsOf(snapshot, "establishmentsLegacy", areaCode),
    ...pointsOf(snapshot, "establishments", areaCode)
  ].sort((a, b) => a[0] - b[0]);

  return roundSeries({
    population: { residents: pointsOf(snapshot, "residents", areaCode) },
    aging: { ratio: pointsOf(snapshot, "ratio", areaCode) },
    migration: {
      net: combine(inflow, outflow, (incoming, outgoing) => incoming - outgoing),
      inflow,
      outflow
    },
    business: { establishments },
    employment: { unemployment: pointsOf(snapshot, "unemployment", areaCode) },
    income: {
      // 課税対象所得（千円） ÷ 納税義務者数（人） を万円に換算する。
      perTaxpayer: combine(
        pointsOf(snapshot, "taxableIncome", areaCode),
        pointsOf(snapshot, "taxpayers", areaCode),
        (income, taxpayers) => (taxpayers > 0 ? roundTo(income / taxpayers / 10, 1) : null)
      )
    },
    fiscal: { index: pointsOf(snapshot, "index", areaCode) }
  });
}

function hasAnyData(series: AreaSeries): boolean {
  return INDICATOR_KEYS.some((key) => Object.values(series[key]).some((points) => points.length > 0));
}

/**
 * 全国で十分にそろっている最新年を返す。
 * 上流が新しい年を一部の市区町村だけ先に公開している場合に、その年を基準年にしないための判定。
 */
export function latestWellCoveredYear(seriesList: readonly SeriesPoint[][]): number {
  const counts = new Map<number, number>();
  for (const points of seriesList) {
    for (const [year] of points) {
      counts.set(year, (counts.get(year) ?? 0) + 1);
    }
  }

  const threshold = Math.max(...counts.values(), 0) * WELL_COVERED_SHARE;
  const years = [...counts.entries()].filter(([, count]) => count >= threshold).map(([year]) => year);
  if (years.length === 0) {
    throw new Error("基準年を決められる系列データがありません");
  }
  return Math.max(...years);
}

function latestYear(data: UpstreamSeriesData): number {
  return latestWellCoveredYear([...data.valuesByArea.values()]);
}

function sourceOf(snapshot: UpstreamSnapshot, upstream: UpstreamSeries): SourceSeries {
  const data = upstreamData(snapshot, upstream.id);
  return {
    id: upstream.id,
    code: upstream.code,
    name: data.name,
    statName: data.statName,
    unit: data.unit,
    cycle: upstream.cycle,
    latestYear: latestYear(data)
  };
}

/** 上流の取得結果からデータセット一式を組み立てる（入出力なしの純粋関数）。 */
export function buildDataset(snapshot: UpstreamSnapshot, generatedAt: string): Dataset {
  const prefNames = new Map(snapshot.prefectures.map((pref) => [pref.code, pref.name]));
  if (prefNames.size !== 47) {
    throw new Error(`都道府県が47件ではありません: ${prefNames.size}件`);
  }

  // 北方領土の村など、統計が一切ない地域は対象外にする。
  const members = snapshot.areas
    .map((area) => ({ area, series: buildAreaSeries(snapshot, area.code) }))
    .filter(({ series }) => hasAnyData(series));

  if (members.length < MIN_AREAS || members.length > MAX_AREAS) {
    throw new Error(`市区町村数が想定の範囲外です: ${members.length}件`);
  }

  const years = Object.fromEntries(
    INDICATOR_KEYS.map((key) => [
      key,
      latestWellCoveredYear(members.map(({ series }) => series[key][YEAR_PROBE[key]] ?? []))
    ])
  ) as Record<IndicatorKey, number>;

  const daytimeRatio = upstreamData(snapshot, CONTEXT_UPSTREAM.daytimeRatio.id);
  const daytimeYear = latestYear(daytimeRatio);

  const metrics = members.map(({ area, series }) => ({
    area,
    series,
    results: Object.fromEntries(INDICATOR_KEYS.map((key) => [key, computeMetric(key, series, years[key])])) as Record<
      IndicatorKey,
      ReturnType<typeof computeMetric>
    >
  }));

  // 政令指定都市の区は市全体と重複するため、分布の基準集団からは除く。
  const reference = Object.fromEntries(
    INDICATOR_KEYS.map((key) => [
      key,
      metrics
        .filter(({ area }) => area.kind !== "ward")
        .map(({ results }) => results[key].value)
        .filter((value) => value !== null)
        .sort((a, b) => a - b)
    ])
  ) as Record<IndicatorKey, number[]>;

  for (const key of INDICATOR_KEYS) {
    if (reference[key].length < MIN_REFERENCE_AREAS) {
      throw new Error(`指標 ${key} の基準集団が少なすぎます: ${reference[key].length}件`);
    }
  }

  const records: AreaRecord[] = metrics.map(({ area, series, results }) => {
    const prefCode = area.code.slice(0, 2);
    const prefName = prefNames.get(prefCode);
    if (!prefName) {
      throw new Error(`都道府県が見つかりません: ${area.code}`);
    }

    const indicators = Object.fromEntries(
      INDICATOR_KEYS.map((key): [IndicatorKey, AreaIndicator] => {
        const result = results[key];
        if (result.value === null) {
          return [key, { value: null, score: null, rank: null, series: series[key], missing: result.missing }];
        }
        const score = scoreFromPercentile(percentileOf(reference[key], result.value), key);
        // 順位は基準集団の中だけで付ける。区は市全体と重複するので順位を持たない。
        const rank = area.kind === "ward" ? null : rankOf(reference[key], result.value);
        return [key, { value: result.value, score, rank, series: series[key] }];
      })
    ) as Record<IndicatorKey, AreaIndicator>;

    return {
      code: area.code,
      name: area.name,
      kana: area.kana,
      prefCode,
      prefName,
      ...(area.parentName ? { parentName: area.parentName } : {}),
      kind: area.kind,
      population: valueAt(series.population.residents, years.population),
      daytimeRatio: valueAt(daytimeRatio.valuesByArea.get(area.code), daytimeYear),
      indicators
    };
  });

  const manifest = manifestSchema.parse({
    schemaVersion: DATASET_SCHEMA_VERSION,
    generatedAt,
    source: SOURCE_INFO,
    counts: {
      areas: records.length,
      referenceAreas: records.filter((record) => record.kind !== "ward").length
    },
    context: { daytimeRatio: sourceOf(snapshot, CONTEXT_UPSTREAM.daytimeRatio) },
    indicators: Object.fromEntries(
      INDICATOR_KEYS.map((key): [IndicatorKey, ManifestIndicator] => [
        key,
        {
          year: years[key],
          distribution: summarizeDistribution(reference[key]),
          histogram: buildHistogram(reference[key]),
          sources: INDICATORS[key].upstream.map((upstream) => sourceOf(snapshot, upstream))
        }
      ])
    ) as Record<IndicatorKey, ManifestIndicator>
  } satisfies Manifest);

  const index = areaIndexSchema.parse({
    prefectures: snapshot.prefectures,
    areas: records.map((record) => ({
      code: record.code,
      name: record.name,
      kana: record.kana,
      prefCode: record.prefCode,
      ...(record.parentName ? { parentName: record.parentName } : {}),
      kind: record.kind
    }))
  } satisfies AreaIndex);

  const prefectures = snapshot.prefectures.map((pref) =>
    prefectureFileSchema.parse({
      prefCode: pref.code,
      prefName: pref.name,
      areas: records.filter((record) => record.prefCode === pref.code)
    } satisfies PrefectureFile)
  );

  const national = nationalFileSchema.parse({
    indicatorKeys: [...INDICATOR_KEYS],
    areas: records.map(toNationalRow)
  } satisfies NationalFile);

  return { manifest, index, national, prefectures };
}

import {
  areaIndexSchema,
  buildHistogram,
  computeFact,
  computeMetric,
  CONTEXT_UPSTREAM,
  DATASET_SCHEMA_VERSION,
  FACT_KEYS,
  FACTS,
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
  type AdditionalSource,
  type AreaFact,
  type AreaIndex,
  type AreaIndicator,
  type AreaRecord,
  type AreaSeries,
  type FactKey,
  type IndicatorKey,
  type Manifest,
  type ManifestFact,
  type ManifestIndicator,
  type NationalFile,
  type PrefectureFile,
  type SeriesPoint,
  type SourceSeries,
  type UpstreamSeries
} from "@local-signal-japan/core";
import type { FurusatoData } from "./furusato";
import type { UpstreamArea, UpstreamPrefecture, UpstreamSeriesData } from "./upstream";

export type UpstreamSnapshot = {
  prefectures: UpstreamPrefecture[];
  areas: UpstreamArea[];
  /** 上流系列の id → 取得結果。 */
  series: Record<string, UpstreamSeriesData>;
  /** 総務省「ふるさと納税に関する現況調査結果」。 */
  furusato: FurusatoData;
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

export const FURUSATO_SOURCE: AdditionalSource = {
  id: "furusato",
  name: "ふるさと納税に関する現況調査結果（総務省）",
  url: "https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/furusato/archive/",
  license: "公共データ利用規約（第1.0版）",
  licenseUrl: "https://www.soumu.go.jp/menu_kyotsuu/policy/tyosaku.html",
  attribution: "総務省「ふるさと納税に関する現況調査結果」を加工して作成"
};

/** くらしの指標の基準集団（政令指定都市の区を除く、値のある市区町村）の下限。住宅・土地統計調査は約1,060団体。 */
const MIN_FACT_REFERENCE_AREAS = 900;

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

/**
 * 系列の最新年。収録している市区町村だけで数える。
 * 上流には合併で廃止された市区町村の古い値も残っており、それを含めると古い年が「最もそろっている年」になってしまう。
 */
function latestYear(data: UpstreamSeriesData, areaCodes: ReadonlySet<string>): number {
  return latestWellCoveredYear(
    [...data.valuesByArea].filter(([code]) => areaCodes.has(code)).map(([, points]) => points)
  );
}

function sourceOf(snapshot: UpstreamSnapshot, upstream: UpstreamSeries, areaCodes: ReadonlySet<string>): SourceSeries {
  const data = upstreamData(snapshot, upstream.id);
  return {
    id: upstream.id,
    code: upstream.code,
    name: data.name,
    statName: data.statName,
    unit: data.unit,
    cycle: upstream.cycle,
    latestYear: latestYear(data, areaCodes)
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

  const memberCodes = new Set(members.map(({ area }) => area.code));
  const daytimeRatio = upstreamData(snapshot, CONTEXT_UPSTREAM.daytimeRatio.id);
  const daytimeYear = latestYear(daytimeRatio, memberCodes);

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

  const factBuild = buildFacts(snapshot, members, years.population, memberCodes);

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
      indicators,
      facts: factBuild.facts.get(area.code) as Record<FactKey, AreaFact>
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
    additionalSources: [FURUSATO_SOURCE],
    context: { daytimeRatio: sourceOf(snapshot, CONTEXT_UPSTREAM.daytimeRatio, memberCodes) },
    indicators: Object.fromEntries(
      INDICATOR_KEYS.map((key): [IndicatorKey, ManifestIndicator] => [
        key,
        {
          year: years[key],
          distribution: summarizeDistribution(reference[key]),
          histogram: buildHistogram(reference[key]),
          sources: INDICATORS[key].upstream.map((upstream) => sourceOf(snapshot, upstream, memberCodes))
        }
      ])
    ) as Record<IndicatorKey, ManifestIndicator>,
    facts: factBuild.manifest
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
    factKeys: [...FACT_KEYS],
    areas: records.map(toNationalRow)
  } satisfies NationalFile);

  return { manifest, index, national, prefectures };
}

type Member = { area: UpstreamArea; series: AreaSeries };

/**
 * くらしの指標を求める。値はもとの数（basis）から指標定義の計算式で求め、もとの数も一緒に保持する。
 * 順位と分布は、政令指定都市の区を除く市区町村の中で付ける。
 */
function buildFacts(
  snapshot: UpstreamSnapshot,
  members: readonly Member[],
  populationYear: number,
  memberCodes: ReadonlySet<string>
): { facts: Map<string, Record<FactKey, AreaFact>>; manifest: Record<FactKey, ManifestFact> } {
  const { furusato } = snapshot;
  const residentsAt = (code: string, year: number) =>
    valueAt(pointsOf(snapshot, "residents", code), Math.min(year, populationYear));

  const yearOf = (key: FactKey): number => {
    const definition = FACTS[key];
    if (key === "projection2050") return 2050;
    if (key === "furusatoOutflow") return furusato.deductionYear;
    if (definition.provider === "furusato") return furusato.receiptsYear;
    if (!definition.yearProbe) throw new Error(`指標 ${key} の基準年を決める系列がありません`);
    const probe = definition.yearProbe;
    return latestWellCoveredYear(members.map(({ area }) => pointsOf(snapshot, probe, area.code)));
  };
  const years = Object.fromEntries(FACT_KEYS.map((key) => [key, yearOf(key)])) as Record<FactKey, number>;

  const resolve = (key: FactKey, name: string, code: string): number | null => {
    const year = years[key];
    switch (name) {
      case "residents":
        return residentsAt(code, year);
      case "projection2025":
        return valueAt(pointsOf(snapshot, "projection", code), 2025);
      case "projection2050":
        return valueAt(pointsOf(snapshot, "projection", code), 2050);
      case "receipts":
        return furusato.receipts.get(code) ?? null;
      case "costs":
        return furusato.costs.get(code) ?? null;
      case "deduction":
        return furusato.deductions.get(code) ?? null;
      default:
        return valueAt(pointsOf(snapshot, name, code), year);
    }
  };

  const facts = new Map<string, Record<FactKey, AreaFact>>();
  const reference = Object.fromEntries(FACT_KEYS.map((key) => [key, [] as number[]])) as Record<FactKey, number[]>;

  for (const { area } of members) {
    const entries = FACT_KEYS.map((key): [FactKey, AreaFact] => {
      const basis: Record<string, number> = {};
      for (const name of Object.keys(FACTS[key].basis)) {
        const value = resolve(key, name, area.code);
        if (value === null) return [key, { value: null, rank: null, basis: {} }];
        basis[name] = value;
      }
      const value = computeFact(key, basis);
      if (value === null) return [key, { value: null, rank: null, basis: {} }];
      if (area.kind !== "ward") reference[key].push(value);
      return [key, { value, rank: null, basis }];
    });
    facts.set(area.code, Object.fromEntries(entries) as Record<FactKey, AreaFact>);
  }

  for (const key of FACT_KEYS) {
    reference[key].sort((a, b) => a - b);
    if (reference[key].length < MIN_FACT_REFERENCE_AREAS) {
      throw new Error(`くらしの指標 ${key} の基準集団が少なすぎます: ${reference[key].length}件`);
    }
  }

  // 順位は基準集団の中だけで付ける。
  for (const { area } of members) {
    if (area.kind === "ward") continue;
    const record = facts.get(area.code) as Record<FactKey, AreaFact>;
    for (const key of FACT_KEYS) {
      const fact = record[key];
      if (fact.value !== null) record[key] = { ...fact, rank: rankOf(reference[key], fact.value) };
    }
  }

  const residentsUpstream = INDICATORS.population.upstream[0] as UpstreamSeries;
  const [receiptsDocument, deductionsDocument] = furusato.documents;
  const manifest = Object.fromEntries(
    FACT_KEYS.map((key): [FactKey, ManifestFact] => {
      const definition = FACTS[key];
      const basisNames = Object.keys(definition.basis);
      const upstream = [...definition.upstream, ...(basisNames.includes("residents") ? [residentsUpstream] : [])];
      const documents = [
        ...(basisNames.some((name) => name === "receipts" || name === "costs") && receiptsDocument
          ? [receiptsDocument]
          : []),
        ...(basisNames.includes("deduction") && deductionsDocument ? [deductionsDocument] : [])
      ];
      return [
        key,
        {
          year: years[key],
          period: definition.period(years[key]),
          distribution: summarizeDistribution(reference[key]),
          sources: upstream.map((series) => sourceOf(snapshot, series, memberCodes)),
          documents
        }
      ];
    })
  ) as Record<FactKey, ManifestFact>;

  return { facts, manifest };
}

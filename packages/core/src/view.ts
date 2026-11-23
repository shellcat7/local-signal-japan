import { areaFullName, areaLocalName, formatNumber, formatYear } from "./format";
import {
  COMPARISON_LAG_YEARS,
  computeChange,
  computeDirection,
  INDICATORS,
  MIGRATION_WINDOW_YEARS,
  residentsAsOf,
  valueAt,
  type AreaSeries,
  type Direction,
  type IndicatorDefinition,
  type StoredSeries
} from "./indicators";
import {
  confidence,
  coverage,
  overallScore,
  positionFromScore,
  scoreBand,
  type Confidence,
  type Coverage,
  type ScoreBand
} from "./scoring";
import { INDICATOR_KEYS, type IndicatorKey } from "./model";
import type { AreaRecord, Manifest, ManifestIndicator, SeriesPoint } from "./schema";

export type IndicatorFact = { label: string; value: string; period: string };

export type IndicatorSource = {
  name: string;
  statName: string;
  code: string;
  latestPeriod: string;
  /** この市区町村・この系列の値を返す統計ダッシュボードAPIのURL。 */
  url: string;
};

export type IndicatorChart = {
  series: StoredSeries;
  points: SeriesPoint[];
  /** この年より後は調査方法が異なり、線でつなげない。 */
  breakAfterYear?: number;
};

export type IndicatorView = {
  key: IndicatorKey;
  definition: IndicatorDefinition;
  available: boolean;
  value: number | null;
  /** 単位つきの指標値。欠損時は「欠損」。 */
  valueText: string;
  /** 指標値の基準時点。例: 2020→2025年 */
  periodText: string;
  score: number | null;
  band: ScoreBand;
  /** 値の大小でみた全国での位置（0 = 最小側, 100 = 最大側）。 */
  position: number | null;
  /** 基準集団の中央値（単位つき）。 */
  medianText: string;
  direction: Direction;
  directionText: string;
  /**
   * 一覧で最初に見せる水準。多くの指標では指標値と同じだが、
   * 人口は増減率ではなく人口そのものを見せる（増減率は change に入る）。
   */
  headline: { label: string; text: string; period: string } | null;
  /** 5年前と比べた変化。比べられない指標・欠損は null。sign は増減の向き（-1・0・1）。 */
  change: { label: string; text: string; sign: -1 | 0 | 1 } | null;
  /** 基準集団の中で、値が大きい順の順位。政令指定都市の区と欠損は null。 */
  rank: number | null;
  /** 順位の母数（その指標の値がある基準集団の団体数）。 */
  rankTotal: number;
  facts: IndicatorFact[];
  missingText: string | null;
  chart: IndicatorChart | null;
  sources: IndicatorSource[];
};

export type AreaView = {
  area: AreaRecord;
  fullName: string;
  localName: string;
  overallScore: number | null;
  overallBand: ScoreBand;
  coverage: Coverage;
  confidence: { level: Confidence; reason: string };
  indicators: IndicatorView[];
  retrievedAt: string;
};

const API_BASE = "https://dashboard.e-stat.go.jp/api/1.0/Json/getData";

/** 調査方法の変更で系列が連続しない箇所。 */
const SERIES_BREAKS: Partial<Record<IndicatorKey, number>> = { business: 2016 };

export function sourceUrl(seriesCode: string, areaCode: string): string {
  return `${API_BASE}?Lang=JP&IndicatorCode=${seriesCode}&RegionCode=${areaCode}`;
}

export function areaSeries(area: AreaRecord): AreaSeries {
  return Object.fromEntries(INDICATOR_KEYS.map((key) => [key, area.indicators[key].series])) as AreaSeries;
}

export function formatMetric(definition: IndicatorDefinition, value: number): string {
  return `${formatNumber(value, definition.decimals, definition.signed)}${definition.unit}`;
}

function formatSeriesValue(series: StoredSeries, value: number, signed = false): string {
  return `${formatNumber(value, series.decimals, signed)}${series.unit}`;
}

export function metricPeriodText(key: IndicatorKey, year: number): string {
  switch (key) {
    case "population":
      return `${year - COMPARISON_LAG_YEARS}→${year}年`;
    case "migration":
      return `${year - MIGRATION_WINDOW_YEARS + 1}〜${year}年`;
    case "income":
    case "fiscal":
      return formatYear(year, "FY");
    case "aging":
    case "business":
    case "employment":
      return formatYear(year, "CY");
  }
}

function seriesOf(definition: IndicatorDefinition, key: string): StoredSeries {
  const series = definition.series.find((candidate) => candidate.key === key);
  if (!series) {
    throw new Error(`系列定義が見つかりません: ${definition.key}.${key}`);
  }
  return series;
}

/** 系列 seriesKey の year 時点の値を事実として1行にまとめる。値がなければ何も返さない。 */
function factAt(
  area: AreaRecord,
  definition: IndicatorDefinition,
  seriesKey: string,
  year: number,
  label?: string,
  options: { periodSuffix?: string; signed?: boolean } = {}
): IndicatorFact[] {
  const series = seriesOf(definition, seriesKey);
  const value = valueAt(area.indicators[definition.key].series[seriesKey], year);
  if (value === null) return [];

  return [
    {
      label: label ?? series.label,
      value: formatSeriesValue(series, value, options.signed),
      period: `${formatYear(year, series.cycle)}${options.periodSuffix ?? ""}`
    }
  ];
}

function buildFacts(area: AreaRecord, key: IndicatorKey, year: number): IndicatorFact[] {
  const definition = INDICATORS[key];
  const past = year - COMPARISON_LAG_YEARS;

  switch (key) {
    case "population":
      return [
        ...factAt(area, definition, "residents", year, undefined, { periodSuffix: residentsAsOf(year) }),
        ...factAt(area, definition, "residents", past, "5年前の人口", { periodSuffix: residentsAsOf(past) })
      ];
    case "aging":
      return [
        ...factAt(area, definition, "ratio", year, "高齢化率"),
        ...factAt(area, definition, "ratio", year - 5, "前回調査の高齢化率")
      ];
    case "migration":
      return [
        ...factAt(area, definition, "inflow", year),
        ...factAt(area, definition, "outflow", year),
        ...factAt(area, definition, "net", year, undefined, { signed: true })
      ];
    case "business":
      return factAt(area, definition, "establishments", year);
    case "employment":
      return [
        ...factAt(area, definition, "unemployment", year),
        ...factAt(area, definition, "unemployment", year - 5, "前回調査の完全失業率")
      ];
    case "income":
      return [
        ...factAt(area, definition, "perTaxpayer", year),
        ...factAt(area, definition, "perTaxpayer", past, "5年前の1人当たり課税対象所得")
      ];
    case "fiscal":
      return [
        ...factAt(area, definition, "index", year),
        ...factAt(area, definition, "index", past, "5年前の財政力指数")
      ];
  }
}

function buildHeadline(area: AreaRecord, key: IndicatorKey, year: number): IndicatorView["headline"] {
  const definition = INDICATORS[key];
  const { value } = area.indicators[key];
  if (value === null) return null;

  if (key === "population") {
    const [fact] = factAt(area, definition, "residents", year, undefined, { periodSuffix: residentsAsOf(year) });
    return fact ? { label: definition.headlineLabel, text: fact.value, period: fact.period } : null;
  }

  return {
    label: definition.headlineLabel,
    text: formatMetric(definition, value),
    period: metricPeriodText(key, year)
  };
}

function buildMissingText(area: AreaRecord, key: IndicatorKey, year: number): string | null {
  const reason = area.indicators[key].missing;
  if (!reason) return null;

  if (reason === "insufficient-history") {
    return "比較に必要な過去時点の値がありません（区の再編や合併の直後などが該当します）。";
  }

  if (area.kind === "ward" && (key === "income" || key === "fiscal")) {
    return `政令指定都市の区単位では収録されていません。市全体（${area.parentName ?? "所属する市"}）の値を参照してください。`;
  }

  if (area.kind === "special-ward" && key === "fiscal") {
    return "出典（統計ダッシュボード）に特別区の値が収録されていません。";
  }

  return `出典（統計ダッシュボード）に${metricPeriodText(key, year)}の値が収録されていません。`;
}

function buildIndicatorView(area: AreaRecord, key: IndicatorKey, meta: ManifestIndicator): IndicatorView {
  const definition = INDICATORS[key];
  const indicator = area.indicators[key];
  const series = areaSeries(area);
  const direction = indicator.value === null ? "unknown" : computeDirection(key, series, meta.year);
  const change = computeChange(key, series, meta.year);
  const chartPoints = indicator.series[definition.chartSeriesKey] ?? [];
  const displayCycle = seriesOf(definition, definition.chartSeriesKey).cycle;
  const breakAfterYear = SERIES_BREAKS[key];

  return {
    key,
    definition,
    available: indicator.value !== null,
    value: indicator.value,
    valueText: indicator.value === null ? "欠損" : formatMetric(definition, indicator.value),
    periodText: metricPeriodText(key, meta.year),
    score: indicator.score,
    band: scoreBand(indicator.score),
    position: indicator.score === null ? null : positionFromScore(indicator.score, key),
    medianText: formatMetric(definition, meta.distribution.p50),
    direction,
    directionText: direction === "unknown" ? "判定なし" : definition.directionLabels[direction],
    headline: buildHeadline(area, key, meta.year),
    change:
      change === null || indicator.value === null
        ? null
        : {
            label: change.label,
            text: `${formatNumber(change.value, change.decimals, true)}${change.unit}`,
            sign: Math.sign(change.value) as -1 | 0 | 1
          },
    rank: indicator.rank,
    rankTotal: meta.distribution.count,
    facts: buildFacts(area, key, meta.year),
    missingText: buildMissingText(area, key, meta.year),
    chart:
      chartPoints.length > 0
        ? {
            series: seriesOf(definition, definition.chartSeriesKey),
            points: chartPoints,
            ...(breakAfterYear === undefined ? {} : { breakAfterYear })
          }
        : null,
    sources: meta.sources.map((source) => ({
      name: source.name,
      statName: source.statName,
      code: source.code,
      // 上流の系列が年・年度のどちらで登録されているかではなく、指標値の表記にそろえる。
      latestPeriod: formatYear(source.latestYear, displayCycle),
      url: sourceUrl(source.code, area.code)
    }))
  };
}

/** 画面・レポート・CLIが共通で使う、市区町村1件ぶんの表示用データを組み立てる。 */
export function buildAreaView(area: AreaRecord, manifest: Manifest): AreaView {
  const overall = overallScore(area);

  return {
    area,
    fullName: areaFullName(area),
    localName: areaLocalName(area),
    overallScore: overall,
    overallBand: scoreBand(overall),
    coverage: coverage(area),
    confidence: confidence(area),
    indicators: INDICATOR_KEYS.map((key) => buildIndicatorView(area, key, manifest.indicators[key])),
    retrievedAt: manifest.generatedAt
  };
}

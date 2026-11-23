import { roundTo } from "./format";
import type { IndicatorKey, MissingReason } from "./model";
import type { SeriesMap, SeriesPoint } from "./schema";

export type Cycle = "CY" | "FY";

/** 統計ダッシュボードから取得する系列。 */
export type UpstreamSeries = {
  id: string;
  /** 系列コード（19桁）。 */
  code: string;
  cycle: Cycle;
  /** この年以降のデータだけを取得・保持する。 */
  fromYear: number;
};

/** データセットに保持する系列（上流そのまま、または上流から算出した値）。 */
export type StoredSeries = {
  key: string;
  label: string;
  unit: string;
  decimals: number;
  cycle: Cycle;
};

export type Direction = "up" | "flat" | "down" | "unknown";

export type IndicatorDefinition = {
  key: IndicatorKey;
  label: string;
  /** スコア対象の指標値の名前。 */
  metricLabel: string;
  /** 一覧で水準に添える短い名前。 */
  headlineLabel: string;
  /** 一覧表の列見出しに使う、指標値の短い名前。 */
  columnLabel: string;
  unit: string;
  decimals: number;
  /** 指標値に符号（+/-）を付けて表示するか。 */
  signed: boolean;
  /** スコアが高くなる向き。higher = 値が大きいほど高い。 */
  orientation: "higher" | "lower";
  /** 何を見る指標か（1文）。 */
  summary: string;
  /** 算出方法。 */
  method: string;
  /** 読み取り時の注意。 */
  notes: string[];
  upstream: UpstreamSeries[];
  series: StoredSeries[];
  /** グラフに使う系列のキー。 */
  chartSeriesKey: string;
  /** 直近の動きを何と比べて判定しているか。 */
  directionBasis: string;
  directionLabels: Record<Exclude<Direction, "unknown">, string>;
};

export const INDICATORS: Record<IndicatorKey, IndicatorDefinition> = {
  population: {
    key: "population",
    label: "人口",
    metricLabel: "5年間の人口増減率",
    headlineLabel: "住民基本台帳人口",
    columnLabel: "人口増減率",
    unit: "%",
    decimals: 1,
    signed: true,
    orientation: "higher",
    summary: "住民基本台帳人口が5年前からどれだけ増減したかを見ます。",
    method: "（基準年の住民基本台帳人口 ÷ 5年前の住民基本台帳人口 − 1）× 100",
    notes: [
      "住民基本台帳人口は各年1月1日現在（2013年のみ3月31日現在）で、外国人住民を含みます。国勢調査の人口とは定義と時点が異なります。",
      "増減率は地域の良し悪しを示すものではなく、需要構造の変化を読むための手がかりです。"
    ],
    upstream: [{ id: "residents", code: "0201200000000010010", cycle: "CY", fromYear: 2013 }],
    series: [{ key: "residents", label: "住民基本台帳人口", unit: "人", decimals: 0, cycle: "CY" }],
    chartSeriesKey: "residents",
    directionBasis: "5年前の人口と比べて±1%を超える増減があるか",
    directionLabels: { up: "増加", flat: "横ばい", down: "減少" }
  },
  aging: {
    key: "aging",
    label: "高齢化",
    metricLabel: "高齢化率（65歳以上人口の割合）",
    headlineLabel: "65歳以上人口の割合",
    columnLabel: "高齢化率",
    unit: "%",
    decimals: 1,
    signed: false,
    orientation: "lower",
    summary: "国勢調査による65歳以上人口の割合を見ます。",
    method: "国勢調査の「総人口に占める割合（65歳以上）」をそのまま使用",
    notes: [
      "高齢化率は医療・福祉・交通などの需要構造を読むための補助指標で、単独で地域の評価を示すものではありません。",
      "補助スコアは高齢化率が低いほど高くなる向きにそろえています。向きは集計上の約束であり、価値判断ではありません。"
    ],
    upstream: [{ id: "ratio", code: "0201010010000020030", cycle: "CY", fromYear: 2005 }],
    series: [{ key: "ratio", label: "高齢化率", unit: "%", decimals: 1, cycle: "CY" }],
    chartSeriesKey: "ratio",
    directionBasis: "5年前の国勢調査との差が±0.5ポイントを超えるか",
    directionLabels: { up: "上昇", flat: "横ばい", down: "低下" }
  },
  migration: {
    key: "migration",
    label: "転入・転出",
    metricLabel: "転入超過率（直近3年平均）",
    headlineLabel: "転入超過率・3年平均",
    columnLabel: "転入超過率",
    unit: "%",
    decimals: 2,
    signed: true,
    orientation: "higher",
    summary: "国内の他市区町村との転入・転出の差を、人口に対する割合で見ます。",
    method: "各年の（転入者数 − 転出者数）÷ 住民基本台帳人口 × 100 を、基準年までの3年間で平均",
    notes: [
      "転入・転出は年ごとの変動が大きいため、3年平均で見ています。",
      "国内の市区町村間の移動を対象とした値で、国外との移動は含みません。"
    ],
    upstream: [
      { id: "inflow", code: "0204010000000010020", cycle: "CY", fromYear: 2018 },
      { id: "outflow", code: "0204020000000010020", cycle: "CY", fromYear: 2018 }
    ],
    series: [
      { key: "net", label: "転入超過数", unit: "人", decimals: 0, cycle: "CY" },
      { key: "inflow", label: "転入者数", unit: "人", decimals: 0, cycle: "CY" },
      { key: "outflow", label: "転出者数", unit: "人", decimals: 0, cycle: "CY" }
    ],
    chartSeriesKey: "net",
    directionBasis: "直近3年平均の転入超過率が±0.1%を超えるか",
    directionLabels: { up: "転入超過", flat: "ほぼ均衡", down: "転出超過" }
  },
  business: {
    key: "business",
    label: "事業所",
    metricLabel: "人口千人当たりの民営事業所数",
    headlineLabel: "人口千人当たりの事業所数",
    columnLabel: "千人当たり事業所数",
    unit: "事業所",
    decimals: 1,
    signed: false,
    orientation: "higher",
    summary: "経済センサスの民営事業所数を、居住人口に対する密度で見ます。",
    method: "民営事業所数 ÷ 同じ年の住民基本台帳人口 × 1,000",
    notes: [
      "2021年の経済センサス-活動調査は調査方法が変わったため、2016年以前の値とは単純に比較できません。直近の動きは判定していません。",
      "事業所は従業地ベース、人口は居住地ベースです。昼間人口の多い都心部では密度が非常に高く出ます。"
    ],
    upstream: [
      { id: "establishmentsLegacy", code: "0701010001000010010", cycle: "CY", fromYear: 2009 },
      { id: "establishments", code: "0701010001000010012", cycle: "CY", fromYear: 2021 }
    ],
    series: [{ key: "establishments", label: "民営事業所数", unit: "事業所", decimals: 0, cycle: "CY" }],
    chartSeriesKey: "establishments",
    directionBasis: "2021年に調査方法が変わったため判定しません",
    directionLabels: { up: "増加", flat: "横ばい", down: "減少" }
  },
  employment: {
    key: "employment",
    label: "雇用",
    metricLabel: "完全失業率（国勢調査）",
    headlineLabel: "完全失業率",
    columnLabel: "完全失業率",
    unit: "%",
    decimals: 1,
    signed: false,
    orientation: "lower",
    summary: "国勢調査による、労働力人口に占める完全失業者の割合を見ます。",
    method: "社会・人口統計体系の「完全失業率（国勢調査）」をそのまま使用",
    notes: [
      "5年に一度の国勢調査に基づく値で、毎月公表される労働力調査の失業率とは調査方法が異なります。",
      "居住地ベースの値です。通勤圏をまたぐ地域では、周辺の市区町村とあわせて確認してください。"
    ],
    upstream: [{ id: "unemployment", code: "0301100000020020010", cycle: "FY", fromYear: 2000 }],
    series: [{ key: "unemployment", label: "完全失業率", unit: "%", decimals: 1, cycle: "CY" }],
    chartSeriesKey: "unemployment",
    directionBasis: "5年前の国勢調査との差が±0.3ポイントを超えるか",
    directionLabels: { up: "上昇", flat: "横ばい", down: "低下" }
  },
  income: {
    key: "income",
    label: "所得",
    metricLabel: "納税義務者1人当たりの課税対象所得",
    headlineLabel: "納税義務者1人当たり",
    columnLabel: "課税対象所得",
    unit: "万円",
    decimals: 1,
    signed: false,
    orientation: "higher",
    summary: "市町村民税（所得割）の課税対象所得を、納税義務者1人当たりで見ます。",
    method: "課税対象所得 ÷ 納税義務者数（所得割）。千円単位の上流データを万円に換算",
    notes: [
      "各年度の課税対象となった前年の所得で、所得控除を行う前の金額です。物価変動は調整していません。",
      "納税義務者に限った平均であり、住民全体の平均所得ではありません。"
    ],
    upstream: [
      { id: "taxableIncome", code: "1302070100000010010", cycle: "CY", fromYear: 2010 },
      { id: "taxpayers", code: "1302070100000010020", cycle: "CY", fromYear: 2010 }
    ],
    series: [{ key: "perTaxpayer", label: "1人当たり課税対象所得", unit: "万円", decimals: 1, cycle: "FY" }],
    chartSeriesKey: "perTaxpayer",
    directionBasis: "5年前と比べて±2%を超える増減があるか",
    directionLabels: { up: "増加", flat: "横ばい", down: "減少" }
  },
  fiscal: {
    key: "fiscal",
    label: "財政",
    metricLabel: "財政力指数",
    headlineLabel: "財政力指数",
    columnLabel: "財政力指数",
    unit: "",
    decimals: 2,
    signed: false,
    orientation: "higher",
    summary: "標準的な行政需要を自前の税収等でどの程度まかなえるかを見ます。",
    method:
      "社会・人口統計体系の「財政力指数（市町村財政）」をそのまま使用（基準財政収入額 ÷ 基準財政需要額 の過去3年平均）",
    notes: [
      "財政力指数は財源の自立度を示す指数で、行政サービスの水準や財政の健全性そのものを示すものではありません。",
      "特別区と政令指定都市の区は、出典に値が収録されていません。"
    ],
    upstream: [{ id: "index", code: "1302050000000190010", cycle: "FY", fromYear: 2010 }],
    series: [{ key: "index", label: "財政力指数", unit: "", decimals: 2, cycle: "FY" }],
    chartSeriesKey: "index",
    directionBasis: "5年前との差が±0.02を超えるか",
    directionLabels: { up: "上昇", flat: "横ばい", down: "低下" }
  }
};

/** 文脈情報として取得する系列（スコア対象外）。 */
export const CONTEXT_UPSTREAM = {
  daytimeRatio: { id: "daytimeRatio", code: "0201060000000020000", cycle: "CY", fromYear: 2015 }
} as const satisfies Record<string, UpstreamSeries>;

export type AreaSeries = Record<IndicatorKey, SeriesMap>;

export function valueAt(points: SeriesPoint[] | undefined, year: number): number | null {
  const point = points?.find(([pointYear]) => pointYear === year);
  return point ? point[1] : null;
}

export function latestPoint(points: SeriesPoint[] | undefined): SeriesPoint | null {
  return points?.at(-1) ?? null;
}

export type MetricResult = { value: number; missing?: undefined } | { value: null; missing: MissingReason };

const notPublished: MetricResult = { value: null, missing: "not-published" };
const insufficientHistory: MetricResult = { value: null, missing: "insufficient-history" };

/** 住民基本台帳人口の調査時点。2014年調査から1月1日現在に変わった。 */
export function residentsAsOf(year: number): string {
  return year <= 2013 ? "3月31日" : "1月1日";
}

/** 転入超過率を平均する年数。 */
export const MIGRATION_WINDOW_YEARS = 3;
/** 人口・所得・財政の比較に使う年数。 */
export const COMPARISON_LAG_YEARS = 5;

/**
 * 基準年 year における指標値を算出する。
 * パイプライン（スコア算出）と表示の両方がこの関数を唯一の定義として使う。
 */
export function computeMetric(key: IndicatorKey, series: AreaSeries, year: number): MetricResult {
  const { decimals } = INDICATORS[key];

  switch (key) {
    case "population": {
      const current = valueAt(series.population.residents, year);
      if (current === null) return notPublished;
      const past = valueAt(series.population.residents, year - COMPARISON_LAG_YEARS);
      if (past === null || past <= 0) return insufficientHistory;
      return { value: roundTo((current / past - 1) * 100, decimals) };
    }
    case "migration": {
      const rates: number[] = [];
      for (let offset = 0; offset < MIGRATION_WINDOW_YEARS; offset += 1) {
        const targetYear = year - offset;
        const inflow = valueAt(series.migration.inflow, targetYear);
        const outflow = valueAt(series.migration.outflow, targetYear);
        const residents = valueAt(series.population.residents, targetYear);
        if (inflow === null || outflow === null || residents === null || residents <= 0) {
          return offset === 0 ? notPublished : insufficientHistory;
        }
        rates.push(((inflow - outflow) / residents) * 100);
      }
      return { value: roundTo(rates.reduce((sum, rate) => sum + rate, 0) / rates.length, decimals) };
    }
    case "business": {
      const establishments = valueAt(series.business.establishments, year);
      const residents = valueAt(series.population.residents, year);
      if (establishments === null || residents === null || residents <= 0) return notPublished;
      return { value: roundTo((establishments / residents) * 1000, decimals) };
    }
    case "aging":
    case "employment":
    case "income":
    case "fiscal": {
      const value = valueAt(series[key][INDICATORS[key].chartSeriesKey], year);
      return value === null ? notPublished : { value: roundTo(value, decimals) };
    }
  }
}

function compare(delta: number | null, threshold: number): Direction {
  if (delta === null) return "unknown";
  if (delta > threshold) return "up";
  if (delta < -threshold) return "down";
  return "flat";
}

/**
 * 差と増減率は、表示と同じ桁に丸めてからしきい値と比べる。
 * 丸めないと 0.54 − 0.52 が 0.020000000000000018 になり、「±0.02を超えるか」の判定が表示と食い違う。
 */
function difference(points: SeriesPoint[] | undefined, year: number, lag: number, decimals: number): number | null {
  const current = valueAt(points, year);
  const past = valueAt(points, year - lag);
  return current === null || past === null ? null : roundTo(current - past, decimals);
}

function changeRate(points: SeriesPoint[] | undefined, year: number, lag: number): number | null {
  const current = valueAt(points, year);
  const past = valueAt(points, year - lag);
  return current === null || past === null || past <= 0 ? null : roundTo((current / past - 1) * 100, 1);
}

/** 過去の時点と比べた変化。pt は割合どうしの差(パーセントポイント)。 */
export type Change = { value: number; unit: "%" | "pt" | ""; decimals: number; label: string };

const CHANGE_LABEL = `${COMPARISON_LAG_YEARS}年前比`;

/**
 * 5年前（国勢調査の指標は前回調査）と比べた変化。比べられない指標は null。
 * - 転入・転出: 指標値そのものが3年平均の流れなので、過去との差は出さない
 * - 事業所: 2021年に調査方法が変わったため、比べない
 */
export function computeChange(key: IndicatorKey, series: AreaSeries, year: number): Change | null {
  const of = (value: number | null, unit: Change["unit"], decimals: number): Change | null =>
    value === null ? null : { value, unit, decimals, label: CHANGE_LABEL };

  switch (key) {
    case "population":
      return of(changeRate(series.population.residents, year, COMPARISON_LAG_YEARS), "%", 1);
    case "aging":
      return of(difference(series.aging.ratio, year, COMPARISON_LAG_YEARS, 1), "pt", 1);
    case "employment":
      return of(difference(series.employment.unemployment, year, COMPARISON_LAG_YEARS, 1), "pt", 1);
    case "income":
      return of(changeRate(series.income.perTaxpayer, year, COMPARISON_LAG_YEARS), "%", 1);
    case "fiscal":
      return of(difference(series.fiscal.index, year, COMPARISON_LAG_YEARS, 2), "", 2);
    case "migration":
    case "business":
      return null;
  }
}

/** 「直近の動き」とみなす変化の大きさ（これを超えたら動きあり）。 */
const DIRECTION_THRESHOLDS: Record<Exclude<IndicatorKey, "business">, number> = {
  population: 1,
  aging: 0.5,
  migration: 0.1,
  employment: 0.3,
  income: 2,
  fiscal: 0.02
};

/** 直近の動き。判定基準は各指標の directionBasis を参照。 */
export function computeDirection(key: IndicatorKey, series: AreaSeries, year: number): Direction {
  if (key === "business") return "unknown";
  // 転入・転出は、3年平均の転入超過率そのものの符号で見る。
  const value =
    key === "migration" ? computeMetric(key, series, year).value : (computeChange(key, series, year)?.value ?? null);
  return compare(value, DIRECTION_THRESHOLDS[key]);
}

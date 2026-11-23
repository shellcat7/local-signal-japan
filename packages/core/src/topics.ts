import type { IndicatorFilters, PopulationBandId, RankingMetric } from "./national";

/** 特集ランキング。決まった条件で並べた一覧に、見出しと説明を付けたもの。 */
export type Topic = {
  id: string;
  title: string;
  /** 何を、どう並べた一覧か（1〜2文）。 */
  lead: string;
  metric: RankingMetric;
  order: "desc" | "asc";
  size: PopulationBandId;
  filters: IndicatorFilters;
  /** 基準時点として示す値（並べる値と条件の値が違うとき）。 */
  periodMetric?: RankingMetric;
};

export const TOPICS: readonly Topic[] = [
  {
    id: "half-by-2050",
    title: "2050年に人口が半分以下になる見込みの市区町村",
    lead: "国立社会保障・人口問題研究所の地域別将来推計人口で、2050年の人口が2025年の半分以下になる見込みの市区町村です。減り方が大きい順に並べています。",
    metric: "projection2050",
    order: "asc",
    size: "all",
    filters: { projection2050: { max: -50 } }
  },
  {
    id: "growing-to-2050",
    title: "2050年も人口が増える見込みの市区町村",
    lead: "同じ推計で、2050年の人口が2025年より多くなる見込みの市区町村です。",
    metric: "projection2050",
    order: "desc",
    size: "all",
    filters: { projection2050: { min: 0.1 } }
  },
  {
    id: "furusato-receipts",
    title: "ふるさと納税の受入額が多い市区町村",
    lead: "総務省「ふるさと納税に関する現況調査結果」の受入額の順です。返礼品などの費用を差し引く前の金額です。",
    metric: "furusatoReceipts",
    order: "desc",
    size: "all",
    filters: {}
  },
  {
    id: "furusato-outflow",
    title: "ふるさと納税で住民税の控除額が多い市区町村",
    lead: "住民がほかの自治体へ寄附したことで、住民税（市町村民税）が差し引かれた額の順です。",
    metric: "furusatoOutflow",
    order: "desc",
    size: "all",
    filters: {}
  },
  {
    id: "furusato-per-capita",
    title: "住民1人当たりのふるさと納税受入額が多い市区町村",
    lead: "受入額を住民基本台帳人口で割った値の順です。",
    metric: "furusatoPerCapita",
    order: "desc",
    size: "all",
    filters: {}
  },
  {
    id: "bicycle",
    title: "通勤・通学に自転車だけを使う人の割合が高い市区町村",
    lead: "国勢調査で、自宅の外へ通勤・通学する人のうち、自転車だけを使う人の割合の順です。",
    metric: "commuteBike",
    order: "desc",
    size: "all",
    filters: {}
  },
  {
    id: "car",
    title: "通勤・通学に自家用車だけを使う人の割合が高い市区町村",
    lead: "国勢調査で、自宅の外へ通勤・通学する人のうち、自家用車だけを使う人の割合の順です。",
    metric: "commuteCar",
    order: "desc",
    size: "all",
    filters: {}
  },
  {
    id: "rail",
    title: "通勤・通学に鉄道・電車だけを使う人の割合が高い市区町村",
    lead: "国勢調査で、鉄道・電車だけを使う人の割合の順です。",
    metric: "commuteRail",
    order: "desc",
    size: "all",
    filters: {}
  },
  {
    id: "life-female",
    title: "女性の平均寿命が長い市区町村",
    lead: "厚生労働省「市区町村別生命表」の、0歳の女性の平均余命の順です。",
    metric: "lifeFemale",
    order: "desc",
    size: "all",
    filters: {}
  },
  {
    id: "life-male",
    title: "男性の平均寿命が長い市区町村",
    lead: "厚生労働省「市区町村別生命表」の、0歳の男性の平均余命の順です。",
    metric: "lifeMale",
    order: "desc",
    size: "all",
    filters: {}
  },
  {
    id: "foreign-residents",
    title: "外国人住民の割合が高い市区町村",
    lead: "住民基本台帳に記録された住民のうち、外国人住民の割合の順です。",
    metric: "foreignShare",
    order: "desc",
    size: "all",
    filters: {}
  },
  {
    id: "vacant-houses",
    title: "空き家率が高い市区町村",
    lead: "住宅・土地統計調査の空き家率の順です。別荘などの二次的住宅も空き家に含まれます。",
    metric: "vacancy",
    order: "desc",
    size: "all",
    filters: {}
  },
  {
    id: "spacious-homes",
    title: "住宅が広い市区町村",
    lead: "住宅・土地統計調査の、1住宅当たりの延べ面積の順です。",
    metric: "floorArea",
    order: "desc",
    size: "all",
    filters: {}
  },
  {
    id: "no-library",
    title: "図書館がない市区町村",
    lead: "社会教育調査で図書館の数が0の市区町村を、人口の多い順に並べています。公民館の図書室や移動図書館は含みません。",
    metric: "residents",
    order: "desc",
    size: "all",
    filters: { libraries: { max: 0 } },
    periodMetric: "libraries"
  },
  {
    id: "marriage",
    title: "婚姻率が高い市区町村（人口1万人以上）",
    lead: "人口千人当たりの婚姻件数の順です。人口の少ない市区町村は数組の違いで大きく動くため、人口1万人以上に絞っています。",
    metric: "marriageRate",
    order: "desc",
    size: "over-10k",
    filters: {}
  }
];

/** トップページに並べる特集。 */
export const FEATURED_TOPIC_IDS = [
  "half-by-2050",
  "furusato-receipts",
  "bicycle",
  "life-female",
  "foreign-residents",
  "vacant-houses"
] as const;

export function findTopic(id: string | null | undefined): Topic | undefined {
  return id ? TOPICS.find((topic) => topic.id === id) : undefined;
}

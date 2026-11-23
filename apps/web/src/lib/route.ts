import { useCallback, useSyncExternalStore } from "react";
import {
  activeFilters,
  findTopic,
  isMetricKey,
  METRIC_KEYS,
  POPULATION_BANDS,
  type IndicatorFilters,
  type PopulationBandId,
  type RankingMetric,
  type Topic
} from "@local-signal-japan/core";

export const TABS = ["overview", "life", "indicators", "comparison", "report"] as const;
export type TabId = (typeof TABS)[number];

/** 比較に並べられる市区町村の数（表示中の市区町村を除く）。 */
export const MAX_COMPARE = 4;

export type HomeRoute = { view: "home" };
export type TopicsRoute = { view: "topics" };
export type AreaRoute = { view: "area"; areaCode: string; tab: TabId; compare: string[] };
export type RankingRoute = {
  view: "ranking";
  metric: RankingMetric;
  order: "desc" | "asc";
  prefCode: string | null;
  size: PopulationBandId;
  /** 指標値の条件（範囲）。 */
  filters: IndicatorFilters;
  /** 特集から開いたときの特集の id。条件を変えると外れる。 */
  topic: string | null;
  /** 結果を表で見るか、地図で見るか。 */
  display: "table" | "map";
};
/** まちくじ。引いた市区町村と、引く範囲（都道府県）を持つ。 */
export type KujiRoute = { view: "kuji"; areaCode: string | null; prefCode: string | null };
/** まちクイズ。シード（日替わりなら日付）と、開いている問題の番号（1から）を持つ。 */
export type QuizRoute = { view: "quiz"; seed: string | null; question: number | null };
/** まち図鑑。 */
export type ZukanRoute = { view: "zukan" };
export type PlayRoute = KujiRoute | QuizRoute | ZukanRoute;
export type Route = HomeRoute | TopicsRoute | AreaRoute | RankingRoute | PlayRoute;

export const KUJI_HOME: KujiRoute = { view: "kuji", areaCode: null, prefCode: null };
export const QUIZ_HOME: QuizRoute = { view: "quiz", seed: null, question: null };
export const ZUKAN_HOME: ZukanRoute = { view: "zukan" };

export const isPlayRoute = (route: Route): route is PlayRoute =>
  route.view === "kuji" || route.view === "quiz" || route.view === "zukan";

export const DEFAULT_RANKING: RankingRoute = {
  view: "ranking",
  metric: "residents",
  order: "desc",
  prefCode: null,
  size: "all",
  filters: {},
  topic: null,
  display: "table"
};

/** 特集の条件で開く一覧。 */
export function topicRoute(topic: Topic): RankingRoute {
  return {
    ...DEFAULT_RANKING,
    metric: topic.metric,
    order: topic.order,
    size: topic.size,
    filters: topic.filters,
    topic: topic.id
  };
}

const isAreaCode = (value: string | null): value is string => value !== null && /^\d{5}$/.test(value);
const isTab = (value: string | null): value is TabId => TABS.includes(value as TabId);
const isMetric = (value: string | null): value is RankingMetric =>
  value === "residents" || value === "overall" || (value !== null && isMetricKey(value));
const isBand = (value: string | null): value is PopulationBandId => POPULATION_BANDS.some((band) => band.id === value);
const isPrefCode = (value: string | null): value is string =>
  value !== null && /^\d{2}$/.test(value) && Number(value) >= 1 && Number(value) <= 47;

/** 「下限..上限」の形の範囲を読む。「..30」「350..」のように片側だけでもよい。 */
function parseRange(text: string | null): { min?: number; max?: number } | null {
  if (text === null || !text.includes("..")) return null;
  const [low = "", high = ""] = text.split("..");
  const read = (part: string) => (/^-?\d+(\.\d+)?$/.test(part) ? Number(part) : undefined);
  const min = read(low);
  const max = read(high);
  if (min === undefined && max === undefined) return null;
  return { ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }) };
}

/**
 * 表示状態はURLのハッシュに持たせる。
 *   #area=13101&tab=indicators&with=14117,16210
 *   #view=ranking&metric=income&pref=13&aging=..30&income=350..&show=map
 *   #view=ranking&topic=bicycle&metric=commuteBike
 *   #view=topics
 *   #view=kuji&area=10524&pref=10
 *   #view=quiz&seed=2026-11-23&q=3
 *   #view=zukan
 * ハッシュはサーバーに送られないため、どの市区町村を見たかが配信元のログに残らない。
 */
export function parseHash(hash: string): Route {
  const params = new URLSearchParams(hash.replace(/^#/, ""));

  if (params.get("view") === "topics") return { view: "topics" };

  if (params.get("view") === "zukan") return { view: "zukan" };

  if (params.get("view") === "quiz") {
    const seed = params.get("seed");
    const question = Number(params.get("q"));
    return {
      view: "quiz",
      seed: seed !== null && /^[\w-]{1,32}$/.test(seed) ? seed : null,
      question: Number.isInteger(question) && question >= 1 && question <= 20 ? question : null
    };
  }

  if (params.get("view") === "kuji") {
    const area = params.get("area");
    const pref = params.get("pref");
    return { view: "kuji", areaCode: isAreaCode(area) ? area : null, prefCode: isPrefCode(pref) ? pref : null };
  }

  if (params.get("view") === "ranking") {
    const metric = params.get("metric");
    const size = params.get("size");
    const pref = params.get("pref");
    const filters: IndicatorFilters = {};
    for (const key of METRIC_KEYS) {
      const range = parseRange(params.get(key));
      if (range) filters[key] = range;
    }
    return {
      view: "ranking",
      metric: isMetric(metric) ? metric : DEFAULT_RANKING.metric,
      order: params.get("order") === "asc" ? "asc" : "desc",
      prefCode: isPrefCode(pref) ? pref : null,
      size: isBand(size) ? size : "all",
      filters,
      topic: findTopic(params.get("topic"))?.id ?? null,
      display: params.get("show") === "map" ? "map" : "table"
    };
  }

  const area = params.get("area");
  if (!isAreaCode(area)) return { view: "home" };

  const tab = params.get("tab");
  const compare = (params.get("with") ?? "")
    .split(",")
    .filter((code, index, codes) => isAreaCode(code) && code !== area && codes.indexOf(code) === index)
    .slice(0, MAX_COMPARE);

  return { view: "area", areaCode: area, tab: isTab(tab) ? tab : "overview", compare };
}

export function formatHash(route: Route): string {
  if (route.view === "home") return "";
  if (route.view === "topics") return "#view=topics";
  if (route.view === "zukan") return "#view=zukan";
  if (route.view === "quiz") {
    const params = new URLSearchParams({ view: "quiz" });
    if (route.seed !== null) params.set("seed", route.seed);
    if (route.question !== null) params.set("q", String(route.question));
    return `#${params.toString()}`;
  }
  if (route.view === "kuji") {
    const params = new URLSearchParams({ view: "kuji" });
    if (route.areaCode !== null) params.set("area", route.areaCode);
    if (route.prefCode !== null) params.set("pref", route.prefCode);
    return `#${params.toString()}`;
  }

  const params = new URLSearchParams();
  if (route.view === "ranking") {
    params.set("view", "ranking");
    if (route.topic !== null) params.set("topic", route.topic);
    if (route.metric !== DEFAULT_RANKING.metric) params.set("metric", route.metric);
    if (route.order !== DEFAULT_RANKING.order) params.set("order", route.order);
    if (route.prefCode !== null) params.set("pref", route.prefCode);
    if (route.size !== DEFAULT_RANKING.size) params.set("size", route.size);
    for (const [key, range] of activeFilters(route.filters)) {
      params.set(key, `${range.min ?? ""}..${range.max ?? ""}`);
    }
    if (route.display === "map") params.set("show", "map");
  } else {
    params.set("area", route.areaCode);
    if (route.tab !== "overview") params.set("tab", route.tab);
    if (route.compare.length > 0) params.set("with", route.compare.join(","));
  }

  // 「,」は区切りとして読みやすいまま残す。
  return `#${params.toString().replaceAll("%2C", ",")}`;
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("hashchange", listener);
  window.addEventListener("popstate", listener);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("hashchange", listener);
    window.removeEventListener("popstate", listener);
  };
}

const getHash = () => window.location.hash;

export type Navigate = (route: Route, options?: { replace?: boolean }) => void;

export function useRoute(): [Route, Navigate] {
  const hash = useSyncExternalStore(subscribe, getHash);

  const navigate = useCallback<Navigate>((route, options) => {
    // 同じ表示への移動で、履歴に同じ項目を重ねない。
    if (formatHash(route) === formatHash(parseHash(window.location.hash))) return;

    const url = `${window.location.pathname}${window.location.search}${formatHash(route)}`;
    if (options?.replace) {
      window.history.replaceState(null, "", url);
    } else {
      window.history.pushState(null, "", url);
    }
    // pushState / replaceState は hashchange を発火しないので、自前で通知する。
    for (const listener of listeners) listener();
  }, []);

  return [parseHash(hash), navigate];
}

/** リンクの href に使う。JavaScript の遷移と同じ表示を、新しいタブでも開けるようにするため。 */
export function hrefOf(route: Route): string {
  return formatHash(route) || "./";
}

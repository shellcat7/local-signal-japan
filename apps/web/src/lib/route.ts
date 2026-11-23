import { useCallback, useSyncExternalStore } from "react";
import {
  INDICATOR_KEYS,
  POPULATION_BANDS,
  type IndicatorKey,
  type PopulationBandId,
  type RankingMetric
} from "@local-signal-japan/core";

export const TABS = ["overview", "indicators", "comparison", "report"] as const;
export type TabId = (typeof TABS)[number];

/** 比較に並べられる市区町村の数（表示中の市区町村を除く）。 */
export const MAX_COMPARE = 4;

export type HomeRoute = { view: "home" };
export type AreaRoute = { view: "area"; areaCode: string; tab: TabId; compare: string[] };
export type RankingRoute = {
  view: "ranking";
  metric: RankingMetric;
  order: "desc" | "asc";
  prefCode: string | null;
  size: PopulationBandId;
};
export type Route = HomeRoute | AreaRoute | RankingRoute;

export const DEFAULT_RANKING: RankingRoute = {
  view: "ranking",
  metric: "overall",
  order: "desc",
  prefCode: null,
  size: "all"
};

const isAreaCode = (value: string | null): value is string => value !== null && /^\d{5}$/.test(value);
const isTab = (value: string | null): value is TabId => TABS.includes(value as TabId);
const isMetric = (value: string | null): value is RankingMetric =>
  value === "overall" || INDICATOR_KEYS.includes(value as IndicatorKey);
const isBand = (value: string | null): value is PopulationBandId => POPULATION_BANDS.some((band) => band.id === value);
const isPrefCode = (value: string | null): value is string =>
  value !== null && /^\d{2}$/.test(value) && Number(value) >= 1 && Number(value) <= 47;

/**
 * 表示状態はURLのハッシュに持たせる。
 *   #area=13101&tab=indicators&with=14117,16210
 *   #view=ranking&metric=income&pref=13
 * ハッシュはサーバーに送られないため、どの市区町村を見たかが配信元のログに残らない。
 */
export function parseHash(hash: string): Route {
  const params = new URLSearchParams(hash.replace(/^#/, ""));

  if (params.get("view") === "ranking") {
    const metric = params.get("metric");
    const size = params.get("size");
    const pref = params.get("pref");
    return {
      view: "ranking",
      metric: isMetric(metric) ? metric : DEFAULT_RANKING.metric,
      order: params.get("order") === "asc" ? "asc" : "desc",
      prefCode: isPrefCode(pref) ? pref : null,
      size: isBand(size) ? size : "all"
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

  const params = new URLSearchParams();
  if (route.view === "ranking") {
    params.set("view", "ranking");
    if (route.metric !== DEFAULT_RANKING.metric) params.set("metric", route.metric);
    if (route.order !== DEFAULT_RANKING.order) params.set("order", route.order);
    if (route.prefCode !== null) params.set("pref", route.prefCode);
    if (route.size !== DEFAULT_RANKING.size) params.set("size", route.size);
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

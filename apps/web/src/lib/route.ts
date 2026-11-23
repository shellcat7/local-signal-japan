import { useCallback, useSyncExternalStore } from "react";

export const TABS = ["overview", "indicators", "comparison", "report"] as const;
export type TabId = (typeof TABS)[number];

export type Route = { areaCode: string | null; tab: TabId };

const isTab = (value: string | null): value is TabId => TABS.includes(value as TabId);

/**
 * 表示状態はURLのハッシュ(#area=13101&tab=indicators)に持たせる。
 * ハッシュはサーバーに送られないため、どの市区町村を見たかが配信元のログに残らない。
 */
export function parseHash(hash: string): Route {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const area = params.get("area");
  const tab = params.get("tab");

  return {
    areaCode: area !== null && /^\d{5}$/.test(area) ? area : null,
    tab: isTab(tab) ? tab : "overview"
  };
}

export function formatHash(route: Route): string {
  if (route.areaCode === null) return "";
  const params = new URLSearchParams({ area: route.areaCode });
  if (route.tab !== "overview") params.set("tab", route.tab);
  return `#${params.toString()}`;
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

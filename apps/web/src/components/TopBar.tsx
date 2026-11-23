import type { MouseEvent, ReactNode } from "react";
import { hrefOf, DEFAULT_RANKING, KUJI_HOME, type Route } from "../lib/route";
import { SITE_NAME } from "../lib/site";

type TopBarProps = {
  route: Route;
  onNavigate: (route: Route) => void;
  /** 検索欄。どの画面でも同じ位置に置く。 */
  search: ReactNode;
};

/** 新しいタブで開く操作（修飾キーつきのクリック）は、ブラウザに任せる。 */
function isPlainClick(event: MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function TopBar({ route, onNavigate, search }: TopBarProps) {
  const link = (target: Route) => ({
    href: hrefOf(target),
    onClick: (event: MouseEvent) => {
      if (!isPlainClick(event)) return;
      event.preventDefault();
      onNavigate(target);
    }
  });

  return (
    <header className="topbar">
      <div className="container topbar__inner">
        <h1 className="topbar__brand">
          <a {...link({ view: "home" })}>{SITE_NAME}</a>
        </h1>
        <div className="topbar__search">{search}</div>
        <nav className="topbar__nav" aria-label="メインメニュー">
          <a {...link({ view: "home" })} aria-current={route.view === "home" ? "page" : undefined}>
            都道府県から
          </a>
          <a {...link(DEFAULT_RANKING)} aria-current={route.view === "ranking" && !route.topic ? "page" : undefined}>
            条件でさがす
          </a>
          <a
            {...link({ view: "topics" })}
            aria-current={route.view === "topics" || (route.view === "ranking" && route.topic) ? "page" : undefined}
          >
            特集
          </a>
          <a {...link(KUJI_HOME)} aria-current={route.view === "kuji" ? "page" : undefined}>
            まちくじ
          </a>
        </nav>
      </div>
    </header>
  );
}

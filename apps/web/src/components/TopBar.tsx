import type { MouseEvent, ReactNode } from "react";
import { hrefOf, DEFAULT_RANKING, type Route } from "../lib/route";

type TopBarProps = {
  route: Route;
  onNavigate: (route: Route) => void;
  /** 上部に置く検索欄（トップページでは本文に検索欄があるので置かない）。 */
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
          <a {...link({ view: "home" })}>
            Local <span>Signal</span> Japan
          </a>
        </h1>
        <nav className="topbar__nav" aria-label="メインメニュー">
          <a {...link({ view: "home" })} aria-current={route.view === "home" ? "page" : undefined}>
            名前でさがす
          </a>
          <a {...link(DEFAULT_RANKING)} aria-current={route.view === "ranking" ? "page" : undefined}>
            条件でさがす
          </a>
        </nav>
        <div className="topbar__search">{search}</div>
      </div>
    </header>
  );
}

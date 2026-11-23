import type { MouseEvent, ReactNode } from "react";
import { hrefOf, KUJI_HOME, QUIZ_HOME, ZUKAN_HOME, type PlayRoute, type Route } from "../lib/route";

const TABS: Array<{ view: PlayRoute["view"]; label: string; route: PlayRoute }> = [
  { view: "kuji", label: "まちくじ", route: KUJI_HOME },
  { view: "quiz", label: "まちクイズ", route: QUIZ_HOME },
  { view: "zukan", label: "まち図鑑", route: ZUKAN_HOME }
];

type PlayHeaderProps = {
  current: PlayRoute["view"];
  title: string;
  lead: ReactNode;
  onNavigate: (route: Route) => void;
};

/** あそぶ（まちくじ・まちクイズ・まち図鑑）の見出しと切り替え。 */
export function PlayHeader({ current, title, lead, onNavigate }: PlayHeaderProps) {
  return (
    <header className="play-head">
      <nav className="play-tabs" aria-label="あそぶ">
        {TABS.map((tab) => (
          <a
            key={tab.view}
            href={hrefOf(tab.route)}
            aria-current={tab.view === current ? "page" : undefined}
            onClick={(event: MouseEvent) => {
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              onNavigate(tab.route);
            }}
          >
            {tab.label}
          </a>
        ))}
      </nav>
      <h2>{title}</h2>
      <p>{lead}</p>
    </header>
  );
}

/** 朱のハンコ（飾り。読み上げでは、隣の文で同じことを伝える）。 */
export function Stamp({ top, bottom }: { top: string; bottom: string }) {
  return (
    <span className="stamp" aria-hidden="true">
      <span>{top}</span>
      <strong>{bottom}</strong>
    </span>
  );
}

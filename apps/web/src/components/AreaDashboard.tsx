import { useEffect, useMemo, useRef, type KeyboardEvent, type RefObject } from "react";
import {
  AREA_KIND_LABELS,
  buildAreaView,
  buildSummary,
  formatNumber,
  renderMarkdownReport,
  type AreaRecord,
  type AreaIndex,
  type Manifest,
  type PrefectureFile
} from "@local-signal-japan/core";
import { DEFAULT_RANKING, hrefOf, TABS, type RankingRoute, type TabId } from "../lib/route";
import { ComparisonPanel } from "./ComparisonPanel";
import { IndicatorsPanel } from "./IndicatorsPanel";
import { OverviewPanel } from "./OverviewPanel";
import { ReportPanel } from "./ReportPanel";

const TAB_LABELS: Record<TabId, string> = {
  overview: "概要",
  indicators: "指標",
  comparison: "比較",
  report: "レポート"
};

type AreaDashboardProps = {
  area: AreaRecord;
  prefecture: PrefectureFile;
  manifest: Manifest;
  index: AreaIndex;
  tab: TabId;
  compare: string[];
  /** 別の市区町村を読み込んでいる間、表示を保ったまま操作を止める。 */
  busy: boolean;
  /** true のとき、市区町村が切り替わったら見出しへフォーカスを移す(検索から選んだ直後)。 */
  focusRequestRef: RefObject<boolean>;
  onTabChange: (tab: TabId) => void;
  onCompareChange: (codes: string[]) => void;
  onSelectArea: (areaCode: string) => void;
  onOpenRanking: (route: RankingRoute) => void;
};

export function AreaDashboard({
  area,
  prefecture,
  manifest,
  index,
  tab,
  compare,
  busy,
  focusRequestRef,
  onTabChange,
  onCompareChange,
  onSelectArea,
  onOpenRanking
}: AreaDashboardProps) {
  const view = useMemo(() => buildAreaView(area, manifest), [area, manifest]);
  const summary = useMemo(() => buildSummary(view, manifest), [view, manifest]);
  const markdown = useMemo(() => renderMarkdownReport(view, manifest), [view, manifest]);
  const tabRefs = useRef(new Map<TabId, HTMLButtonElement>());
  const headingRef = useRef<HTMLHeadingElement>(null);

  // 検索から選んだときは、読み込みが済んだ見出しへフォーカスを移して読み上げ位置を合わせる。
  useEffect(() => {
    if (focusRequestRef.current && headingRef.current) {
      focusRequestRef.current = false;
      headingRef.current.focus({ preventScroll: true });
      window.scrollTo({ top: 0 });
    }
  }, [area.code, focusRequestRef]);

  const population = view.indicators.find((indicator) => indicator.key === "population");
  const missingLabels = view.indicators
    .filter((indicator) => !indicator.available)
    .map((indicator) => indicator.definition.label);
  const prefectureRanking: RankingRoute = { ...DEFAULT_RANKING, prefCode: area.prefCode };

  const handleTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = TABS.indexOf(tab);
    const targets: Record<string, number> = {
      ArrowRight: (current + 1) % TABS.length,
      ArrowLeft: (current - 1 + TABS.length) % TABS.length,
      Home: 0,
      End: TABS.length - 1
    };
    const next = TABS[targets[event.key] ?? -1];
    if (next) {
      event.preventDefault();
      onTabChange(next);
      tabRefs.current.get(next)?.focus();
    }
  };

  return (
    <article className="area" aria-busy={busy} data-busy={busy}>
      <header className="container area-head">
        <div className="area-head__top">
          <div className="area-head__identity">
            <p className="area-head__path">
              <a
                href={hrefOf(prefectureRanking)}
                onClick={(event) => {
                  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  onOpenRanking(prefectureRanking);
                }}
              >
                {area.prefName}
              </a>
              {area.parentName && <span>{area.parentName}</span>}
            </p>
            <h2 ref={headingRef} tabIndex={-1}>
              {area.name}
            </h2>
            <p className="area-head__meta">
              {area.kana !== "" && (
                <span>
                  <span className="visually-hidden">よみがな: </span>
                  {area.kana}
                </span>
              )}
              <span>
                市区町村コード <code>{area.code}</code>
              </span>
              <span>{AREA_KIND_LABELS[area.kind]}</span>
              <span>
                {view.coverage.total}指標のうち{view.coverage.available}指標を収録
                {missingLabels.length > 0 && `（欠損: ${missingLabels.join("、")}）`}
              </span>
            </p>
          </div>

          <dl className="figures">
            <div className="figure">
              <dt>
                人口
                {population?.headline && <span>{population.headline.period}現在</span>}
              </dt>
              <dd className="figure__value">
                {area.population === null ? "欠損" : formatNumber(area.population)}
                {area.population !== null && <small>人</small>}
              </dd>
              {population?.change && (
                <dd className="figure__note">
                  {population.change.label} {population.change.text}
                </dd>
              )}
            </div>
          </dl>
        </div>

        <div className="tabs" role="tablist" aria-label="表示する内容" onKeyDown={handleTabKey}>
          {TABS.map((id) => (
            <button
              type="button"
              key={id}
              role="tab"
              id={`tab-${id}`}
              aria-selected={tab === id}
              aria-controls="tab-panel"
              tabIndex={tab === id ? 0 : -1}
              className={tab === id ? "tab is-active" : "tab"}
              ref={(element) => {
                if (element) tabRefs.current.set(id, element);
                else tabRefs.current.delete(id);
              }}
              onClick={() => onTabChange(id)}
            >
              {TAB_LABELS[id]}
            </button>
          ))}
        </div>
      </header>

      <div className="container">
        <div id="tab-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="tab-panel">
          {tab === "overview" && (
            <OverviewPanel
              view={view}
              summary={summary}
              manifest={manifest}
              onOpenIndicators={() => onTabChange("indicators")}
            />
          )}
          {tab === "indicators" && <IndicatorsPanel view={view} manifest={manifest} />}
          {tab === "comparison" && (
            <ComparisonPanel
              area={area}
              prefecture={prefecture}
              manifest={manifest}
              index={index}
              compare={compare}
              onCompareChange={onCompareChange}
              onSelect={onSelectArea}
            />
          )}
          {tab === "report" && <ReportPanel areaCode={area.code} markdown={markdown} />}
        </div>
      </div>
    </article>
  );
}

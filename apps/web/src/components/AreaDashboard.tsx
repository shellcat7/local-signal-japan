import { useEffect, useMemo, useRef, type KeyboardEvent, type RefObject } from "react";
import { ChevronRight } from "lucide-react";
import {
  AREA_KIND_LABELS,
  buildAreaView,
  buildSummary,
  CONFIDENCE_LABELS,
  DISCLAIMER,
  formatNumber,
  renderMarkdownReport,
  SCORE_BAND_LABELS,
  type AreaRecord,
  type AreaIndex,
  type Manifest,
  type PrefectureFile
} from "@local-signal-japan/core";
import { hrefOf, TABS, type RankingRoute, type TabId } from "../lib/route";
import { ComparisonPanel } from "./ComparisonPanel";
import { IndicatorsPanel } from "./IndicatorsPanel";
import { OverviewPanel } from "./OverviewPanel";
import { RangeBar } from "./RangeBar";
import { ReportPanel } from "./ReportPanel";
import { Sparkline } from "./Sparkline";

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
  const prefectureRanking: RankingRoute = {
    view: "ranking",
    metric: "overall",
    order: "desc",
    prefCode: area.prefCode,
    size: "all"
  };

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
      <header className="band band--quote">
        <div className="container quote">
          <div className="quote__identity">
            <p className="quote__path">
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
              {area.parentName && (
                <>
                  <ChevronRight size={14} aria-hidden="true" />
                  <span>{area.parentName}</span>
                </>
              )}
            </p>
            <h2 ref={headingRef} tabIndex={-1}>
              {area.name}
            </h2>
            {area.kana !== "" && (
              <p className="quote__kana">
                <span className="visually-hidden">よみがな: </span>
                {area.kana}
              </p>
            )}
            <ul className="quote__tags">
              <li>
                <span className="visually-hidden">市区町村コード </span>
                <code>{area.code}</code>
              </li>
              <li>{AREA_KIND_LABELS[area.kind]}</li>
            </ul>
          </div>

          <dl className="quote__stats">
            <div className="quote-stat quote-stat--lead">
              <dt>総合補助スコア</dt>
              <dd className="quote-stat__value">
                {view.overallScore ?? "欠損"}
                {view.overallScore !== null && <small>/100</small>}
              </dd>
              <dd className="quote-stat__bar">
                {view.overallScore !== null && (
                  <RangeBar
                    position={view.overallScore}
                    variant="fill"
                    tone="night"
                    label={`総合補助スコア ${view.overallScore}。全国の中央値は50。`}
                  />
                )}
              </dd>
              <dd className="quote-stat__note">
                {view.overallScore === null
                  ? "利用できる指標が少ないため算出していません"
                  : `全国の${SCORE_BAND_LABELS[view.overallBand]}・${view.coverage.available}指標の平均`}
              </dd>
            </div>
            <div className="quote-stat">
              <dt>人口</dt>
              <dd className="quote-stat__value">
                {area.population === null ? "欠損" : formatNumber(area.population)}
                {area.population !== null && <small>人</small>}
              </dd>
              {population?.chart && (
                <dd className="quote-stat__spark">
                  <Sparkline points={population.chart.points} width={132} height={32} tone="night" />
                </dd>
              )}
              <dd className="quote-stat__note">
                <span>
                  {population?.change ? `${population.change.label} ${population.change.text}` : "住民基本台帳"}
                </span>
                {population?.headline && <span>{population.headline.period}</span>}
              </dd>
            </div>
            <div className="quote-stat">
              <dt>利用できる指標</dt>
              <dd className="quote-stat__value">
                {view.coverage.available}
                <small>/{view.coverage.total}</small>
              </dd>
              <dd className="quote-stat__note">
                {missingLabels.length === 0 ? "すべての指標がそろっています" : `欠損: ${missingLabels.join("、")}`}
              </dd>
            </div>
            <div className="quote-stat">
              <dt>信頼度メモ</dt>
              <dd className="quote-stat__value">{CONFIDENCE_LABELS[view.confidence.level]}</dd>
              <dd className="quote-stat__note">{view.confidence.reason}</dd>
            </div>
          </dl>
        </div>
      </header>

      <div className="tabs-bar">
        <div className="container tabs-bar__inner">
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
          <p className="tabs-bar__note">この画面は{DISCLAIMER}</p>
        </div>
      </div>

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

import { useEffect, useMemo, useRef, type KeyboardEvent, type RefObject } from "react";
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
  type Manifest,
  type PrefectureFile
} from "@local-signal-japan/core";
import { TABS, type TabId } from "../lib/route";
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
  tab: TabId;
  /** 別の市区町村を読み込んでいる間、表示を保ったまま操作を止める。 */
  busy: boolean;
  /** true のとき、市区町村が切り替わったら見出しへフォーカスを移す(検索から選んだ直後)。 */
  focusRequestRef: RefObject<boolean>;
  onTabChange: (tab: TabId) => void;
  onSelectArea: (areaCode: string) => void;
};

export function AreaDashboard({
  area,
  prefecture,
  manifest,
  tab,
  busy,
  focusRequestRef,
  onTabChange,
  onSelectArea
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
      headingRef.current.scrollIntoView({ block: "start" });
    }
  }, [area.code, focusRequestRef]);

  const missingLabels = view.indicators
    .filter((indicator) => !indicator.available)
    .map((indicator) => indicator.definition.label);
  const populationYear = manifest.indicators.population.year;

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
      <header className="area-header">
        <p className="area-header__pref">
          {area.prefName}
          {area.parentName && ` ${area.parentName}`}
        </p>
        <h2 ref={headingRef} tabIndex={-1}>
          {area.name}
        </h2>
        <ul className="area-header__facts">
          <li>市区町村コード {area.code}</li>
          <li>{AREA_KIND_LABELS[area.kind]}</li>
        </ul>
      </header>

      <dl className="stat-row">
        <div className="stat-tile stat-tile--hero">
          <dt>総合補助スコア</dt>
          <dd>
            {view.overallScore ?? "欠損"}
            {view.overallScore !== null && <small>/100</small>}
          </dd>
          <dd className="stat-tile__detail">
            {view.overallScore === null
              ? "利用できる指標が少ないため算出していません"
              : `全国の${SCORE_BAND_LABELS[view.overallBand]}・${view.coverage.available}指標の平均`}
          </dd>
        </div>
        <div className="stat-tile">
          <dt>人口</dt>
          <dd>
            {area.population === null ? "欠損" : formatNumber(area.population)}
            {area.population !== null && <small>人</small>}
          </dd>
          <dd className="stat-tile__detail">住民基本台帳・{populationYear}年1月1日</dd>
        </div>
        <div className="stat-tile">
          <dt>利用できる指標</dt>
          <dd>
            {view.coverage.available}
            <small>/{view.coverage.total}</small>
          </dd>
          <dd className="stat-tile__detail">
            {missingLabels.length === 0 ? "すべての指標がそろっています" : `欠損: ${missingLabels.join("、")}`}
          </dd>
        </div>
        <div className="stat-tile">
          <dt>信頼度メモ</dt>
          <dd>{CONFIDENCE_LABELS[view.confidence.level]}</dd>
          <dd className="stat-tile__detail">{view.confidence.reason}</dd>
        </div>
      </dl>

      <p className="disclaimer">この画面は{DISCLAIMER}</p>

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

      <div id="tab-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="tab-panel">
        {tab === "overview" && <OverviewPanel view={view} summary={summary} manifest={manifest} />}
        {tab === "indicators" && <IndicatorsPanel view={view} />}
        {tab === "comparison" && (
          <ComparisonPanel area={area} prefecture={prefecture} manifest={manifest} onSelect={onSelectArea} />
        )}
        {tab === "report" && <ReportPanel areaCode={area.code} markdown={markdown} />}
      </div>
    </article>
  );
}

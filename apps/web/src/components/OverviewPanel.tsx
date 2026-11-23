import { ArrowDownRight, ArrowUpRight, CircleSlash, Info } from "lucide-react";
import {
  SCORE_BAND_LABELS,
  SUMMARY_SECTIONS,
  type AreaSummary,
  type AreaView,
  type IndicatorView,
  type Manifest
} from "@local-signal-japan/core";
import { HowToRead } from "./HowToRead";
import { LineChart, SeriesTable } from "./LineChart";

type OverviewPanelProps = {
  view: AreaView;
  summary: AreaSummary;
  manifest: Manifest;
};

const SECTION_ICONS = {
  upperSignals: ArrowUpRight,
  lowerSignals: ArrowDownRight,
  cautionSignals: Info,
  missingDataNotes: CircleSlash
} as const;

function MeterRow({ indicator }: { indicator: IndicatorView }) {
  const label =
    indicator.score === null
      ? `${indicator.definition.label}: 欠損`
      : `${indicator.definition.label}: 補助スコア ${indicator.score}（${SCORE_BAND_LABELS[indicator.band]}）`;

  return (
    <li className="meter-row">
      <div className="meter-row__name">
        <strong>{indicator.definition.label}</strong>
        <span>
          {indicator.valueText}
          {indicator.available && `（${indicator.periodText}）`}
        </span>
      </div>
      <div className="meter" role="img" aria-label={label} data-missing={indicator.score === null}>
        {indicator.score !== null && <span className="meter__fill" style={{ width: `${indicator.score}%` }} />}
        <span className="meter__median" />
      </div>
      <div className="meter-row__score">{indicator.score ?? "欠損"}</div>
    </li>
  );
}

export function OverviewPanel({ view, summary, manifest }: OverviewPanelProps) {
  const population = view.indicators.find((indicator) => indicator.key === "population");
  const signalGroups = SUMMARY_SECTIONS.map((section) => ({
    ...section,
    icon: SECTION_ICONS[section.key],
    items: summary[section.key]
  }));

  return (
    <div className="overview">
      <div className="overview__column">
        <section className="panel" aria-labelledby="breakdown-title">
          <div className="panel__head">
            <h3 id="breakdown-title">補助スコアの内訳</h3>
            <p>全国の市区町村の中での位置（0〜100）。縦の線が全国の中央値（50）です。</p>
          </div>
          <ul className="meter-list">
            {view.indicators.map((indicator) => (
              <MeterRow key={indicator.key} indicator={indicator} />
            ))}
          </ul>
          <details className="disclosure">
            <summary>補助スコアの読み方</summary>
            <HowToRead manifest={manifest} />
          </details>
        </section>

        {population?.chart && (
          <section className="panel" aria-labelledby="population-chart-title">
            <div className="panel__head">
              <h3 id="population-chart-title">住民基本台帳人口の推移</h3>
              <p>各年1月1日現在（2013年のみ3月31日現在）。外国人住民を含みます。</p>
            </div>
            <LineChart
              title="住民基本台帳人口の推移"
              points={population.chart.points}
              unit={population.chart.series.unit}
              decimals={population.chart.series.decimals}
              cycle={population.chart.series.cycle}
              height={240}
            />
            <SeriesTable
              title="住民基本台帳人口の推移"
              points={population.chart.points}
              unit={population.chart.series.unit}
              decimals={population.chart.series.decimals}
              cycle={population.chart.series.cycle}
            />
          </section>
        )}
      </div>

      <section className="panel" aria-labelledby="signals-title">
        <div className="panel__head">
          <h3 id="signals-title">公開統計から読み取れるシグナル</h3>
          <p>指標値と補助スコアから、決まった規則で機械的に書き出しています。</p>
        </div>
        <div className="signal-groups">
          {signalGroups.map(({ key, title, note, icon: Icon, items }) => (
            <section className="signal-group" key={key}>
              <h4>
                <Icon size={16} aria-hidden="true" />
                {title}
                <span>{note}</span>
              </h4>
              {items.length > 0 ? (
                <ul>
                  {items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="signal-group__empty">該当なし</p>
              )}
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}

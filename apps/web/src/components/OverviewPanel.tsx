import { ArrowDownRight, ArrowRight, ArrowUpRight, CircleSlash, Info } from "lucide-react";
import {
  formatNumber,
  SCORE_BAND_LABELS,
  SUMMARY_SECTIONS,
  type AreaSummary,
  type AreaView,
  type IndicatorView,
  type Manifest
} from "@local-signal-japan/core";
import { HowToRead } from "./HowToRead";
import { LineChart, SeriesTable } from "./LineChart";
import { RangeBar } from "./RangeBar";
import { Sparkline } from "./Sparkline";

type OverviewPanelProps = {
  view: AreaView;
  summary: AreaSummary;
  manifest: Manifest;
  onOpenIndicators: () => void;
};

const SECTION_ICONS = {
  upperSignals: ArrowUpRight,
  lowerSignals: ArrowDownRight,
  cautionSignals: Info,
  missingDataNotes: CircleSlash
} as const;

/** 増減の向き。上がる・下がるに良し悪しの色は付けない。 */
function TrendIcon({ sign }: { sign: -1 | 0 | 1 }) {
  const Icon = sign > 0 ? ArrowUpRight : sign < 0 ? ArrowDownRight : ArrowRight;
  return <Icon className="summary__trend" size={14} aria-hidden="true" />;
}

function SummaryRow({ indicator }: { indicator: IndicatorView }) {
  const { definition } = indicator;
  const flowSign = indicator.direction === "up" ? 1 : indicator.direction === "down" ? -1 : 0;

  return (
    <tr data-missing={!indicator.available}>
      <th scope="row">
        <span className="summary__name">{definition.label}</span>
        <span className="summary__sub">{definition.headlineLabel}</span>
      </th>
      <td className="summary__value">
        {indicator.headline ? (
          <>
            <strong>{indicator.headline.text}</strong>
            <span className="summary__sub is-mono">{indicator.headline.period}</span>
          </>
        ) : (
          <span className="summary__missing">欠損</span>
        )}
      </td>
      <td className="summary__change">
        {indicator.change ? (
          <>
            <strong>
              <TrendIcon sign={indicator.change.sign} />
              {indicator.change.text}
            </strong>
            <span className="summary__sub">{indicator.change.label}</span>
          </>
        ) : indicator.available && indicator.direction !== "unknown" ? (
          <>
            <strong>
              <TrendIcon sign={flowSign} />
              {indicator.directionText}
            </strong>
            <span className="summary__sub">3年平均</span>
          </>
        ) : (
          <span className="summary__dash" aria-label="比較なし">
            —
          </span>
        )}
      </td>
      <td className="summary__spark">
        {indicator.chart && indicator.available && (
          <Sparkline points={indicator.chart.points} breakAfterYear={indicator.chart.breakAfterYear} />
        )}
      </td>
      <td className="summary__rank">
        {indicator.rank !== null ? (
          <>
            <strong>
              {formatNumber(indicator.rank)}
              <small>位</small>
            </strong>
            <span className="summary__sub is-mono">/ {formatNumber(indicator.rankTotal)}</span>
          </>
        ) : (
          <span className="summary__dash" aria-label="順位なし">
            —
          </span>
        )}
      </td>
      <td className="summary__score">
        {indicator.score !== null ? (
          <>
            <RangeBar
              position={indicator.score}
              variant="fill"
              label={`補助スコア ${indicator.score}（${SCORE_BAND_LABELS[indicator.band]}）`}
            />
            <strong aria-hidden="true">{indicator.score}</strong>
          </>
        ) : (
          <span className="summary__missing">欠損</span>
        )}
      </td>
    </tr>
  );
}

export function OverviewPanel({ view, summary, manifest, onOpenIndicators }: OverviewPanelProps) {
  const population = view.indicators.find((indicator) => indicator.key === "population");
  const signalGroups = SUMMARY_SECTIONS.map((section) => ({
    ...section,
    icon: SECTION_ICONS[section.key],
    items: summary[section.key]
  }));
  const isWard = view.area.kind === "ward";

  return (
    <div className="overview">
      <section className="card card--flush overview__summary" aria-labelledby="summary-title">
        <header className="card__head">
          <div>
            <h3 id="summary-title">指標サマリー</h3>
            <p>
              順位は値が大きい順、補助スコアは全国の中での位置（0〜100、縦の線が中央値）です。
              {isWard && "政令指定都市の区は市全体と重複するため、順位を付けていません。"}
            </p>
          </div>
          <button type="button" className="text-link" onClick={onOpenIndicators}>
            指標ごとの詳細
            <ArrowRight size={14} aria-hidden="true" />
          </button>
        </header>
        <div className="table-scroll" role="region" aria-label="指標サマリーの表" tabIndex={0}>
          <table className="summary">
            <thead>
              <tr>
                <th scope="col">指標</th>
                <th scope="col">水準</th>
                <th scope="col">変化</th>
                <th scope="col">推移</th>
                <th scope="col">全国順位</th>
                <th scope="col">補助スコア</th>
              </tr>
            </thead>
            <tbody>
              {view.indicators.map((indicator) => (
                <SummaryRow key={indicator.key} indicator={indicator} />
              ))}
            </tbody>
          </table>
        </div>
        <details className="disclosure card__foot">
          <summary>補助スコアの読み方</summary>
          <HowToRead manifest={manifest} />
        </details>
      </section>

      <section className="card overview__signals" aria-labelledby="signals-title">
        <header className="card__head">
          <div>
            <h3 id="signals-title">公開統計から読み取れるシグナル</h3>
            <p>指標値と補助スコアから、決まった規則で機械的に書き出しています。</p>
          </div>
        </header>
        <div className="signal-groups">
          {signalGroups.map(({ key, title, note, icon: Icon, items }) => (
            <section className="signal-group" key={key}>
              <h4>
                <Icon size={15} aria-hidden="true" />
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

      {population?.chart && (
        <section className="card overview__chart" aria-labelledby="population-chart-title">
          <header className="card__head">
            <div>
              <h3 id="population-chart-title">住民基本台帳人口の推移</h3>
              <p>各年1月1日現在（2013年のみ3月31日現在）。外国人住民を含みます。</p>
            </div>
          </header>
          <LineChart
            title="住民基本台帳人口の推移"
            points={population.chart.points}
            unit={population.chart.series.unit}
            decimals={population.chart.series.decimals}
            cycle={population.chart.series.cycle}
            height={260}
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
  );
}

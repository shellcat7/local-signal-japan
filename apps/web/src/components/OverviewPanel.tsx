import {
  CONFIDENCE_LABELS,
  formatNumber,
  SCORE_BAND_LABELS,
  valuePosition,
  type AreaSummary,
  type AreaView,
  type IndicatorView,
  type Manifest
} from "@local-signal-japan/core";
import { HowToRead } from "./HowToRead";
import { LineChart, SeriesTable } from "./LineChart";
import { RangeBar } from "./RangeBar";
import { ScrollRegion } from "./ScrollRegion";
import { Sparkline } from "./Sparkline";

type OverviewPanelProps = {
  view: AreaView;
  summary: AreaSummary;
  manifest: Manifest;
  onOpenIndicators: () => void;
};

function SummaryRow({ indicator }: { indicator: IndicatorView }) {
  const { definition } = indicator;
  // 人口は指標値そのものが5年間の増減率なので、5年前比の欄には何も出さない。
  const showChange = indicator.key !== "population";
  const position = valuePosition(indicator.key, indicator.score);

  return (
    <tr data-missing={!indicator.available}>
      <th scope="row">
        <span className="summary__name">{definition.label}</span>
        <span className="summary__sub">{definition.columnLabel}</span>
      </th>
      <td className="summary__value">
        {indicator.value !== null ? (
          <>
            <strong>
              {formatNumber(indicator.value, definition.decimals, definition.signed)}
              {definition.unit !== "" && <small>{definition.unit}</small>}
            </strong>
            <span className="summary__sub">{indicator.periodText}</span>
          </>
        ) : (
          <span className="summary__missing">欠損</span>
        )}
      </td>
      <td className="summary__rank">
        {indicator.rank !== null ? (
          <>
            <strong>
              {formatNumber(indicator.rank)}
              <small>位</small>
            </strong>
            <span className="summary__sub">/{formatNumber(indicator.rankTotal)}</span>
          </>
        ) : (
          <span className="summary__dash" aria-label="順位なし">
            —
          </span>
        )}
      </td>
      <td className="summary__position">
        {position !== null && (
          <RangeBar
            position={position}
            label={`全国での位置。値が小さい側から数えて${position}%のところ。中央値は50%。`}
          />
        )}
      </td>
      <td className="summary__spark">
        {indicator.chart && indicator.available && (
          <>
            <Sparkline points={indicator.chart.points} breakAfterYear={indicator.chart.breakAfterYear} />
            <span className="summary__sub">{indicator.chart.series.label}</span>
          </>
        )}
      </td>
      <td className="summary__change">
        {showChange && indicator.change ? (
          <strong>{indicator.change.text}</strong>
        ) : showChange && indicator.available && indicator.direction !== "unknown" ? (
          <>
            <strong>{indicator.directionText}</strong>
            <span className="summary__sub">3年平均</span>
          </>
        ) : (
          <span className="summary__dash" aria-label="比較なし">
            —
          </span>
        )}
      </td>
    </tr>
  );
}

export function OverviewPanel({ view, summary, manifest, onOpenIndicators }: OverviewPanelProps) {
  const population = view.indicators.find((indicator) => indicator.key === "population");
  const isWard = view.area.kind === "ward";
  const cautions = [...summary.cautionSignals, ...summary.missingDataNotes];

  return (
    <div className="overview">
      <section className="block overview__summary" aria-labelledby="summary-title">
        <header className="block__head">
          <h3 id="summary-title">7つの指標</h3>
          <button type="button" className="text-link" onClick={onOpenIndicators}>
            指標ごとの詳細を見る
          </button>
        </header>
        <ScrollRegion label="7つの指標の表">
          <table className="summary">
            <thead>
              <tr>
                <th scope="col">指標</th>
                <th scope="col">指標値</th>
                <th scope="col">全国順位</th>
                <th scope="col">
                  全国での位置
                  <span className="summary__scale" aria-hidden="true">
                    小 ← 中央値 → 大
                  </span>
                </th>
                <th scope="col">推移</th>
                <th scope="col">5年前比</th>
              </tr>
            </thead>
            <tbody>
              {view.indicators.map((indicator) => (
                <SummaryRow key={indicator.key} indicator={indicator} />
              ))}
            </tbody>
          </table>
        </ScrollRegion>
        <ul className="notes">
          <li>
            全国順位は、政令指定都市の区を除く市区町村のうち値があるものの中で、指標値が大きい順に数えています（同じ値は同順位）。
            {isWard && "政令指定都市の区は市全体と重複するため、順位を付けていません。"}
          </li>
          <li>「全国での位置」は、左端が全国で最も値が小さい側、右端が最も大きい側です。</li>
          <li>
            信頼度メモ「{CONFIDENCE_LABELS[view.confidence.level]}」：{view.confidence.reason}
          </li>
        </ul>
      </section>

      <section className="block overview__scores" aria-labelledby="scores-title">
        <header className="block__head">
          <h3 id="scores-title">補助スコア</h3>
          <p>全国の中での位置（0〜100、50が中央値）</p>
        </header>
        <table className="score-table">
          <thead className="visually-hidden">
            <tr>
              <th scope="col">指標</th>
              <th scope="col">補助スコア</th>
              <th scope="col">区分</th>
            </tr>
          </thead>
          <tbody>
            {view.indicators.map((indicator) => (
              <tr key={indicator.key}>
                <th scope="row">{indicator.definition.columnLabel}</th>
                <td className="is-numeric">{indicator.score ?? "…"}</td>
                <td>{indicator.score === null ? "欠損" : SCORE_BAND_LABELS[indicator.band]}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">
                総合<small>{view.coverage.available}指標の平均</small>
              </th>
              <td className="is-numeric">{view.overallScore ?? "…"}</td>
              <td>{view.overallScore === null ? "算出なし" : SCORE_BAND_LABELS[view.overallBand]}</td>
            </tr>
          </tfoot>
        </table>
        <ul className="notes">
          <li>
            高齢化率・完全失業率は値が小さいほど、ほかの指標は値が大きいほど高くなる向きにそろえています。向きは集計上の約束です。
          </li>
          <li>上位は67以上、下位は33以下（全国を3等分）。欠損した指標は平均に含めません。</li>
        </ul>
        <details className="disclosure">
          <summary>補助スコアの読み方</summary>
          <HowToRead manifest={manifest} />
        </details>
      </section>

      <section className="block overview__cautions" aria-labelledby="cautions-title">
        <header className="block__head">
          <h3 id="cautions-title">読み取り時の注意</h3>
        </header>
        {cautions.length > 0 ? (
          <ul className="caution-list">
            {cautions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="empty">この市区町村について、特に挙げる注意はありません。</p>
        )}
      </section>

      {population?.chart && (
        <section className="block overview__chart" aria-labelledby="population-chart-title">
          <header className="block__head">
            <h3 id="population-chart-title">住民基本台帳人口の推移</h3>
            <p>単位：人</p>
          </header>
          <LineChart
            title="住民基本台帳人口の推移"
            points={population.chart.points}
            unit={population.chart.series.unit}
            decimals={population.chart.series.decimals}
            cycle={population.chart.series.cycle}
            height={250}
          />
          <SeriesTable
            title="住民基本台帳人口の推移"
            points={population.chart.points}
            unit={population.chart.series.unit}
            decimals={population.chart.series.decimals}
            cycle={population.chart.series.cycle}
          />
          <ul className="notes">
            <li>各年1月1日現在（2013年のみ3月31日現在）。外国人住民を含みます。</li>
          </ul>
        </section>
      )}
    </div>
  );
}

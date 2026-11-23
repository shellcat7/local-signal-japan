import { ExternalLink } from "lucide-react";
import { formatDate, formatNumber, type AreaView, type IndicatorView } from "@local-signal-japan/core";
import { LineChart, SeriesTable } from "./LineChart";
import { PositionTrack } from "./PositionTrack";
import { ScorePill } from "./ScorePill";

function IndicatorCard({ indicator, retrievedAt }: { indicator: IndicatorView; retrievedAt: string }) {
  const { definition, chart } = indicator;
  const headingId = `indicator-${indicator.key}`;
  const chartTitle = chart ? `${chart.series.label}の推移` : "";

  return (
    <article className="panel indicator-card" aria-labelledby={headingId}>
      <header className="indicator-card__head">
        <div>
          <h3 id={headingId}>{definition.label}</h3>
          <p>{definition.summary}</p>
        </div>
        <ScorePill score={indicator.score} />
      </header>

      <div className="indicator-card__metric">
        <p className="indicator-card__metric-label">
          {definition.metricLabel}
          <span>{indicator.periodText}</span>
        </p>
        <p className="indicator-card__value">
          {indicator.value === null ? (
            "欠損"
          ) : (
            <>
              {formatNumber(indicator.value, definition.decimals, definition.signed)}
              {definition.unit !== "" && <small>{definition.unit}</small>}
            </>
          )}
        </p>
        {indicator.available && indicator.direction !== "unknown" && (
          <p className="indicator-card__direction">
            直近の動き: <strong>{indicator.directionText}</strong>
            <span>（{definition.directionBasis}）</span>
          </p>
        )}
      </div>

      {indicator.missingText && <p className="notice">{indicator.missingText}</p>}

      {indicator.position !== null && <PositionTrack position={indicator.position} medianText={indicator.medianText} />}

      {indicator.facts.length > 0 && (
        <dl className="fact-list">
          {indicator.facts.map((fact) => (
            <div key={`${fact.label}-${fact.period}`}>
              <dt>
                {fact.label}
                <span>{fact.period}</span>
              </dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {chart && (
        <figure className="indicator-card__chart">
          <figcaption>
            {chartTitle}
            {chart.breakAfterYear !== undefined && (
              <span>{chart.breakAfterYear}年以前とそれより後では調査方法が異なるため、線をつないでいません。</span>
            )}
          </figcaption>
          <LineChart
            title={chartTitle}
            points={chart.points}
            unit={chart.series.unit}
            decimals={chart.series.decimals}
            cycle={chart.series.cycle}
            signed={indicator.key === "migration"}
            height={170}
            breakAfterYear={chart.breakAfterYear}
          />
          <SeriesTable
            title={chartTitle}
            points={chart.points}
            unit={chart.series.unit}
            decimals={chart.series.decimals}
            cycle={chart.series.cycle}
            signed={indicator.key === "migration"}
          />
        </figure>
      )}

      <details className="disclosure">
        <summary>算出方法と読み取り時の注意</summary>
        <div className="prose">
          <p>
            <strong>算出方法</strong>：{definition.method}
          </p>
          <ul>
            {definition.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      </details>

      <footer className="source-list">
        <h4>出典（取得日 {formatDate(retrievedAt)}）</h4>
        <ul>
          {indicator.sources.map((source) => (
            <li key={source.code}>
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.name}
                <ExternalLink size={12} aria-hidden="true" />
                <span className="visually-hidden">（統計ダッシュボードAPIの値を新しいタブで開く）</span>
              </a>
              <span>
                {source.statName}・系列コード {source.code}・最新 {source.latestPeriod}
              </span>
            </li>
          ))}
        </ul>
      </footer>
    </article>
  );
}

export function IndicatorsPanel({ view }: { view: AreaView }) {
  return (
    <div className="indicator-grid">
      {view.indicators.map((indicator) => (
        <IndicatorCard key={indicator.key} indicator={indicator} retrievedAt={view.retrievedAt} />
      ))}
    </div>
  );
}

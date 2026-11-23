import {
  formatDateLong,
  formatMetric,
  formatNumber,
  SCORE_BAND_LABELS,
  type AreaView,
  type IndicatorView,
  type Manifest
} from "@local-signal-japan/core";
import { Histogram } from "./Histogram";
import { LineChart, SeriesTable } from "./LineChart";

type IndicatorPanelProps = {
  indicator: IndicatorView;
  manifest: Manifest;
  retrievedAt: string;
  isWard: boolean;
};

function IndicatorPanel({ indicator, manifest, retrievedAt, isWard }: IndicatorPanelProps) {
  const { definition, chart } = indicator;
  const meta = manifest.indicators[indicator.key];
  const headingId = `indicator-${indicator.key}`;
  const chartTitle = chart ? `${chart.series.label}の推移` : "";
  const signed = indicator.key === "migration";
  // 大きく出している指標値と同じ内容の行は、繰り返さない。
  const headlineText = indicator.value === null ? null : formatMetric(definition, indicator.value);
  const facts = indicator.facts.filter((fact) => fact.value !== headlineText);

  return (
    <article className="block indicator" aria-labelledby={headingId}>
      <header className="indicator__head">
        <h3 id={headingId}>{definition.label}</h3>
        <p className="indicator__score">
          補助スコア
          {indicator.score === null ? (
            <strong>欠損</strong>
          ) : (
            <>
              <strong>{indicator.score}</strong>
              <span>
                {SCORE_BAND_LABELS[indicator.band]}
                {definition.orientation === "lower" && "（値が小さいほど高い向き）"}
              </span>
            </>
          )}
        </p>
      </header>

      <div className="indicator__body">
        <section className="indicator__metric" aria-label="指標値">
          <p className="label">
            {definition.metricLabel}
            <span className="is-mono">{indicator.periodText}</span>
          </p>
          <p className="indicator__value">
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
            <p className="indicator__direction">
              直近の動き <strong>{indicator.directionText}</strong>
            </p>
          )}
          {indicator.missingText && <p className="notice">{indicator.missingText}</p>}

          {facts.length > 0 && (
            <dl className="fact-list">
              {facts.map((fact) => (
                <div key={`${fact.label}-${fact.period}`}>
                  <dt>
                    {fact.label}
                    <span className="is-mono">{fact.period}</span>
                  </dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        {chart && (
          <figure className="indicator__chart">
            <figcaption className="label">
              {chartTitle}
              {chart.series.unit !== "" && `（単位：${chart.series.unit}）`}
              {chart.breakAfterYear !== undefined && (
                <span>{chart.breakAfterYear}年以前とそれより後は調査方法が異なるため、線をつないでいません</span>
              )}
            </figcaption>
            <LineChart
              title={chartTitle}
              points={chart.points}
              unit={chart.series.unit}
              decimals={chart.series.decimals}
              cycle={chart.series.cycle}
              signed={signed}
              height={190}
              breakAfterYear={chart.breakAfterYear}
            />
            <SeriesTable
              title={chartTitle}
              points={chart.points}
              unit={chart.series.unit}
              decimals={chart.series.decimals}
              cycle={chart.series.cycle}
              signed={signed}
            />
          </figure>
        )}

        {indicator.value !== null && (
          <section className="indicator__position" aria-label="全国の中での位置">
            <p className="label">全国の分布の中での位置</p>
            <p className="indicator__rank">
              {indicator.rank !== null ? (
                <>
                  <strong>{formatNumber(indicator.rank)}</strong>
                  <small>位</small>
                  <span>/ {formatNumber(indicator.rankTotal)}（値が大きい順）</span>
                </>
              ) : (
                <span>
                  {isWard
                    ? "政令指定都市の区のため順位は付けていません。分布の中での位置は下の図のとおりです。"
                    : "順位はありません。"}
                </span>
              )}
            </p>
            <Histogram
              histogram={meta.histogram}
              value={indicator.value}
              median={meta.distribution.p50}
              format={(value) => formatMetric(definition, value)}
              label={
                indicator.rank !== null
                  ? `全国${formatNumber(indicator.rankTotal)}市区町村の分布。値が大きい順で${formatNumber(indicator.rank)}位。全国の中央値は${indicator.medianText}。`
                  : `全国${formatNumber(indicator.rankTotal)}市区町村の分布。全国の中央値は${indicator.medianText}。`
              }
            />
          </section>
        )}
      </div>

      <footer className="indicator__foot">
        <details className="disclosure">
          <summary>算出方法と読み取り時の注意</summary>
          <div className="prose">
            <p>{definition.summary}</p>
            <p>
              <strong>算出方法</strong>：{definition.method}
            </p>
            <p>
              <strong>直近の動きの基準</strong>：{definition.directionBasis}
            </p>
            <ul>
              {definition.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        </details>
        <div className="source-list">
          <h4>資料（{formatDateLong(retrievedAt)}取得）</h4>
          <ul>
            {indicator.sources.map((source) => (
              <li key={source.code}>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.name}
                  <span className="visually-hidden">（統計ダッシュボードAPIの値を新しいタブで開く）</span>
                </a>
                <span>
                  {source.statName}・系列コード <code>{source.code}</code>・最新 {source.latestPeriod}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </footer>
    </article>
  );
}

export function IndicatorsPanel({ view, manifest }: { view: AreaView; manifest: Manifest }) {
  return (
    <div className="indicator-list">
      {view.indicators.map((indicator) => (
        <IndicatorPanel
          key={indicator.key}
          indicator={indicator}
          manifest={manifest}
          retrievedAt={view.retrievedAt}
          isWard={view.area.kind === "ward"}
        />
      ))}
    </div>
  );
}

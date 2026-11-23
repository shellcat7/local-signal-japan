import {
  areaLocalName,
  formatMetric,
  INDICATORS,
  metricPeriodText,
  rankNational,
  type IndicatorKey,
  type Manifest,
  type NationalRow,
  type PopulationBandId
} from "@local-signal-japan/core";
import { DEFAULT_RANKING, hrefOf, type RankingRoute } from "../lib/route";

type LeaderboardProps = {
  rows: readonly NationalRow[];
  prefNames: ReadonlyMap<string, string>;
  manifest: Manifest;
  metric: IndicatorKey;
  order: "desc" | "asc";
  size: PopulationBandId;
  title: string;
  onOpenArea: (areaCode: string) => void;
  onOpenRanking: (route: RankingRoute) => void;
};

const TOP_COUNT = 5;

/** トップページに置く、一覧の抜粋。「条件でさがす」と同じ規則で並べた上位。 */
export function Leaderboard({
  rows,
  prefNames,
  manifest,
  metric,
  order,
  size,
  title,
  onOpenArea,
  onOpenRanking
}: LeaderboardProps) {
  const ranked = rankNational(rows, { metric, order, populationBand: size }).slice(0, TOP_COUNT);
  const route: RankingRoute = { ...DEFAULT_RANKING, metric, order, size };
  const definition = INDICATORS[metric];

  return (
    <section className="leaderboard">
      <h3>{title}</h3>
      <p className="leaderboard__meta">
        {definition.metricLabel}
        <span className="is-mono">{metricPeriodText(metric, manifest.indicators[metric].year)}</span>
      </p>
      <ol>
        {ranked.map(({ row, value, rank }) => (
          <li key={row.code}>
            <span className="leaderboard__rank">{rank}</span>
            <span className="leaderboard__name">
              <button type="button" className="link-button" onClick={() => onOpenArea(row.code)}>
                {areaLocalName(row)}
              </button>
              <small>{prefNames.get(row.prefCode)}</small>
            </span>
            <span className="leaderboard__value">{formatMetric(definition, value)}</span>
          </li>
        ))}
      </ol>
      <a
        className="text-link"
        href={hrefOf(route)}
        onClick={(event) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          onOpenRanking(route);
        }}
      >
        6位以下を見る
      </a>
    </section>
  );
}

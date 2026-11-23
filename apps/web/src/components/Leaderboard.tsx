import { ArrowRight } from "lucide-react";
import {
  areaLocalName,
  formatMetric,
  INDICATORS,
  rankNational,
  type IndicatorKey,
  type NationalRow,
  type PopulationBandId
} from "@local-signal-japan/core";
import { hrefOf, type RankingRoute } from "../lib/route";

type LeaderboardProps = {
  rows: readonly NationalRow[];
  prefNames: ReadonlyMap<string, string>;
  metric: IndicatorKey;
  order: "desc" | "asc";
  size: PopulationBandId;
  title: string;
  onOpenArea: (areaCode: string) => void;
  onOpenRanking: (route: RankingRoute) => void;
};

const TOP_COUNT = 5;

/** トップページに置く、ランキングの抜粋。実際のデータで、何が見られる道具かを示す。 */
export function Leaderboard({
  rows,
  prefNames,
  metric,
  order,
  size,
  title,
  onOpenArea,
  onOpenRanking
}: LeaderboardProps) {
  const ranked = rankNational(rows, { metric, order, populationBand: size }).slice(0, TOP_COUNT);
  const route: RankingRoute = { view: "ranking", metric, order, prefCode: null, size };
  const definition = INDICATORS[metric];

  return (
    <section className="leaderboard">
      <header className="leaderboard__head">
        <h3>{title}</h3>
        <p>{definition.metricLabel}</p>
      </header>
      <ol className="leaderboard__list">
        {ranked.map(({ row, value, rank }) => (
          <li key={row.code}>
            <span className="leaderboard__rank">{rank}</span>
            <button type="button" className="leaderboard__name" onClick={() => onOpenArea(row.code)}>
              {areaLocalName(row)}
              <span>{prefNames.get(row.prefCode)}</span>
            </button>
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
        ランキングを見る
        <ArrowRight size={14} aria-hidden="true" />
      </a>
    </section>
  );
}

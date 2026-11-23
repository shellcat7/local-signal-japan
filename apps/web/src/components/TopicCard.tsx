import type { MouseEvent } from "react";
import {
  areaLocalName,
  formatNumber,
  rankNational,
  type Manifest,
  type NationalRow,
  type Topic
} from "@local-signal-japan/core";
import { metricPeriod, metricValueText } from "../lib/metrics";
import { hrefOf, topicRoute, type RankingRoute } from "../lib/route";

type TopicCardProps = {
  topic: Topic;
  rows: readonly NationalRow[];
  prefNames: ReadonlyMap<string, string>;
  manifest: Manifest;
  /** 表に出す件数。 */
  limit: number;
  /** 説明文を出すか。 */
  withLead?: boolean;
  headingLevel?: 3 | 4;
  onOpenArea: (areaCode: string) => void;
  onOpenRanking: (route: RankingRoute) => void;
};

/** 特集の抜粋（上位の数件）と、一覧への入口。 */
export function TopicCard({
  topic,
  rows,
  prefNames,
  manifest,
  limit,
  withLead = false,
  headingLevel = 3,
  onOpenArea,
  onOpenRanking
}: TopicCardProps) {
  const ranked = rankNational(rows, {
    metric: topic.metric,
    order: topic.order,
    populationBand: topic.size,
    filters: topic.filters
  });
  const route = topicRoute(topic);
  const Heading = headingLevel === 3 ? "h3" : "h4";
  const period = metricPeriod(topic.metric, manifest);
  const open = (event: MouseEvent) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onOpenRanking(route);
  };

  return (
    <section className="topic" aria-labelledby={`topic-${topic.id}`}>
      <Heading id={`topic-${topic.id}`}>
        <a href={hrefOf(route)} onClick={open}>
          {topic.title}
        </a>
      </Heading>
      <p className="topic__meta">
        {period && <span>{period}</span>}
        <span>該当 {formatNumber(ranked.length)}市区町村</span>
      </p>
      {withLead && <p className="topic__lead">{topic.lead}</p>}
      <ol>
        {ranked.slice(0, limit).map(({ row, value, rank }) => (
          <li key={row.code}>
            <span className="topic__rank">{rank}</span>
            <span className="topic__name">
              <button type="button" className="link-button" onClick={() => onOpenArea(row.code)}>
                {areaLocalName(row)}
              </button>
              <small>{prefNames.get(row.prefCode)}</small>
            </span>
            <span className="topic__value">{metricValueText(topic.metric, value)}</span>
          </li>
        ))}
      </ol>
      {ranked.length > limit && (
        <a className="text-link" href={hrefOf(route)} onClick={open}>
          {formatNumber(ranked.length)}件すべてを見る
        </a>
      )}
    </section>
  );
}

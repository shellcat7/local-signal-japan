import { TOPICS, type AreaIndex, type Manifest, type NationalFile } from "@local-signal-japan/core";
import type { RankingRoute } from "../lib/route";
import { TopicCard } from "./TopicCard";

type TopicsViewProps = {
  national: NationalFile;
  index: AreaIndex;
  manifest: Manifest;
  onOpenArea: (areaCode: string) => void;
  onOpenRanking: (route: RankingRoute) => void;
};

/** 特集の一覧。どれも「条件でさがす」と同じ計算で、条件を付けて並べたもの。 */
export function TopicsView({ national, index, manifest, onOpenArea, onOpenRanking }: TopicsViewProps) {
  const prefNames = new Map(index.prefectures.map((pref) => [pref.code, pref.name]));

  return (
    <div className="container topics">
      <div className="topics__grid">
        {TOPICS.map((topic) => (
          <TopicCard
            key={topic.id}
            topic={topic}
            rows={national.areas}
            prefNames={prefNames}
            manifest={manifest}
            limit={5}
            withLead
            onOpenArea={onOpenArea}
            onOpenRanking={onOpenRanking}
          />
        ))}
      </div>
      <ul className="notes">
        <li>
          どの特集も、政令指定都市の区を除く市区町村を対象に、「条件でさがす」と同じ計算で並べています。順位は値の大小の順で、良し悪しの順ではありません。
        </li>
      </ul>
    </div>
  );
}

import type { MouseEvent } from "react";
import type { AreaIndex } from "@local-signal-japan/core";
import { DEFAULT_RANKING, hrefOf, type RankingRoute } from "../lib/route";

/** 都道府県コードの範囲で分けた地方。 */
const REGIONS = [
  { name: "北海道・東北", from: 1, to: 7 },
  { name: "関東", from: 8, to: 14 },
  { name: "中部", from: 15, to: 23 },
  { name: "近畿", from: 24, to: 30 },
  { name: "中国", from: 31, to: 35 },
  { name: "四国", from: 36, to: 39 },
  { name: "九州・沖縄", from: 40, to: 47 }
];

type PrefectureIndexProps = {
  index: AreaIndex;
  onOpenRanking: (route: RankingRoute) => void;
};

/** 都道府県の索引。選ぶと、その都道府県の市区町村の一覧を開く。数字は収録している市区町村の数（政令指定都市の区を除く）。 */
export function PrefectureIndex({ index, onOpenRanking }: PrefectureIndexProps) {
  const counts = new Map<string, number>();
  for (const area of index.areas) {
    if (area.kind !== "ward") counts.set(area.prefCode, (counts.get(area.prefCode) ?? 0) + 1);
  }

  return (
    <dl className="pref-index">
      {REGIONS.map((region) => (
        <div key={region.name}>
          <dt>{region.name}</dt>
          <dd>
            {index.prefectures
              .filter((pref) => Number(pref.code) >= region.from && Number(pref.code) <= region.to)
              .map((pref) => {
                const route: RankingRoute = { ...DEFAULT_RANKING, prefCode: pref.code };
                return (
                  <a
                    key={pref.code}
                    href={hrefOf(route)}
                    onClick={(event: MouseEvent) => {
                      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
                        return;
                      event.preventDefault();
                      onOpenRanking(route);
                    }}
                  >
                    {pref.name}
                    <span aria-hidden="true">{counts.get(pref.code) ?? 0}</span>
                  </a>
                );
              })}
          </dd>
        </div>
      ))}
    </dl>
  );
}

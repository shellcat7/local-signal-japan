import type { MouseEvent } from "react";
import type { AreaIndex } from "@local-signal-japan/core";
import { DEFAULT_RANKING, hrefOf, type RankingRoute } from "../lib/route";

/**
 * 都道府県を、おおよその位置関係を保ったまま同じ大きさのます目に並べた地図。
 * 値は [列, 行]。左上が北西。面積や形は表さない。
 */
const TILES: Record<string, readonly [number, number]> = {
  "01": [14, 1],
  "02": [14, 2],
  "03": [14, 3],
  "04": [14, 4],
  "05": [13, 3],
  "06": [13, 4],
  "07": [13, 5],
  "08": [13, 7],
  "09": [13, 6],
  "10": [12, 6],
  "11": [12, 7],
  "12": [13, 8],
  "13": [12, 8],
  "14": [12, 9],
  "15": [12, 5],
  "16": [11, 5],
  "17": [10, 5],
  "18": [9, 6],
  "19": [11, 7],
  "20": [11, 6],
  "21": [10, 6],
  "22": [11, 8],
  "23": [10, 7],
  "24": [9, 8],
  "25": [9, 7],
  "26": [8, 7],
  "27": [7, 8],
  "28": [7, 7],
  "29": [8, 8],
  "30": [8, 9],
  "31": [6, 6],
  "32": [5, 6],
  "33": [6, 7],
  "34": [5, 7],
  "35": [4, 7],
  "36": [6, 9],
  "37": [6, 8],
  "38": [5, 8],
  "39": [5, 9],
  "40": [3, 7],
  "41": [2, 7],
  "42": [1, 7],
  "43": [2, 8],
  "44": [3, 8],
  "45": [3, 9],
  "46": [2, 9],
  "47": [1, 10]
};

/** ます目に入る短い名前（北海道はそのまま、ほかは「都・府・県」を取る）。 */
const shortName = (name: string) => (name === "北海道" ? name : name.replace(/[都府県]$/, ""));

type JapanMapProps = {
  index: AreaIndex;
  onOpenRanking: (route: RankingRoute) => void;
};

/** 都道府県の索引を、地図の形に並べたもの。選ぶと、その都道府県の市区町村の一覧を開く。 */
export function JapanMap({ index, onOpenRanking }: JapanMapProps) {
  const counts = new Map<string, number>();
  for (const area of index.areas) {
    if (area.kind !== "ward") counts.set(area.prefCode, (counts.get(area.prefCode) ?? 0) + 1);
  }

  return (
    <ul className="japan-map">
      {index.prefectures.map((pref) => {
        const [column, row] = TILES[pref.code] ?? [1, 1];
        const route: RankingRoute = { ...DEFAULT_RANKING, prefCode: pref.code };
        return (
          <li key={pref.code} style={{ gridColumn: column, gridRow: row }}>
            <a
              href={hrefOf(route)}
              onClick={(event: MouseEvent) => {
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                onOpenRanking(route);
              }}
            >
              {/* ます目には短い名前と数だけを出し、読み上げでは「富山県 15市区町村」と読ませる。 */}
              <span aria-hidden="true">{shortName(pref.name)}</span>
              <small aria-hidden="true">{counts.get(pref.code) ?? 0}</small>
              <span className="visually-hidden">
                {pref.name} {counts.get(pref.code) ?? 0}市区町村
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

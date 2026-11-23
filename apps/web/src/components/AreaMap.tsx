import { memo } from "react";
import type { MapData } from "../lib/data";
import { pathBounds } from "../lib/pathBounds";

/** 図鑑での塗り分け。got = 集めた、done = その都道府県を制覇した。 */
export type AreaState = "got" | "done" | "pref";

type AreaMapProps = {
  map: MapData;
  /** 市区町村ごとの塗り（図鑑）。省くと市区町村の形は描かず、都道府県だけを描く。 */
  states?: ReadonlyMap<string, AreaState>;
  /** 位置を示す市区町村（まちくじ）。小さな町でも見えるよう、まわりに丸を付ける。 */
  highlight?: string | null;
  label: string;
};

/** 日本地図。図鑑では集めた市区町村を塗り、まちくじでは引いた市区町村の位置を示す。 */
export const AreaMap = memo(function AreaMap({ map, states, highlight, label }: AreaMapProps) {
  const [vx, vy, vw, vh] = map.viewBox;
  const target = highlight ? map.areas.find((area) => area.code === highlight) : undefined;
  const bounds = target ? pathBounds(target.d) : null;
  return (
    <svg
      className={`area-map${states ? "" : " area-map--locator"}`}
      viewBox={`${vx} ${vy} ${vw} ${vh}`}
      role="img"
      aria-label={label}
    >
      {states && (
        <g className="area-map__areas">
          {map.areas.map((area) => (
            <path key={area.code} d={area.d} data-state={states.get(area.code)} />
          ))}
        </g>
      )}
      <g className="area-map__prefectures">
        {map.prefectures.map((pref) => (
          <path key={pref.code} d={pref.d} data-current={highlight?.startsWith(pref.code) ? "true" : undefined} />
        ))}
      </g>
      <g className="area-map__insets">
        {map.insets.map(({ label: insetLabel, box: [x, y, width, height] }) => (
          <rect key={insetLabel} x={x} y={y} width={width} height={height} rx={6} />
        ))}
      </g>
      {target && <path className="area-map__target" d={target.d} />}
      {bounds && (
        <circle
          className="area-map__ring"
          cx={bounds.x + bounds.width / 2}
          cy={bounds.y + bounds.height / 2}
          r={Math.max(48, Math.max(bounds.width, bounds.height) / 2 + 16)}
        />
      )}
    </svg>
  );
});

const IMAGE_COLORS = {
  got: "#f4a385",
  done: "#9fdcb5",
  pref: "#fde39c",
  none: "#ffffff",
  line: "#2b2724",
  rule: "#d8ccba"
};

/** 図鑑の地図を、保存する画像用の SVG の文字列にする（色を直接書き込む）。 */
export function zukanSvgString(map: MapData, states: ReadonlyMap<string, AreaState>): string {
  const [x, y, width, height] = map.viewBox;
  const areas = map.areas
    .map((area) => {
      const state = states.get(area.code);
      return `<path d="${area.d}" fill="${state ? IMAGE_COLORS[state] : IMAGE_COLORS.none}"/>`;
    })
    .join("");
  const prefectures = map.prefectures.map((pref) => `<path d="${pref.d}"/>`).join("");
  const insets = map.insets
    .map(({ box: [bx, by, bw, bh] }) => `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="6"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" width="${width * 2}" height="${height * 2}"><g stroke="${IMAGE_COLORS.rule}" stroke-width="0.3" stroke-linejoin="round">${areas}</g><g fill="none" stroke="${IMAGE_COLORS.line}" stroke-width="0.9" stroke-linejoin="round">${prefectures}</g><g fill="none" stroke="#8a7f74" stroke-width="1" stroke-dasharray="4 3">${insets}</g></svg>`;
}

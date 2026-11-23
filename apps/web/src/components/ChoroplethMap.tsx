import { memo, useMemo, useRef, useState, type PointerEvent } from "react";
import { formatNumber, type RankingMetric } from "@local-signal-japan/core";
import type { MapData } from "../lib/data";
import { binOf, colorOf, type MapBin } from "../lib/mapScale";
import { metricValueText } from "../lib/metrics";

/** 保存する画像（白地）での色。条件に合わない市区町村は白地に灰色の線、値のない市区町村は斜線。 */
const IMAGE_OUT_FILL = "#ffffff";
const IMAGE_OUT_STROKE = "#c4c8cd";
const IMAGE_MISSING = "url(#hatch)";

export type ChoroplethMapProps = {
  map: MapData;
  metric: RankingMetric;
  /** 市区町村コード → 値（値がなければ null）。条件に合う市区町村だけを入れる。 */
  values: ReadonlyMap<string, number | null>;
  /** 市区町村コード → 順位（条件で絞り込んだ中での順位）。 */
  ranks: ReadonlyMap<string, number | null>;
  names: ReadonlyMap<string, string>;
  bins: readonly MapBin[];
  label: string;
  onOpenArea: (areaCode: string) => void;
};

/** 各市区町村の、保存する画像での色。条件に合わない市区町村は含めない。 */
export function mapFills(
  map: MapData,
  values: ReadonlyMap<string, number | null>,
  bins: readonly MapBin[]
): Map<string, string> {
  const fills = new Map<string, string>();
  for (const area of map.areas) {
    if (!values.has(area.code)) continue;
    const value = values.get(area.code);
    fills.set(
      area.code,
      value === null || value === undefined ? IMAGE_MISSING : (colorOf(bins, value) ?? IMAGE_MISSING)
    );
  }
  return fills;
}

/** SVG の文字列にする（共有用の画像に使う。CSS に頼らず、色を直接書き込む）。 */
export function mapSvgString(map: MapData, fills: ReadonlyMap<string, string>): string {
  const [x, y, width, height] = map.viewBox;
  const inScope = map.areas
    .filter((area) => fills.has(area.code))
    .map((area) => `<path d="${area.d}" fill="${fills.get(area.code)}"/>`)
    .join("");
  const outOfScope = map.areas
    .filter((area) => !fills.has(area.code))
    .map((area) => `<path d="${area.d}"/>`)
    .join("");
  const prefectures = map.prefectures.map((pref) => `<path d="${pref.d}"/>`).join("");
  const insets = map.insets
    .map(({ box: [bx, by, bw, bh] }) => `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}"/>`)
    .join("");
  const hatch = `<defs><pattern id="hatch" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="3" fill="#ffffff"/><line x1="0" y1="0" x2="0" y2="3" stroke="#676d75" stroke-width="0.6"/></pattern></defs>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" width="${width * 2}" height="${height * 2}">${hatch}<g fill="${IMAGE_OUT_FILL}" stroke="${IMAGE_OUT_STROKE}" stroke-width="0.3" stroke-linejoin="round">${outOfScope}</g><g stroke="#ffffff" stroke-width="0.25" stroke-linejoin="round">${inScope}</g><g fill="none" stroke="#14171a" stroke-width="0.6" stroke-linejoin="round">${prefectures}</g><g fill="none" stroke="#8e949c" stroke-width="0.8">${insets}</g></svg>`;
}

type AreaLayerProps = {
  map: MapData;
  values: ReadonlyMap<string, number | null>;
  levels: ReadonlyMap<string, number>;
};

/** 市区町村の形の層。値が変わったときだけ描き直す（ポインターの移動では描き直さない）。 */
const AreaLayer = memo(function AreaLayer({ map, values, levels }: AreaLayerProps) {
  return (
    <>
      {map.areas.map((area) => {
        const inScope = values.has(area.code);
        const value = values.get(area.code);
        const level = levels.get(area.code);
        return (
          <path
            key={area.code}
            d={area.d}
            data-code={area.code}
            data-scope={inScope ? (value === null ? "missing" : "in") : "out"}
            fill={inScope && value === null ? "url(#map-hatch)" : undefined}
            style={level === undefined ? undefined : { fill: `var(--map-${level})` }}
          />
        );
      })}
    </>
  );
});

/**
 * 全国の市区町村の色分け地図。値は墨の濃淡で示し、良し悪しを連想させる色は使わない。
 * 地図は補助で、同じ値は表で確かめられる（表示の切り替えボタン）。
 */
export function ChoroplethMap({ map, metric, values, ranks, names, bins, label, onOpenArea }: ChoroplethMapProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ code: string; x: number; y: number } | null>(null);
  // 画面では、配色（ライト・ダーク）に合わせた濃淡を CSS の変数で付ける。
  const levels = useMemo(() => {
    const result = new Map<string, number>();
    for (const [code, value] of values) {
      const bin = value === null ? undefined : binOf(bins, value);
      if (bin) result.set(code, bin.level);
    }
    return result;
  }, [values, bins]);
  const paths = useMemo(() => new Map(map.areas.map((area) => [area.code, area.d])), [map]);
  const [vx, vy, vw, vh] = map.viewBox;

  const handleMove = (event: PointerEvent<SVGGElement>) => {
    const code = (event.target as SVGElement).getAttribute("data-code");
    const bounds = wrapperRef.current?.getBoundingClientRect();
    if (!code || !bounds) {
      setHover(null);
      return;
    }
    setHover({ code, x: event.clientX - bounds.left, y: event.clientY - bounds.top });
  };

  const hoverValue = hover ? values.get(hover.code) : undefined;
  const hoverRank = hover ? ranks.get(hover.code) : undefined;
  const hoverPath = hover ? paths.get(hover.code) : undefined;

  return (
    <div className="map" ref={wrapperRef}>
      <svg viewBox={`${vx} ${vy} ${vw} ${vh}`} role="img" aria-label={label}>
        <defs>
          <pattern id="map-hatch" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="3" className="map__hatch" />
          </pattern>
        </defs>
        <g
          className="map__areas"
          onPointerMove={handleMove}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") setHover(null);
          }}
          onClick={(event) => {
            const code = (event.target as SVGElement).getAttribute("data-code");
            if (code) onOpenArea(code);
          }}
        >
          <AreaLayer map={map} values={values} levels={levels} />
        </g>
        <g className="map__prefectures" aria-hidden="true">
          {map.prefectures.map((pref) => (
            <path key={pref.code} d={pref.d} />
          ))}
        </g>
        <g className="map__insets" aria-hidden="true">
          {map.insets.map(({ label: insetLabel, box: [x, y, width, height] }) => (
            <rect key={insetLabel} x={x} y={y} width={width} height={height} />
          ))}
        </g>
        {/* 指している市区町村は、上に重ねた線で示す（全体を描き直さない）。 */}
        {hoverPath && <path className="map__hover" d={hoverPath} aria-hidden="true" />}
      </svg>

      {hover && (
        <div className="map__tooltip" style={{ left: hover.x, top: hover.y }} aria-hidden="true">
          <strong>{names.get(hover.code) ?? hover.code}</strong>
          <span>
            {hoverValue === undefined
              ? "条件に合いません"
              : hoverValue === null
                ? "値なし"
                : metricValueText(metric, hoverValue)}
            {hoverRank ? `（${formatNumber(hoverRank)}位）` : ""}
          </span>
        </div>
      )}

      <ul className="map__legend" aria-label="凡例">
        {bins.map((bin) => (
          <li key={`${bin.min}-${bin.max}`}>
            <span className="map__swatch" style={{ background: `var(--map-${bin.level})` }} />
            {bin.min === bin.max
              ? metricValueText(metric, bin.min)
              : `${metricValueText(metric, bin.min)} 〜 ${metricValueText(metric, bin.max)}`}
          </li>
        ))}
        <li>
          <span className="map__swatch map__swatch--missing" />
          値なし
        </li>
        <li>
          <span className="map__swatch map__swatch--out" />
          条件に合わない
        </li>
      </ul>
    </div>
  );
}

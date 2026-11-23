import { pathBounds } from "./pathBounds";

/**
 * まちの位置を示す地図（SVG の文字列）。共有用の画像（画面で保存する札、X のリンクカード）に描き込む。
 * - region: そのまちの都道府県を大きく描き、まちを塗って丸で囲む
 * - japan: 日本全体を小さく描き、その都道府県を塗る
 */

export type LocatorMap = {
  viewBox: readonly [number, number, number, number] | number[];
  areas: ReadonlyArray<{ code: string; d: string }>;
  prefectures: ReadonlyArray<{ code: string; d: string }>;
  insets: ReadonlyArray<{ label: string; box: readonly number[] }>;
};

type Box = { x: number; y: number; width: number; height: number };

const COLORS = {
  land: "#fcfcfa",
  other: "#efeee9",
  line: "#8f9296",
  prefFill: "#f5dbe1",
  prefLine: "#2e3033",
  areaLine: "#e0a3b2",
  town: "#9a4a5e",
  ring: "#c0442b",
  inset: "#a3a6aa"
};

const boundsCache = new WeakMap<object, Map<string, Box | null>>();

function boundsOf(map: LocatorMap, key: string, d: string): Box | null {
  let cache = boundsCache.get(map);
  if (!cache) {
    cache = new Map();
    boundsCache.set(map, cache);
  }
  if (!cache.has(key)) cache.set(key, pathBounds(d));
  return cache.get(key) ?? null;
}

const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** 都道府県を収める切り取り範囲。離島の多い都道府県（東京都など）は、まちのまわりに寄せる。 */
export function regionCrop(map: LocatorMap, code: string, aspect: number): Box | null {
  const town = map.areas.find((area) => area.code === code);
  const pref = map.prefectures.find((item) => item.code === code.slice(0, 2));
  if (!town || !pref) return null;
  const townBox = boundsOf(map, `a${town.code}`, town.d);
  const prefBox = boundsOf(map, `p${pref.code}`, pref.d);
  if (!townBox || !prefBox) return null;

  // 離島が遠くまで広がる都道府県（東京都・鹿児島県・沖縄県など）は、県全体ではなく、まちのまわりを描く。
  const islands = Math.max(prefBox.width, prefBox.height) > 400;
  const base = islands ? townBox : prefBox;
  const width = Math.max(islands ? 180 : 70, Math.max(base.width, base.height * aspect) * 1.22);
  const height = width / aspect;
  const centerX = base.x + base.width / 2;
  const centerY = base.y + base.height / 2;
  let x = centerX - width / 2;
  let y = centerY - height / 2;
  // まちを囲む丸（regionSvg の ring）まで収まるよう、はみ出すときはずらす。
  const margin = Math.max(townBox.width, townBox.height) / 2 + (width / 100) * 5;
  const left = townBox.x - margin;
  const right = townBox.x + townBox.width + margin;
  const top = townBox.y - margin;
  const bottom = townBox.y + townBox.height + margin;
  if (left < x) x = left;
  if (right > x + width) x = right - width;
  if (top < y) y = top;
  if (bottom > y + height) y = bottom - height;
  return { x, y, width, height };
}

function ring(map: LocatorMap, code: string, minRadius: number, strokeWidth: number): string {
  const town = map.areas.find((area) => area.code === code);
  const box = town ? boundsOf(map, `a${town.code}`, town.d) : null;
  if (!box) return "";
  const radius = Math.max(minRadius, Math.max(box.width, box.height) / 2 + minRadius * 0.4);
  return `<circle cx="${box.x + box.width / 2}" cy="${box.y + box.height / 2}" r="${radius}" fill="none" stroke="${COLORS.ring}" stroke-width="${strokeWidth}"/>`;
}

/** 都道府県を大きく描いた地図。width・height は描く大きさ（px）。 */
export function regionSvg(map: LocatorMap, code: string, width: number, height: number): string | null {
  const crop = regionCrop(map, code, width / height);
  if (!crop) return null;
  const scale = crop.width / width;
  const prefCode = code.slice(0, 2);
  const visible = (key: string, d: string) => {
    const box = boundsOf(map, key, d);
    return box !== null && intersects(box, crop);
  };
  const others = map.prefectures
    .filter((pref) => pref.code !== prefCode && visible(`p${pref.code}`, pref.d))
    .map((pref) => `<path d="${pref.d}"/>`)
    .join("");
  const areas = map.areas
    .filter((area) => area.code.startsWith(prefCode) && visible(`a${area.code}`, area.d))
    .map((area) => `<path d="${area.d}"${area.code === code ? ` fill="${COLORS.town}"` : ""}/>`)
    .join("");
  const pref = map.prefectures.find((item) => item.code === prefCode);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${crop.x} ${crop.y} ${crop.width} ${crop.height}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"><g fill="${COLORS.other}" stroke="${COLORS.line}" stroke-width="${1.2 * scale}" stroke-linejoin="round">${others}</g><g fill="${COLORS.prefFill}" stroke="${COLORS.areaLine}" stroke-width="${0.9 * scale}" stroke-linejoin="round">${areas}</g>${
    pref
      ? `<path d="${pref.d}" fill="none" stroke="${COLORS.prefLine}" stroke-width="${2 * scale}" stroke-linejoin="round"/>`
      : ""
  }${ring(map, code, 9 * scale, 3 * scale)}</svg>`;
}

/** 日本全体を小さく描き、その都道府県を塗った地図。 */
export function japanSvg(map: LocatorMap, code: string, width: number, height: number): string {
  const [x, y, w, h] = map.viewBox as [number, number, number, number];
  const scale = Math.max(w / width, h / height);
  const prefCode = code.slice(0, 2);
  const prefectures = map.prefectures
    .map((pref) => `<path d="${pref.d}"${pref.code === prefCode ? ` fill="${COLORS.areaLine}"` : ""}/>`)
    .join("");
  const insets = map.insets
    .map(({ box: [bx, by, bw, bh] }) => `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="6"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"><g fill="${COLORS.land}" stroke="${COLORS.line}" stroke-width="${0.9 * scale}" stroke-linejoin="round">${prefectures}</g><g fill="none" stroke="${COLORS.inset}" stroke-width="${0.8 * scale}" stroke-dasharray="${4 * scale} ${3 * scale}">${insets}</g>${ring(map, code, 7 * scale, 2.5 * scale)}</svg>`;
}

/** SVG の文字列を、画像として読み込める data: URL にする。 */
export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

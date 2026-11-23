import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

/**
 * 同梱している地図データ(apps/web/public/data/map.json)の検査。
 * scripts/build-map.mjs で作り直したときに、市区町村一覧(areas.json)との食い違いや
 * 壊れたパスが紛れ込んでいないかをここで止める。
 */

interface MapJson {
  version: number;
  source: Record<string, unknown>;
  viewBox: number[];
  areas: { code: string; d: string }[];
  prefectures: { code: string; d: string }[];
  insets: { label: string; box: number[] }[];
}

interface AreasJson {
  prefectures: { code: string; name: string }[];
  areas: { code: string; kind: string }[];
}

const DATA_DIR = new URL("../../../apps/web/public/data/", import.meta.url);

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(new URL(file, DATA_DIR), "utf8")) as T;
}

/** M/m/l/z と数値だけからなる閉じたパス(build-map.mjs が出力する形) */
const PATH_PATTERN = /^M[-\d. ]+(?:l[-\d. ]+)?z(?:m[-\d. ]+(?:l[-\d. ]+)?z)*$/;

/** パスを絶対座標の点列にする(M・m・l・z だけに対応) */
function pathPoints(d: string): [number, number][] {
  const tokens = d.match(/[MmLlZz]|-?(?:\d+\.?\d*|\.\d+)/g) ?? [];
  const points: [number, number][] = [];
  let command = "";
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  for (let i = 0; i < tokens.length;) {
    const token = tokens[i] ?? "";
    if (/^[A-Za-z]$/.test(token)) {
      command = token;
      if (token === "z" || token === "Z") [x, y] = [startX, startY];
      i++;
      continue;
    }
    const a = Number(token);
    const b = Number(tokens[i + 1]);
    i += 2;
    if (command === "M" || command === "L") [x, y] = [a, b];
    else [x, y] = [x + a, y + b];
    if (command === "M" || command === "m") {
      [startX, startY] = [x, y];
      command = command === "M" ? "L" : "l";
    }
    points.push([x, y]);
  }
  return points;
}

describe("地図データ(map.json)", async () => {
  const map = await readJson<MapJson>("map.json");
  const areasJson = await readJson<AreasJson>("areas.json");
  const reference = areasJson.areas
    .filter((area) => area.kind !== "ward")
    .map((area) => area.code)
    .sort();
  const [minX = NaN, minY = NaN, width = NaN, height = NaN] = map.viewBox;

  it("出典とライセンスを記録している", () => {
    expect(map.version).toBe(1);
    for (const key of ["name", "edition", "publisher", "url", "license", "licenseUrl", "attribution"]) {
      expect(map.source[key], key).toEqual(expect.any(String));
      expect(String(map.source[key]).length, key).toBeGreaterThan(0);
    }
    expect(map.source.license).toBe("CC BY 4.0");
    expect(map.source.attribution).toContain("国土数値情報");
  });

  it("行政区を除く市区町村ごとに1つずつ形がある", () => {
    expect(map.areas).toHaveLength(reference.length);
    expect(map.areas.map((area) => area.code)).toEqual(reference);
  });

  it("都道府県の外形が47件ある", () => {
    expect(map.prefectures.map((pref) => pref.code)).toEqual(areasJson.prefectures.map((pref) => pref.code));
  });

  it("viewBox が妥当な大きさである", () => {
    expect(map.viewBox).toHaveLength(4);
    expect([minX, minY]).toEqual([0, 0]);
    expect(width).toBeGreaterThanOrEqual(900);
    expect(width).toBeLessThanOrEqual(1100);
    expect(height).toBeGreaterThan(width * 0.8);
    expect(height).toBeLessThan(width * 1.5);
  });

  it("すべてのパスが空でなく、SVG のパスとして読める", () => {
    for (const item of [...map.areas, ...map.prefectures]) {
      expect(item.d.length, item.code).toBeGreaterThan(0);
      expect(PATH_PATTERN.test(item.d), item.code).toBe(true);
      expect(pathPoints(item.d).length, item.code).toBeGreaterThanOrEqual(3);
    }
  });

  it("すべての座標が viewBox の内側にある", () => {
    const outside: string[] = [];
    for (const item of [...map.areas, ...map.prefectures]) {
      for (const [x, y] of pathPoints(item.d)) {
        if (x < minX || y < minY || x > minX + width || y > minY + height) {
          outside.push(`${item.code}: ${x},${y}`);
          break;
        }
      }
    }
    expect(outside).toEqual([]);
  });

  it("インセットの枠が viewBox の内側にあり、互いに重ならない", () => {
    expect(map.insets.map((inset) => inset.label)).toContain("沖縄県");
    for (const [i, inset] of map.insets.entries()) {
      const [x = NaN, y = NaN, w = NaN, h = NaN] = inset.box;
      expect(inset.box, inset.label).toHaveLength(4);
      expect(w > 0 && h > 0, inset.label).toBe(true);
      expect(x >= minX && y >= minY && x + w <= minX + width && y + h <= minY + height, inset.label).toBe(true);
      for (const other of map.insets.slice(i + 1)) {
        const [ox = NaN, oy = NaN, ow = NaN, oh = NaN] = other.box;
        expect(x < ox + ow && ox < x + w && y < oy + oh && oy < y + h, `${inset.label} / ${other.label}`).toBe(false);
      }
    }
  });

  it("沖縄県の市町村はインセットの枠の中に描かれている", () => {
    const boxes = map.insets.map((inset) => inset.box);
    const inAnyBox = ([px, py]: [number, number]) =>
      boxes.some(([x = NaN, y = NaN, w = NaN, h = NaN]) => px >= x && px <= x + w && py >= y && py <= y + h);
    for (const area of map.areas.filter((item) => item.code.startsWith("47"))) {
      expect(pathPoints(area.d).every(inAnyBox), area.code).toBe(true);
    }
  });
});

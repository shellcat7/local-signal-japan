import { describe, expect, it } from "vitest";
import { japanSvg, regionCrop, regionSvg, type LocatorMap } from "./locator";

/** 架空の地図。都道府県 01 は 100×100 の正方形で、まち 01101 は右上の角、01102 は左下。都道府県 13 は離島で縦に長い。 */
const map: LocatorMap = {
  viewBox: [0, 0, 1000, 1000],
  prefectures: [
    { code: "01", d: "M100 100h100v100h-100z" },
    { code: "13", d: "M500 100h20v600h-20z" }
  ],
  areas: [
    { code: "01101", d: "M190 100h10v10h-10z" },
    { code: "01102", d: "M100 190h10v10h-10z" },
    { code: "13101", d: "M500 680h20v20h-20z" }
  ],
  insets: [{ label: "見本", box: [800, 800, 100, 100] }]
};

const inside = (crop: { x: number; y: number; width: number; height: number }, x: number, y: number) =>
  x >= crop.x && x <= crop.x + crop.width && y >= crop.y && y <= crop.y + crop.height;

describe("regionCrop", () => {
  it("都道府県全体と、まちを囲む丸が入る範囲を、描く大きさと同じ縦横比で返す", () => {
    const crop = regionCrop(map, "01101", 2);
    expect(crop).not.toBeNull();
    if (!crop) return;
    expect(crop.width / crop.height).toBeCloseTo(2);
    expect(inside(crop, 100, 100) && inside(crop, 200, 200)).toBe(true);
    expect(inside(crop, 195 + 12, 105 - 12)).toBe(true);
  });

  it("離島が遠くまで広がる都道府県は、まちのまわりを描く", () => {
    const crop = regionCrop(map, "13101", 2);
    expect(crop && crop.height).toBeLessThan(600);
    expect(crop && inside(crop, 510, 690)).toBe(true);
  });

  it("地図にないまちは null", () => {
    expect(regionCrop(map, "99999", 2)).toBeNull();
  });
});

describe("regionSvg / japanSvg", () => {
  it("まちを塗り、丸で囲んだ SVG を返す", () => {
    const svg = regionSvg(map, "01102", 300, 150) ?? "";
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg).toContain('width="300" height="150"');
    expect(svg).toContain("<circle");
    expect(japanSvg(map, "01102", 120, 150)).toContain("<rect");
  });
});

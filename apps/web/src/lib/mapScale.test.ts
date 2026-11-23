import { describe, expect, it } from "vitest";
import { colorOf, MAP_RAMP, quantileBins } from "./mapScale";

describe("quantileBins", () => {
  it("件数がほぼ同じになるように分け、濃淡を薄い順に割り当てる", () => {
    const values = Array.from({ length: 70 }, (_, index) => index);
    const bins = quantileBins(values);
    expect(bins).toHaveLength(7);
    expect(bins[0]).toEqual({ min: 0, max: 9, level: 0, color: MAP_RAMP[0] });
    expect(bins.at(-1)).toEqual({ min: 60, max: 69, level: 6, color: MAP_RAMP.at(-1) });
  });

  it("同じ値が多くても、1つの段階にまとめすぎない", () => {
    // 小数1桁の割合のように、同じ値が多い分布。
    const values = [
      ...Array.from({ length: 500 }, () => 0.5),
      ...Array.from({ length: 1000 }, (_, i) => 0.6 + Math.floor(i / 50) / 10)
    ];
    const bins = quantileBins(values);
    expect(bins.length).toBeGreaterThanOrEqual(5);
    expect(bins[0]).toMatchObject({ min: 0.5, max: 0.5 });
    // 段階は重ならず、小さい順に並ぶ。
    for (let index = 1; index < bins.length; index += 1) {
      expect((bins[index] as { min: number }).min).toBeGreaterThan((bins[index - 1] as { max: number }).max);
    }
  });

  it("値がすべて同じなら、1段階で最も濃い色にする", () => {
    expect(quantileBins([3, 3, 3])).toEqual([{ min: 3, max: 3, level: 6, color: MAP_RAMP.at(-1) }]);
    expect(quantileBins([])).toEqual([]);
  });

  it("値の入る段階の色を返す", () => {
    const bins = quantileBins(Array.from({ length: 70 }, (_, index) => index));
    expect(colorOf(bins, 0)).toBe(MAP_RAMP[0]);
    expect(colorOf(bins, 9.5)).toBe(bins[1]?.color);
    expect(colorOf(bins, 1000)).toBe(MAP_RAMP.at(-1));
  });
});

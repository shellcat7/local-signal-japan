import { describe, expect, it } from "vitest";
import { niceAxis, niceStep, pickStride } from "./scale";

describe("niceStep", () => {
  it("1・2・5 の倍数の刻み幅を選ぶ", () => {
    expect(niceStep(100, 4)).toBe(50);
    expect(niceStep(7, 4)).toBe(2);
    expect(niceStep(0.9, 4)).toBe(0.5);
    expect(niceStep(16000, 4)).toBe(5000);
  });
});

describe("niceAxis", () => {
  it("値の範囲を切りのよい目盛りに広げる", () => {
    expect(niceAxis([52748, 68835])).toEqual({
      min: 50000,
      max: 70000,
      ticks: [50000, 55000, 60000, 65000, 70000],
      step: 5000
    });
  });

  it("正負をまたぐ場合は 0 を目盛りに含める", () => {
    expect(niceAxis([-365, 1896]).ticks).toContain(0);
  });

  it("小数の刻みでも誤差のない目盛りを返す", () => {
    expect(niceAxis([0.31, 0.36]).ticks).toEqual([0.3, 0.32, 0.34, 0.36]);
  });

  it("値が1種類だけでも範囲をつくる", () => {
    const axis = niceAxis([5]);
    expect(axis.min).toBeLessThan(5);
    expect(axis.max).toBeGreaterThan(5);
  });
});

describe("pickStride", () => {
  it("末尾を残して一定の間隔で間引く", () => {
    expect(pickStride([2018, 2019, 2020, 2021, 2022, 2023, 2024], 6)).toEqual([2018, 2020, 2022, 2024]);
    expect(pickStride([2013, 2014, 2015, 2016, 2017, 2018, 2019], 3)).toEqual([2013, 2016, 2019]);
    expect(pickStride([2014, 2015, 2016, 2017, 2018, 2019], 3)).toEqual([2015, 2017, 2019]);
  });

  it("収まる数ならそのまま返す", () => {
    expect(pickStride([2020, 2025], 4)).toEqual([2020, 2025]);
  });
});

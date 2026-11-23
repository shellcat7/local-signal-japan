import { describe, expect, it } from "vitest";
import { axisTickFormatter, niceAxis, niceStep, pickStride } from "./scale";

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

describe("axisTickFormatter", () => {
  const labels = (values: number[]) => {
    const axis = niceAxis(values);
    return axis.ticks.map(axisTickFormatter(axis));
  };

  it("刻みが千以上の大きな軸は万の単位で書く", () => {
    // 1本の軸では小数の桁もそろえる。
    expect(labels([52748, 68835])).toEqual(["5.0万", "5.5万", "6.0万", "6.5万", "7.0万"]);
    expect(labels([3600000, 3753398])).toEqual(["360万", "365万", "370万", "375万", "380万"]);
  });

  it("刻みが細かい軸は桁区切りの数字で書き、同じ表記を並べない", () => {
    // 万の単位に丸めると「6.9万」「6.9万」「7万」「7万」になってしまう範囲
    const result = labels([68600, 70400]);
    expect(result).toEqual(["68,500", "69,000", "69,500", "70,000", "70,500"]);
    expect(new Set(result).size).toBe(result.length);
  });

  it("1万をまたぐ軸でも書式をそろえる", () => {
    expect(labels([9650, 10150])).toEqual(["9,600", "9,800", "10,000", "10,200"]);
  });

  it("小数の軸は刻みに合わせた桁で書く", () => {
    expect(labels([0.31, 0.36])).toEqual(["0.30", "0.32", "0.34", "0.36"]);
    expect(labels([16.2, 20.2])).toEqual(["16", "17", "18", "19", "20", "21"]);
    expect(labels([-365, 1896])).toEqual(["−1,000", "0", "1,000", "2,000"]);
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

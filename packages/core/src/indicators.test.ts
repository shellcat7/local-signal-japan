import { describe, expect, it } from "vitest";
import { computeDirection, computeMetric, INDICATORS, type AreaSeries } from "./indicators";
import { INDICATOR_KEYS } from "./model";
import { fixtureYears, makeArea } from "./testing/fixtures";
import { areaSeries } from "./view";

const series = (): AreaSeries => areaSeries(makeArea());

describe("INDICATORS", () => {
  it("グラフ用の系列が保持系列に含まれている", () => {
    for (const key of INDICATOR_KEYS) {
      const definition = INDICATORS[key];
      expect(definition.series.map((stored) => stored.key)).toContain(definition.chartSeriesKey);
    }
  });

  it("上流系列の id が全体で重複しない", () => {
    const ids = INDICATOR_KEYS.flatMap((key) => INDICATORS[key].upstream.map((upstream) => upstream.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("computeMetric", () => {
  it("人口: 5年前からの増減率", () => {
    expect(computeMetric("population", series(), 2025)).toEqual({ value: 5 });
  });

  it("人口: 5年前の値がなければ履歴不足", () => {
    const input = series();
    input.population.residents = [[2025, 105000]];
    expect(computeMetric("population", input, 2025)).toEqual({ value: null, missing: "insufficient-history" });
  });

  it("人口: 基準年の値がなければ未公表", () => {
    expect(computeMetric("population", series(), 2026)).toEqual({ value: null, missing: "not-published" });
  });

  it("転入・転出: 3年間の転入超過率の平均", () => {
    // 510/102000, 515/103000, 520/104000 はいずれも 0.5%
    expect(computeMetric("migration", series(), 2024)).toEqual({ value: 0.5 });
  });

  it("転入・転出: 3年分そろわなければ履歴不足", () => {
    const input = series();
    input.migration.inflow = [[2024, 5020]];
    expect(computeMetric("migration", input, 2024)).toEqual({ value: null, missing: "insufficient-history" });
  });

  it("事業所: 人口千人当たりの密度", () => {
    // 4000 / 101000 * 1000 = 39.6
    expect(computeMetric("business", series(), 2021)).toEqual({ value: 39.6 });
  });

  it("そのまま使う指標は基準年の値を返す", () => {
    expect(computeMetric("aging", series(), 2025)).toEqual({ value: 30 });
    expect(computeMetric("employment", series(), 2020)).toEqual({ value: 4.5 });
    expect(computeMetric("income", series(), 2024)).toEqual({ value: 350 });
    expect(computeMetric("fiscal", series(), 2022)).toEqual({ value: 0.8 });
  });

  it("系列が空なら未公表", () => {
    const input = series();
    input.fiscal.index = [];
    expect(computeMetric("fiscal", input, 2022)).toEqual({ value: null, missing: "not-published" });
  });
});

describe("computeDirection", () => {
  it("しきい値を超えた変化だけを動きとして扱う", () => {
    const input = series();
    expect(computeDirection("population", input, fixtureYears.population)).toBe("up");
    expect(computeDirection("aging", input, fixtureYears.aging)).toBe("up");
    expect(computeDirection("migration", input, fixtureYears.migration)).toBe("up");
    expect(computeDirection("employment", input, fixtureYears.employment)).toBe("up");
    expect(computeDirection("income", input, fixtureYears.income)).toBe("up");
    expect(computeDirection("fiscal", input, fixtureYears.fiscal)).toBe("up");
  });

  it("小さな変化は横ばい、逆向きは down", () => {
    const input = series();
    input.aging.ratio = [
      [2020, 30.2],
      [2025, 30]
    ];
    input.fiscal.index = [
      [2017, 0.9],
      [2022, 0.8]
    ];
    expect(computeDirection("aging", input, 2025)).toBe("flat");
    expect(computeDirection("fiscal", input, 2022)).toBe("down");
  });

  it("しきい値ちょうどの変化は、浮動小数の誤差があっても横ばいにする", () => {
    const input = series();
    // 0.54 − 0.52 は 0.020000000000000018 になる。±0.02「を超える」には当たらない。
    input.fiscal.index = [
      [2017, 0.52],
      [2022, 0.54]
    ];
    // 2.9 − 2.6 は 0.2999999999999998 になる。
    input.employment.unemployment = [
      [2015, 2.6],
      [2020, 2.9]
    ];
    // 101,049 ÷ 100,000 は +1.049%。表示は +1.0% なので、±1%「を超える」には当たらない。
    input.population.residents = [
      [2020, 100000],
      [2025, 101049]
    ];
    expect(computeDirection("fiscal", input, 2022)).toBe("flat");
    expect(computeDirection("employment", input, 2020)).toBe("flat");
    expect(computeDirection("population", input, 2025)).toBe("flat");

    input.fiscal.index = [
      [2017, 0.52],
      [2022, 0.55]
    ];
    expect(computeDirection("fiscal", input, 2022)).toBe("up");
  });

  it("事業所は調査方法の変更があるため判定しない", () => {
    expect(computeDirection("business", series(), 2021)).toBe("unknown");
  });

  it("比較する過去の値がなければ判定しない", () => {
    const input = series();
    input.income.perTaxpayer = [[2024, 350]];
    expect(computeDirection("income", input, 2024)).toBe("unknown");
  });
});

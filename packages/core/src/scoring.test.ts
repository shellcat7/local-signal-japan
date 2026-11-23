import { describe, expect, it } from "vitest";
import {
  confidence,
  coverage,
  overallScore,
  percentileOf,
  positionFromScore,
  scoreBand,
  scoreFromPercentile,
  summarizeDistribution
} from "./scoring";
import { makeArea, withMissing } from "./testing/fixtures";

describe("percentileOf", () => {
  const reference = [10, 20, 20, 30, 40];

  it("基準集団に含まれる値は中間順位で数える", () => {
    expect(percentileOf(reference, 10)).toBe(10);
    expect(percentileOf(reference, 20)).toBe(40);
    expect(percentileOf(reference, 40)).toBe(90);
  });

  it("基準集団に含まれない値も同じ式で位置づける", () => {
    expect(percentileOf(reference, 5)).toBe(0);
    expect(percentileOf(reference, 25)).toBe(60);
    expect(percentileOf(reference, 99)).toBe(100);
  });

  it("基準集団が空なら例外にする", () => {
    expect(() => percentileOf([], 1)).toThrow();
  });
});

describe("scoreFromPercentile", () => {
  it("値が大きいほど高くなる指標はパーセンタイルをそのまま使う", () => {
    expect(scoreFromPercentile(72.4, "population")).toBe(72);
  });

  it("値が小さいほど高くなる指標は反転する", () => {
    expect(scoreFromPercentile(72.4, "aging")).toBe(28);
    expect(scoreFromPercentile(10, "employment")).toBe(90);
  });

  it("positionFromScore で値の大小の位置に戻せる", () => {
    expect(positionFromScore(72, "population")).toBe(72);
    expect(positionFromScore(28, "aging")).toBe(72);
  });
});

describe("scoreBand", () => {
  it("全国を3等分した帯に分ける", () => {
    expect(scoreBand(null)).toBe("missing");
    expect(scoreBand(0)).toBe("lower");
    expect(scoreBand(33)).toBe("lower");
    expect(scoreBand(34)).toBe("middle");
    expect(scoreBand(66)).toBe("middle");
    expect(scoreBand(67)).toBe("upper");
    expect(scoreBand(100)).toBe("upper");
  });
});

describe("summarizeDistribution", () => {
  it("分位点を線形補間で求める", () => {
    expect(summarizeDistribution([1, 2, 3, 4, 5])).toEqual({
      count: 5,
      min: 1,
      p10: 1.4,
      p25: 2,
      p50: 3,
      p75: 4,
      p90: 4.6,
      max: 5
    });
  });
});

describe("overallScore", () => {
  it("利用できる指標の単純平均を返す", () => {
    // (90 + 50 + 80 + 40 + 20 + 60 + 85) / 7 = 60.7
    expect(overallScore(makeArea())).toBe(61);
  });

  it("欠損は低評価として扱わず、平均から除く", () => {
    // (90 + 50 + 80 + 40 + 20) / 5 = 56
    expect(overallScore(withMissing(makeArea(), ["income", "fiscal"]))).toBe(56);
  });

  it("利用できる指標が4つ未満なら算出しない", () => {
    const sparse = withMissing(makeArea(), ["migration", "business", "employment", "income"]);
    expect(coverage(sparse)).toEqual({ available: 3, total: 7 });
    expect(overallScore(sparse)).toBeNull();
  });
});

describe("confidence", () => {
  it("全指標がそろい人口1万人以上なら高", () => {
    expect(confidence(makeArea()).level).toBe("high");
  });

  it("欠損があるか人口1万人未満なら中", () => {
    expect(confidence(withMissing(makeArea(), ["fiscal"])).level).toBe("medium");
    expect(confidence(makeArea({ population: 7000 })).level).toBe("medium");
  });

  it("人口5千人未満または指標が5つ未満なら低", () => {
    expect(confidence(makeArea({ population: 1200 })).level).toBe("low");
    expect(confidence(withMissing(makeArea(), ["income", "fiscal", "business"])).level).toBe("low");
  });

  it("人口の値がなければ低とし、人口が少ないとは書かない", () => {
    expect(confidence(makeArea({ population: null }))).toEqual({
      level: "low",
      reason: "人口の値がなく、規模を確認できません。"
    });
  });

  it("理由を文章で返す", () => {
    expect(confidence(withMissing(makeArea(), ["fiscal"])).reason).toBe("7指標中6指標のみ利用できます。");
  });
});

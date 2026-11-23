import { describe, expect, it } from "vitest";
import { INDICATOR_KEYS } from "./model";
import { areaIndexSchema, areaIndicatorSchema, areaRecordSchema, manifestSchema, nationalFileSchema } from "./schema";
import { fixtureIndex, makeArea, makeManifest } from "./testing/fixtures";

describe("データセットのスキーマ", () => {
  it("テスト用の架空データが形式に合っている", () => {
    expect(() => manifestSchema.parse(makeManifest())).not.toThrow();
    expect(() => areaRecordSchema.parse(makeArea())).not.toThrow();
    expect(() => areaIndexSchema.parse(fixtureIndex)).not.toThrow();
  });

  it("指標値とスコアは両方そろうか、両方欠損でなければならない", () => {
    expect(areaIndicatorSchema.safeParse({ value: 1, score: null, rank: null, series: {} }).success).toBe(false);
    expect(
      areaIndicatorSchema.safeParse({ value: null, score: 50, rank: null, series: {}, missing: "not-published" })
        .success
    ).toBe(false);
  });

  it("欠損には理由が必要で、値があるときは理由を書けない", () => {
    expect(areaIndicatorSchema.safeParse({ value: null, score: null, rank: null, series: {} }).success).toBe(false);
    expect(
      areaIndicatorSchema.safeParse({ value: 1, score: 50, rank: null, series: {}, missing: "not-published" }).success
    ).toBe(false);
    expect(
      areaIndicatorSchema.safeParse({ value: null, score: null, rank: null, series: {}, missing: "not-published" })
        .success
    ).toBe(true);
  });

  it("順位は正の整数で、指標値がないときは持てない", () => {
    expect(areaIndicatorSchema.safeParse({ value: 1, score: 50, rank: 12, series: {} }).success).toBe(true);
    expect(areaIndicatorSchema.safeParse({ value: 1, score: 50, rank: 0, series: {} }).success).toBe(false);
    expect(
      areaIndicatorSchema.safeParse({ value: null, score: null, rank: 3, series: {}, missing: "not-published" }).success
    ).toBe(false);
  });

  it("全国一覧は、指標定義と同じ並びでなければ受け付けない", () => {
    const row = {
      code: "13101",
      name: "千代田区",
      prefCode: "13",
      kind: "special-ward",
      population: 68835,
      values: [4.4, 16.2, -0.14, 535.4, 1.9, 1175.5, null],
      scores: [99, 100, 63, 100, 95, 100, null]
    };
    expect(nationalFileSchema.safeParse({ indicatorKeys: [...INDICATOR_KEYS], areas: [row] }).success).toBe(true);
    expect(nationalFileSchema.safeParse({ indicatorKeys: [...INDICATOR_KEYS].reverse(), areas: [row] }).success).toBe(
      false
    );
    expect(
      nationalFileSchema.safeParse({ indicatorKeys: [...INDICATOR_KEYS], areas: [{ ...row, values: [1, 2] }] }).success
    ).toBe(false);
  });

  it("スコアは0〜100の整数に限る", () => {
    expect(areaIndicatorSchema.safeParse({ value: 1, score: 101, rank: null, series: {} }).success).toBe(false);
    expect(areaIndicatorSchema.safeParse({ value: 1, score: 50.5, rank: null, series: {} }).success).toBe(false);
  });

  it("市区町村コードは5桁の数字に限る", () => {
    expect(areaRecordSchema.safeParse(makeArea({ code: "1310" })).success).toBe(false);
    expect(areaRecordSchema.safeParse(makeArea({ prefCode: "48" })).success).toBe(false);
  });
});

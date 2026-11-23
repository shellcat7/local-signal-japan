import { describe, expect, it } from "vitest";
import { areaIndexSchema, areaIndicatorSchema, areaRecordSchema, manifestSchema } from "./schema";
import { fixtureIndex, makeArea, makeManifest } from "./testing/fixtures";

describe("データセットのスキーマ", () => {
  it("テスト用の架空データが形式に合っている", () => {
    expect(() => manifestSchema.parse(makeManifest())).not.toThrow();
    expect(() => areaRecordSchema.parse(makeArea())).not.toThrow();
    expect(() => areaIndexSchema.parse(fixtureIndex)).not.toThrow();
  });

  it("指標値とスコアは両方そろうか、両方欠損でなければならない", () => {
    expect(areaIndicatorSchema.safeParse({ value: 1, score: null, series: {} }).success).toBe(false);
    expect(
      areaIndicatorSchema.safeParse({ value: null, score: 50, series: {}, missing: "not-published" }).success
    ).toBe(false);
  });

  it("欠損には理由が必要で、値があるときは理由を書けない", () => {
    expect(areaIndicatorSchema.safeParse({ value: null, score: null, series: {} }).success).toBe(false);
    expect(areaIndicatorSchema.safeParse({ value: 1, score: 50, series: {}, missing: "not-published" }).success).toBe(
      false
    );
    expect(
      areaIndicatorSchema.safeParse({ value: null, score: null, series: {}, missing: "not-published" }).success
    ).toBe(true);
  });

  it("スコアは0〜100の整数に限る", () => {
    expect(areaIndicatorSchema.safeParse({ value: 1, score: 101, series: {} }).success).toBe(false);
    expect(areaIndicatorSchema.safeParse({ value: 1, score: 50.5, series: {} }).success).toBe(false);
  });

  it("市区町村コードは5桁の数字に限る", () => {
    expect(areaRecordSchema.safeParse(makeArea({ code: "1310" })).success).toBe(false);
    expect(areaRecordSchema.safeParse(makeArea({ prefCode: "48" })).success).toBe(false);
  });
});

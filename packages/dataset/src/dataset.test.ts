import { describe, expect, it } from "vitest";
import {
  areaSeries,
  buildHistogram,
  computeMetric,
  INDICATOR_KEYS,
  INDICATORS,
  percentileOf,
  rankOf,
  scoreFromPercentile,
  summarizeDistribution,
  toNationalRow
} from "@local-signal-japan/core";
import { SOURCE_INFO } from "./build";
import { readDataset } from "./store";

/**
 * リポジトリに同梱しているデータセットそのものの検査。
 * 算出ロジックを変えたのにデータを作り直していない、といった食い違いをここで止める。
 */
describe("同梱データセット", async () => {
  // 読み込み時にスキーマ検証も行われる。
  const { manifest, index, national, prefectures } = await readDataset();
  const areas = prefectures.flatMap((pref) => pref.areas);

  it("全国の市区町村を収録している", () => {
    expect(prefectures).toHaveLength(47);
    expect(areas.length).toBeGreaterThan(1850);
    expect(manifest.counts.areas).toBe(areas.length);
    expect(manifest.counts.referenceAreas).toBe(areas.filter((area) => area.kind !== "ward").length);
  });

  it("市区町村コードが重複せず、都道府県ファイルと一致する", () => {
    expect(new Set(areas.map((area) => area.code)).size).toBe(areas.length);
    for (const pref of prefectures) {
      expect(pref.areas.every((area) => area.code.startsWith(pref.prefCode) && area.prefName === pref.prefName)).toBe(
        true
      );
    }
  });

  it("検索用の一覧が都道府県ファイルと同じ内容を指す", () => {
    expect(index.areas).toEqual(
      areas.map((area) => ({
        code: area.code,
        name: area.name,
        kana: area.kana,
        prefCode: area.prefCode,
        ...(area.parentName ? { parentName: area.parentName } : {}),
        kind: area.kind
      }))
    );
  });

  it("政令指定都市の区にだけ市名が付いている", () => {
    expect(areas.filter((area) => area.kind === "ward").every((area) => area.parentName)).toBe(true);
    expect(areas.filter((area) => area.kind !== "ward").every((area) => area.parentName === undefined)).toBe(true);
  });

  it("出典・利用規約・クレジットの表記が規定どおり", () => {
    expect(manifest.source).toEqual(SOURCE_INFO);
  });

  it("指標定義の上流系列と、マニフェストの出典系列が一致する", () => {
    for (const key of INDICATOR_KEYS) {
      expect(manifest.indicators[key].sources.map(({ id, code, cycle }) => ({ id, code, cycle }))).toEqual(
        INDICATORS[key].upstream.map(({ id, code, cycle }) => ({ id, code, cycle }))
      );
    }
  });

  it("保持している指標値が、時系列から現在の算出ロジックで再計算した値と一致する", () => {
    for (const area of areas) {
      const series = areaSeries(area);
      for (const key of INDICATOR_KEYS) {
        const expected = computeMetric(key, series, manifest.indicators[key].year);
        const stored = area.indicators[key];
        expect({ code: area.code, key, value: stored.value, missing: stored.missing }).toEqual({
          code: area.code,
          key,
          value: expected.value,
          missing: expected.missing
        });
      }
    }
  });

  it("補助スコアと分布が、基準集団から再計算した値と一致する", () => {
    for (const key of INDICATOR_KEYS) {
      const reference = areas
        .filter((area) => area.kind !== "ward")
        .map((area) => area.indicators[key].value)
        .filter((value) => value !== null)
        .sort((a, b) => a - b);

      expect(manifest.indicators[key].distribution).toEqual(summarizeDistribution(reference));

      for (const area of areas) {
        const { value, score } = area.indicators[key];
        if (value === null) continue;
        expect({ code: area.code, key, score }).toEqual({
          code: area.code,
          key,
          score: scoreFromPercentile(percentileOf(reference, value), key)
        });
      }
    }
  });

  it("全国順位と分布図の度数が、基準集団から再計算した値と一致する", () => {
    for (const key of INDICATOR_KEYS) {
      const reference = areas
        .filter((area) => area.kind !== "ward")
        .map((area) => area.indicators[key].value)
        .filter((value) => value !== null)
        .sort((a, b) => a - b);

      expect(manifest.indicators[key].histogram).toEqual(buildHistogram(reference));
      expect(manifest.indicators[key].histogram.counts.reduce((sum, count) => sum + count, 0)).toBe(reference.length);

      for (const area of areas) {
        const { value, rank } = area.indicators[key];
        const expected = value === null || area.kind === "ward" ? null : rankOf(reference, value);
        expect({ code: area.code, key, rank }).toEqual({ code: area.code, key, rank: expected });
      }
    }
  });

  it("全国一覧が、都道府県ファイルと同じ値を指す", () => {
    expect(national.indicatorKeys).toEqual([...INDICATOR_KEYS]);
    expect(national.areas).toEqual(areas.map(toNationalRow));
  });

  it("保持している系列のキーが指標定義と一致する", () => {
    for (const area of areas) {
      for (const key of INDICATOR_KEYS) {
        expect(Object.keys(area.indicators[key].series)).toEqual(INDICATORS[key].series.map((stored) => stored.key));
      }
    }
  });
});

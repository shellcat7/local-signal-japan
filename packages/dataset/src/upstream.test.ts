import { describe, expect, it } from "vitest";
import type { UpstreamSeries } from "@local-signal-japan/core";
import { parseAreas, parsePrefectures, parseSeriesData, regionInfoUrl, seriesDataUrl } from "./upstream";

const ok = { status: "0", errorMsg: "正常に終了しました。" };

const regionResponse = (groups: unknown[]) => ({
  GET_META_REGION_INF: { RESULT: ok, METADATA_INF: { CLASS_INF: { CLASS_OBJ: groups } } }
});

const region = (code: string, name: string, level: string, toDate = "999912") => ({
  "@regionCode": code,
  "@name": name,
  "@level": level,
  "@hiragana": "よみ",
  "@fromDate": "197004",
  "@toDate": toDate
});

describe("parsePrefectures", () => {
  it("都道府県コードを2桁にして返す", () => {
    const json = regionResponse([
      {
        "@parentRegionCode": "00000",
        "@name": "全国",
        CLASS: [region("14000", "神奈川県", "3"), region("13000", "東京都", "3")]
      }
    ]);
    expect(parsePrefectures(json)).toEqual([
      { code: "13", name: "東京都" },
      { code: "14", name: "神奈川県" }
    ]);
  });
});

describe("parseAreas", () => {
  const json = regionResponse([
    {
      "@parentRegionCode": "14000",
      "@name": "神奈川県",
      CLASS: [region("14100", "横浜市", "8"), region("14201", "横須賀市", "9")]
    },
    // 子が1件のとき、上流は配列ではなくオブジェクトを返す。
    { "@parentRegionCode": "14100", "@name": "横浜市", CLASS: region("14117", "青葉区", "11") },
    {
      "@parentRegionCode": "13100",
      "@name": "特別区部",
      CLASS: [region("13101", "千代田区", "10"), region("13100", "特別区部", "7")]
    },
    {
      "@parentRegionCode": "13000",
      "@name": "東京都",
      CLASS: [region("13216", "(旧)田無市", "9", "200101"), region("13300", "西多摩郡", "6")]
    }
  ]);

  it("現存する市区町村だけをコード順に返す", () => {
    expect(parseAreas(json).map((area) => area.code)).toEqual(["13101", "14100", "14117", "14201"]);
  });

  it("区分を地域レベルから決め、政令指定都市の区にだけ市名を付ける", () => {
    const areas = new Map(parseAreas(json).map((area) => [area.code, area]));
    expect(areas.get("14100")).toMatchObject({ kind: "designated-city" });
    expect(areas.get("14117")).toEqual({
      code: "14117",
      name: "青葉区",
      kana: "よみ",
      kind: "ward",
      parentName: "横浜市"
    });
    expect(areas.get("13101")).toEqual({ code: "13101", name: "千代田区", kana: "よみ", kind: "special-ward" });
  });

  it("APIがエラーを返したら例外にする", () => {
    expect(() => parseAreas({ GET_META_REGION_INF: { RESULT: { status: "100", errorMsg: "エラー" } } })).toThrow(
      "status=100"
    );
  });
});

describe("parseSeriesData", () => {
  const series: UpstreamSeries = { id: "index", code: "1302050000000190010", cycle: "FY", fromYear: 2021 };

  const cell = (regionCode: string, time: string, value: string, indicator = series.code) => ({
    VALUE: {
      "@indicator": indicator,
      "@unit": "000",
      "@stat": "00200502",
      "@regionCode": regionCode,
      "@time": time,
      $: value
    }
  });

  const response = (cells: unknown[]) => ({
    GET_STATS: {
      RESULT: ok,
      STATISTICAL_DATA: {
        TABLE_INF: { STAT_NAME: [{ "@code": "00200502", $: "社会・人口統計体系" }] },
        CLASS_INF: {
          CLASS_OBJ: [
            { "@id": "indicator", CLASS: [{ "@code": series.code, "@name": "財政力指数（市町村財政）" }] },
            { "@id": "unit", CLASS: [{ "@code": "000", $: "" }] }
          ]
        },
        DATA_INF: { DATA_OBJ: cells }
      }
    }
  });

  it("市区町村ごとに年の昇順の時系列へまとめ、名称と出典を読む", () => {
    const data = parseSeriesData(
      response([
        cell("16210", "2022FY00", "0.34"),
        cell("16210", "2021FY00", "0.35"),
        cell("14100", "2022FY00", "0.95")
      ]),
      series
    );
    expect(data.name).toBe("財政力指数（市町村財政）");
    expect(data.statName).toBe("社会・人口統計体系");
    expect(data.unit).toBe("");
    expect(data.valuesByArea.get("16210")).toEqual([
      [2021, 0.35],
      [2022, 0.34]
    ]);
    expect(data.valuesByArea.get("14100")).toEqual([[2022, 0.95]]);
  });

  it("数値でないセル・対象外の年・別の周期・別の系列を読み飛ばす", () => {
    const data = parseSeriesData(
      response([
        cell("13101", "2022FY00", "-"),
        cell("16210", "2020FY00", "0.36"),
        cell("16210", "2022CY00", "0.99"),
        cell("16210", "2022FY00", "0.99", "9999999999999999999"),
        cell("16210", "2022FY00", "-0.5")
      ]),
      series
    );
    expect(data.valuesByArea.has("13101")).toBe(false);
    expect(data.valuesByArea.get("16210")).toEqual([[2022, -0.5]]);
  });

  it("同じ地域・同じ年の値が重複していたら例外にする", () => {
    expect(() =>
      parseSeriesData(response([cell("16210", "2022FY00", "0.34"), cell("16210", "2022FY00", "0.99")]), series)
    ).toThrow("重複");
  });

  it("単位が混ざっていたら例外にする", () => {
    const mixed = cell("14100", "2022FY00", "65000") as { VALUE: Record<string, string> };
    mixed.VALUE["@unit"] = "090";
    expect(() => parseSeriesData(response([cell("16210", "2022FY00", "0.34"), mixed]), series)).toThrow("複数の単位");
  });

  it("分割された応答は例外にする", () => {
    const paged = response([cell("16210", "2022FY00", "0.34")]) as {
      GET_STATS: { STATISTICAL_DATA: Record<string, unknown> };
    };
    paged.GET_STATS.STATISTICAL_DATA.RESULT_INF = { TOTAL_NUMBER: "200000", NEXT_KEY: "100001" };
    expect(() => parseSeriesData(paged, series)).toThrow("分割");
  });

  it("データが1件もなければ例外にする", () => {
    expect(() => parseSeriesData(response([cell("13101", "2022FY00", "-")]), series)).toThrow("index");
  });
});

describe("URLの組み立て", () => {
  it("地域マスタは地域レベルを指定する", () => {
    expect(regionInfoUrl([8, 9])).toBe(
      "https://dashboard.e-stat.go.jp/api/1.0/Json/getRegionInfo?Lang=JP&RegionLevel=8,9"
    );
  });

  it("系列データは市区町村の階級・周期・開始年を指定する", () => {
    const url = new URL(seriesDataUrl({ id: "index", code: "1302050000000190010", cycle: "FY", fromYear: 2010 }));
    expect(Object.fromEntries(url.searchParams)).toEqual({
      Lang: "JP",
      IndicatorCode: "1302050000000190010",
      RegionalRank: "4",
      Cycle: "4",
      TimeFrom: "2010FY00",
      MetaGetFlg: "Y"
    });
  });
});

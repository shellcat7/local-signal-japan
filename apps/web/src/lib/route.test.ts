import { describe, expect, it } from "vitest";
import { formatHash, parseHash, type Route } from "./route";

describe("parseHash", () => {
  it("市区町村コードとタブを読む", () => {
    expect(parseHash("#area=13101&tab=indicators")).toEqual({
      view: "area",
      areaCode: "13101",
      tab: "indicators",
      compare: []
    });
  });

  it("タブの指定がなければ概要にする", () => {
    expect(parseHash("#area=16210")).toMatchObject({ areaCode: "16210", tab: "overview" });
  });

  it("比較する市区町村は、重複と自分自身を除いて4つまで読む", () => {
    expect(parseHash("#area=13101&tab=comparison&with=14117,13101,14117,16210,abc,01100,27100,40130")).toMatchObject({
      compare: ["14117", "16210", "01100", "27100"]
    });
  });

  it("ランキングの条件を読む", () => {
    expect(parseHash("#view=ranking&metric=income&order=asc&pref=13&size=over-200k")).toEqual({
      view: "ranking",
      metric: "income",
      order: "asc",
      prefCode: "13",
      size: "over-200k",
      filters: {},
      topic: null,
      display: "table"
    });
    expect(parseHash("#view=ranking")).toEqual({
      view: "ranking",
      metric: "residents",
      order: "desc",
      prefCode: null,
      size: "all",
      filters: {},
      topic: null,
      display: "table"
    });
  });

  it("不正な値は無視する", () => {
    expect(parseHash("")).toEqual({ view: "home" });
    expect(parseHash("#main")).toEqual({ view: "home" });
    expect(parseHash("#area=abc&tab=unknown")).toEqual({ view: "home" });
    expect(parseHash("#area=131011")).toEqual({ view: "home" });
    expect(parseHash("#view=ranking&metric=bogus&pref=48&size=huge")).toEqual({
      view: "ranking",
      metric: "residents",
      order: "desc",
      prefCode: null,
      size: "all",
      filters: {},
      topic: null,
      display: "table"
    });
  });
});

describe("formatHash", () => {
  it("既定の値は省略して短くする", () => {
    expect(formatHash({ view: "area", areaCode: "13101", tab: "overview", compare: [] })).toBe("#area=13101");
    expect(formatHash({ view: "area", areaCode: "13101", tab: "report", compare: [] })).toBe("#area=13101&tab=report");
    expect(
      formatHash({
        view: "ranking",
        metric: "residents",
        order: "desc",
        prefCode: null,
        size: "all",
        filters: {},
        topic: null,
        display: "table"
      })
    ).toBe("#view=ranking");
  });

  it("比較する市区町村をカンマ区切りで書く", () => {
    expect(formatHash({ view: "area", areaCode: "13101", tab: "comparison", compare: ["14117", "16210"] })).toBe(
      "#area=13101&tab=comparison&with=14117,16210"
    );
  });

  it("トップページにはハッシュを付けない", () => {
    expect(formatHash({ view: "home" })).toBe("");
  });

  it("parseHash と往復できる", () => {
    const routes: Route[] = [
      { view: "area", areaCode: "14117", tab: "comparison", compare: ["13101", "16210"] },
      {
        view: "ranking",
        metric: "aging",
        order: "asc",
        prefCode: "47",
        size: "10k-50k",
        filters: {},
        topic: null,
        display: "table"
      },
      {
        view: "ranking",
        metric: "income",
        order: "desc",
        prefCode: null,
        size: "all",
        filters: { aging: { max: 30 }, income: { min: 350 }, migration: { min: -0.5, max: 0.25 } },
        topic: null,
        display: "map"
      },
      {
        view: "ranking",
        metric: "commuteBike",
        order: "desc",
        prefCode: null,
        size: "all",
        filters: { lifeFemale: { min: 88 } },
        topic: "bicycle",
        display: "table"
      },
      { view: "topics" }
    ];
    for (const route of routes) {
      expect(parseHash(formatHash(route))).toEqual(route);
    }
  });
});

describe("指標値の条件", () => {
  it("「下限..上限」の形で読み書きする", () => {
    const hash = "#view=ranking&metric=income&aging=..30&migration=-0.5..0.25&income=350..";
    const route = parseHash(hash);
    expect(route).toMatchObject({
      view: "ranking",
      filters: { aging: { max: 30 }, income: { min: 350 }, migration: { min: -0.5, max: 0.25 } }
    });
    expect(formatHash(route)).toBe(hash);
  });

  it("読めない指定は条件として扱わない", () => {
    expect(parseHash("#view=ranking&aging=abc&income=..&fiscal=1e9..&population=5")).toMatchObject({ filters: {} });
  });
});

describe("特集と地図", () => {
  it("特集の id は定義にあるものだけを読む", () => {
    expect(parseHash("#view=ranking&topic=bicycle")).toMatchObject({ topic: "bicycle" });
    expect(parseHash("#view=ranking&topic=unknown")).toMatchObject({ topic: null });
  });

  it("くらしの指標でも並べ替え・絞り込みができる", () => {
    expect(parseHash("#view=ranking&metric=furusatoReceipts&vacancy=..20")).toMatchObject({
      metric: "furusatoReceipts",
      filters: { vacancy: { max: 20 } }
    });
  });

  it("地図の表示と、特集の一覧を読む", () => {
    expect(parseHash("#view=ranking&show=map")).toMatchObject({ display: "map" });
    expect(parseHash("#view=topics")).toEqual({ view: "topics" });
    expect(parseHash("#area=16210&tab=life")).toMatchObject({ tab: "life" });
  });
});

describe("まちくじ", () => {
  it("引いた市区町村と、引く範囲の都道府県を読み書きする", () => {
    const route: Route = { view: "kuji", areaCode: "10524", prefCode: "10" };
    expect(parseHash("#view=kuji&area=10524&pref=10")).toEqual(route);
    expect(formatHash(route)).toBe("#view=kuji&area=10524&pref=10");
    expect(formatHash({ view: "kuji", areaCode: null, prefCode: null })).toBe("#view=kuji");
  });

  it("読めない指定は外す", () => {
    expect(parseHash("#view=kuji&area=abc&pref=48")).toEqual({ view: "kuji", areaCode: null, prefCode: null });
  });
});

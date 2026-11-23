import { describe, expect, it } from "vitest";
import { findAreaEntry, normalizeQuery, searchAreas, selectPeers } from "./search";
import { fixtureIndex, makeArea } from "./testing/fixtures";

const codes = (query: string) => searchAreas(fixtureIndex, query).map((area) => area.code);

describe("normalizeQuery", () => {
  it("小書きの「ヶ」と大きい「ケ」を区別しない", () => {
    expect(normalizeQuery("茅ヶ崎")).toBe(normalizeQuery("茅ケ崎"));
    const index = {
      ...fixtureIndex,
      areas: [
        ...fixtureIndex.areas,
        { code: "12224", name: "鎌ケ谷市", kana: "かまがやし", prefCode: "12", kind: "city" as const },
        { code: "14207", name: "茅ヶ崎市", kana: "ちがさきし", prefCode: "14", kind: "city" as const }
      ]
    };
    expect(searchAreas(index, "鎌ヶ谷").map((area) => area.code)).toEqual(["12224"]);
    expect(searchAreas(index, "茅ケ崎市").map((area) => area.code)).toEqual(["14207"]);
  });

  it("全角英数・カタカナ・空白の違いを吸収する", () => {
    expect(normalizeQuery("１３１０１")).toBe("13101");
    expect(normalizeQuery("チヨダク")).toBe("ちよだく");
    expect(normalizeQuery(" 東京都　千代田区 ")).toBe("東京都千代田区");
  });
});

describe("searchAreas", () => {
  it("市区町村コードは完全一致を先頭に、前方一致を続ける", () => {
    expect(codes("13101")).toEqual(["13101"]);
    expect(codes("141")).toEqual(["14100", "14117"]);
  });

  it("名前の完全一致を前方一致より優先する", () => {
    expect(codes("府中市")).toEqual(["13206", "34208"]);
    expect(codes("府中")).toEqual(["13206", "34208", "34309"]);
  });

  it("よみがな・カタカナでも検索できる", () => {
    expect(codes("なんと")).toEqual(["16210"]);
    expect(codes("ナントシ")).toEqual(["16210"]);
  });

  it("政令指定都市の区は市名つき・都道府県名つきでも見つかる", () => {
    expect(codes("横浜市青葉区")).toEqual(["14117"]);
    expect(codes("神奈川県青葉区")).toEqual(["14117"]);
    expect(codes("神奈川県横浜市青葉区")).toEqual(["14117"]);
  });

  it("都道府県名を付けると同名の市を絞り込める", () => {
    expect(codes("広島県府中市")).toEqual(["34208"]);
  });

  it("都道府県名だけの入力は、その都道府県の市区町村を返す", () => {
    expect(codes("広島県")).toEqual(["34208", "34309"]);
  });

  it("都道府県名と市区町村名の境界をまたいだ部分一致はしない", () => {
    // 「京都府」＋「中京区」を連結すると「府中」を含むが、一致させない。
    const index = {
      ...fixtureIndex,
      prefectures: fixtureIndex.prefectures.map((pref) => (pref.code === "26" ? { ...pref, name: "京都府" } : pref)),
      areas: [
        ...fixtureIndex.areas,
        {
          code: "26104",
          name: "中京区",
          kana: "なかぎょうく",
          prefCode: "26",
          parentName: "京都市",
          kind: "ward" as const
        }
      ]
    };
    expect(searchAreas(index, "府中").map((area) => area.code)).toEqual(["13206", "34208", "34309"]);
    expect(searchAreas(index, "京都府中京区").map((area) => area.code)).toEqual(["26104"]);
  });

  it("空の検索語や一致なしは空配列", () => {
    expect(codes("  ")).toEqual([]);
    expect(codes("存在しない町")).toEqual([]);
  });

  it("結果に都道府県名を付け、件数を制限する", () => {
    const results = searchAreas(fixtureIndex, "府中", 2);
    expect(results).toHaveLength(2);
    expect(results[0]?.prefName).toBe("東京都");
  });
});

describe("findAreaEntry", () => {
  it("コードから1件を返す", () => {
    expect(findAreaEntry(fixtureIndex, "14117")).toMatchObject({ name: "青葉区", prefName: "神奈川県" });
    expect(findAreaEntry(fixtureIndex, "00000")).toBeUndefined();
  });
});

describe("selectPeers", () => {
  it("人口規模が近い順に、対象自身を除いて選ぶ", () => {
    const target = makeArea({ code: "99201", population: 100000 });
    const areas = [
      target,
      makeArea({ code: "99202", population: 1000000 }),
      makeArea({ code: "99203", population: 90000 }),
      makeArea({ code: "99204", population: 120000 }),
      makeArea({ code: "99205", population: null })
    ];
    expect(selectPeers(areas, target, 2).map((area) => area.code)).toEqual(["99203", "99204"]);
  });
});

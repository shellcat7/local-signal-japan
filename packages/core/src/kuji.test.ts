import { describe, expect, it } from "vitest";
import { FACTS } from "./facts";
import { drawArea, findTraits, kujiPool, TRAIT_MIN_PREF_POOL } from "./kuji";
import { FACT_KEYS, INDICATOR_KEYS, type FactKey } from "./model";
import type { NationalRow } from "./schema";
import { makeManifest } from "./testing/fixtures";

const manifest = makeManifest();

/** 架空の市区町村。指定したくらしの指標だけ値を持つ。 */
function row(
  code: string,
  facts: Partial<Record<FactKey, number>>,
  options: { population?: number; kind?: NationalRow["kind"] } = {}
): NationalRow {
  return {
    code,
    name: `見本${code}`,
    prefCode: code.slice(0, 2),
    kind: options.kind ?? "city",
    population: options.population ?? 50_000,
    values: INDICATOR_KEYS.map(() => null),
    scores: INDICATOR_KEYS.map(() => null),
    facts: FACT_KEYS.map((key) => facts[key] ?? null)
  };
}

/** 400市区町村。20都道府県に20ずつ。自転車の割合は i（全国で重ならない）。 */
const rows = Array.from({ length: 400 }, (_, index) =>
  row(`${String(1 + Math.floor(index / 20)).padStart(2, "0")}${String(201 + (index % 20)).padStart(3, "0")}`, {
    commuteBike: index
  })
);
const at = (index: number) => rows[index] as NationalRow;
const phrases = (target: NationalRow, source = rows) =>
  findTraits(target, source, manifest, "見本県").map((trait) => [trait.scope, trait.phrase]);

describe("findTraits", () => {
  it("全国で10位以内なら、全国の順位で言う", () => {
    expect(phrases(at(399))).toEqual([["national", "全国で最も高い"]]);
    expect(phrases(at(0))).toEqual([["national", "全国で最も低い"]]);
  });

  it("全国で10位に入らなくても、都道府県の中で最も大きければ県内の順位で言う", () => {
    // 360〜379 が同じ都道府県。379 は全国で21番目。
    expect(phrases(at(379))).toEqual([["prefecture", "見本県で最も高い"]]);
  });

  it("全国の上位5%（400のうち20）に入れば、全国の順位で言う", () => {
    expect(phrases(at(385))).toEqual([["national", "全国で15番目に高い"]]);
  });

  it("都道府県の中で3位以内なら、県内の順位で言う", () => {
    expect(phrases(at(377))).toEqual([["prefecture", "見本県で3番目に高い"]]);
  });

  it("どれにも当たらなければ、全国で最も端に近い指標を1つだけ返す", () => {
    expect(phrases(at(150))).toEqual([["national", "全国で151番目に低い"]]);
  });

  it(`比べる市区町村が${TRAIT_MIN_PREF_POOL}に満たない都道府県では、県内の順位を言わない`, () => {
    const small = [...rows.slice(0, 360), ...rows.slice(371)]; // 360〜370 を除き、その都道府県は9つだけ
    expect(phrases(at(379), small)).toEqual([["national", "全国で21番目に高い"]]);
  });

  it("同じ値の市区町村も数に入れる（同じ値が多ければ「最も」とは言わない）", () => {
    const tied = rows.map((item, index) => row(item.code, { commuteBike: index < 300 ? 0 : index }));
    expect(phrases(tied[0] as NationalRow, tied)).toEqual([]);
    // 同じ値が2つなら、どちらも「最も」
    const pair = rows.map((item, index) => row(item.code, { commuteBike: index === 1 ? 0 : index }));
    expect(phrases(pair[1] as NationalRow, pair)).toEqual([["national", "全国で最も低い"]]);
  });

  it("目立つ順（全国10位以内、県内1位、全国上位5%、県内3位以内）に並べ、件数を限る", () => {
    const mixed = rows.map((item, index) =>
      row(item.code, {
        commuteBike: index,
        // 379 は、外国人住民の割合が全国で3番目
        foreignShare: index === 379 ? 1000 : index === 0 ? 2000 : index === 1 ? 3000 : index
      })
    );
    const traits = findTraits(mixed[379] as NationalRow, mixed, manifest, "見本県");
    expect(traits.map((trait) => [trait.key, trait.phrase])).toEqual([
      ["foreignShare", "全国で3番目に高い"],
      ["commuteBike", "見本県で最も高い"]
    ]);
    expect(findTraits(mixed[379] as NationalRow, mixed, manifest, "見本県", 1)).toHaveLength(1);
  });

  it("総額の項目は多い側だけを拾う", () => {
    const money = rows.map((item, index) => row(item.code, { furusatoReceipts: index * 1_000_000 }));
    expect(findTraits(money[0] as NationalRow, money, manifest, "見本県")).toEqual([]);
    expect(findTraits(money[399] as NationalRow, money, manifest, "見本県")[0]?.phrase).toBe("全国で最も多い");
  });

  it("人口の少ない市区町村で大きく動く項目は、人口1万人以上どうしで比べる", () => {
    expect(FACTS.marriageRate.smallAreaCaution).toBe(true);
    const marriage = rows.map((item, index) =>
      row(item.code, { marriageRate: index }, { population: index === 399 ? 5_000 : 50_000 })
    );
    expect(findTraits(marriage[399] as NationalRow, marriage, manifest, "見本県")).toEqual([]);
    expect(findTraits(marriage[398] as NationalRow, marriage, manifest, "見本県")[0]).toMatchObject({
      phrase: "人口1万人以上の市区町村で最も高い",
      total: 399,
      limited: true
    });
  });

  it("政令指定都市の区には特徴を出さず、区は比べる相手にも入れない", () => {
    const ward = row("14101", { commuteBike: 10_000 }, { kind: "ward" });
    expect(findTraits(ward, [...rows, ward], manifest, "見本県")).toEqual([]);
    expect(phrases(at(399), [...rows, ward])).toEqual([["national", "全国で最も高い"]]);
  });
});

describe("drawArea", () => {
  const entries = [
    { code: "13101", prefCode: "13", kind: "special-ward" as const },
    { code: "14101", prefCode: "14", kind: "ward" as const },
    { code: "14100", prefCode: "14", kind: "designated-city" as const },
    { code: "14201", prefCode: "14", kind: "city" as const }
  ];

  it("政令指定都市の区を除き、都道府県で絞れる", () => {
    expect(kujiPool(entries).map((entry) => entry.code)).toEqual(["13101", "14100", "14201"]);
    expect(kujiPool(entries, "14").map((entry) => entry.code)).toEqual(["14100", "14201"]);
  });

  it("乱数に応じて1つを選び、直前のものは避ける", () => {
    expect(drawArea(entries, { random: () => 0 })?.code).toBe("13101");
    expect(drawArea(entries, { random: () => 0.9999 })?.code).toBe("14201");
    expect(drawArea(entries, { random: () => 0, exclude: "13101" })?.code).toBe("14100");
    expect(drawArea(entries, { random: () => 0.5, prefCode: "14", exclude: "14201" })?.code).toBe("14100");
  });

  it("候補が1つなら直前と同じでも返し、候補がなければ null", () => {
    expect(drawArea(entries, { prefCode: "13", exclude: "13101" })?.code).toBe("13101");
    expect(drawArea(entries, { prefCode: "47" })).toBeNull();
  });
});

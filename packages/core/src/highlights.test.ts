import { describe, expect, it } from "vitest";
import { findHighlights, HIGHLIGHT_MIN_POPULATION } from "./highlights";
import { FACT_KEYS, INDICATOR_KEYS } from "./model";
import type { NationalRow } from "./schema";
import { makeManifest } from "./testing/fixtures";

const FACT = (key: (typeof FACT_KEYS)[number]) => FACT_KEYS.indexOf(key);

/** 架空の市区町村。指定したくらしの指標だけ値を持つ。 */
function row(
  code: string,
  population: number,
  facts: Partial<Record<(typeof FACT_KEYS)[number], number>>
): NationalRow {
  const values = Array.from({ length: FACT_KEYS.length }, () => null as number | null);
  for (const [key, value] of Object.entries(facts)) values[FACT(key as (typeof FACT_KEYS)[number])] = value;
  return {
    code,
    name: `見本${code}`,
    prefCode: code.slice(0, 2),
    kind: "city",
    population,
    values: INDICATOR_KEYS.map(() => null),
    scores: INDICATOR_KEYS.map(() => null),
    facts: values
  };
}

const manifest = makeManifest();

describe("findHighlights", () => {
  // 100市区町村。自転車の割合は i、外国人住民の割合は i / 10。
  const rows = Array.from({ length: 100 }, (_, index) =>
    row(`${String(10 + Math.floor(index / 10)).padStart(2, "0")}${String(201 + index).padStart(3, "0")}`, 50_000, {
      commuteBike: index,
      foreignShare: index / 10
    })
  );

  it("値が大きい側・小さい側から10以内の項目を、言葉と順位つきで抜き出す", () => {
    const top = findHighlights(rows[99] as NationalRow, rows, manifest);
    expect(top.map((item) => [item.key, item.side, item.rank, item.phrase])).toEqual([
      ["foreignShare", "high", 1, "全国で最も高い"],
      ["commuteBike", "high", 1, "全国で最も高い"]
    ]);
    const third = findHighlights(rows[2] as NationalRow, rows, manifest);
    expect(third.map((item) => item.phrase)).toEqual(["全国で3番目に低い", "全国で3番目に低い"]);
    expect(findHighlights(rows[50] as NationalRow, rows, manifest)).toEqual([]);
  });

  it("同じ値が多く、同じ値を含めると10を超えるときは抜き出さない", () => {
    const tied = [
      ...rows.slice(0, 80),
      ...Array.from({ length: 20 }, (_, index) => row(`47${String(301 + index)}`, 50_000, { commuteRail: 0 }))
    ];
    const zero = tied.at(-1) as NationalRow;
    expect(findHighlights(zero, tied, manifest).some((item) => item.key === "commuteRail")).toBe(false);
  });

  it("人口の少ない市区町村で大きく動く項目は、人口1万人以上の中で比べる", () => {
    const small = row("01999", HIGHLIGHT_MIN_POPULATION - 1, { marriageRate: 99 });
    const large = row("01998", 20_000, { marriageRate: 50 });
    const others = Array.from({ length: 30 }, (_, index) =>
      row(`02${String(201 + index)}`, 30_000, { marriageRate: index / 10 })
    );
    const all = [small, large, ...others];
    expect(findHighlights(small, all, manifest)).toEqual([]);
    const [item] = findHighlights(large, all, manifest);
    expect(item).toMatchObject({
      key: "marriageRate",
      rank: 1,
      limited: true,
      phrase: "人口1万人以上の市区町村で最も高い"
    });
  });

  it("政令指定都市の区は対象にしない", () => {
    expect(findHighlights({ ...(rows[99] as NationalRow), kind: "ward" }, rows, manifest)).toEqual([]);
  });
});

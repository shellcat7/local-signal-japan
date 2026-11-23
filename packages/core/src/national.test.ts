import { describe, expect, it } from "vitest";
import {
  activeFilters,
  findSimilarAreas,
  matchesFilters,
  rankNational,
  rowMetric,
  rowOverallScore,
  rowScore,
  rowValue,
  toNationalRow,
  unrankedNational,
  valuePosition
} from "./national";
import { FACT_KEYS } from "./model";
import type { NationalRow } from "./schema";
import { makeArea, withMissing } from "./testing/fixtures";

/** 架空の市区町村。scores は 人口・高齢化・転入転出・事業所・雇用・所得・財政 の順。 */
function row(
  code: string,
  population: number | null,
  scores: Array<number | null>,
  extra: Partial<NationalRow> = {}
): NationalRow {
  return {
    code,
    name: `見本${code}`,
    prefCode: code.slice(0, 2),
    kind: "city",
    population,
    values: scores.map((score) => (score === null ? null : score / 10)),
    scores,
    facts: Array.from({ length: FACT_KEYS.length }, () => null),
    ...extra
  };
}

describe("toNationalRow", () => {
  it("指標値と補助スコアを指標定義の順に並べる", () => {
    const national = toNationalRow(makeArea());
    expect(national.values).toEqual([5, 30, 0.5, 39.6, 4.5, 350, 0.8]);
    expect(national.scores).toEqual([90, 50, 80, 40, 20, 60, 85]);
    expect(rowValue(national, "income")).toBe(350);
    expect(rowScore(national, "aging")).toBe(50);
  });

  it("総合補助スコアは、市区町村の画面と同じ規則で求める", () => {
    expect(rowOverallScore(toNationalRow(makeArea()))).toBe(61);
    expect(rowOverallScore(toNationalRow(withMissing(makeArea(), ["income", "fiscal"])))).toBe(56);
    expect(rowMetric(toNationalRow(makeArea()), "overall")).toBe(61);
    expect(rowMetric(toNationalRow(makeArea()), "population")).toBe(5);
  });
});

describe("rankNational", () => {
  const rows = [
    row("13201", 500_000, [90, 90, 90, 90, 90, 90, 90]),
    row("13202", 80_000, [50, 50, 50, 50, 50, 50, 50]),
    row("14201", 8_000, [50, 50, 50, 50, 50, 50, 50]),
    row("14202", 30_000, [10, 10, 10, 10, 10, 10, 10]),
    row("14117", 300_000, [99, 99, 99, 99, 99, null, null], { kind: "ward", parentName: "横浜市" }),
    row("14203", 20_000, [null, null, null, null, 70, 70, 70])
  ];

  it("値が大きい順に並べ、同じ値には同じ順位を付ける", () => {
    const ranked = rankNational(rows, { metric: "overall", order: "desc" });
    expect(ranked.map((entry) => [entry.row.code, entry.rank])).toEqual([
      ["13201", 1],
      ["13202", 2],
      ["14201", 2],
      ["14202", 4]
    ]);
  });

  it("政令指定都市の区と、値のない市区町村は対象外にする", () => {
    const codes = rankNational(rows, { metric: "overall", order: "desc" }).map((entry) => entry.row.code);
    expect(codes).not.toContain("14117");
    // 利用できる指標が3つしかなく、総合補助スコアを算出できない。
    expect(codes).not.toContain("14203");
    // 指標ごとの値があれば、その指標のランキングには入る。
    expect(rankNational(rows, { metric: "income", order: "desc" }).map((entry) => entry.row.code)).toContain("14203");
  });

  it("小さい順にも並べられる", () => {
    const ranked = rankNational(rows, { metric: "population", order: "asc" });
    expect(ranked[0]).toMatchObject({ rank: 1, value: 1 });
    expect(ranked.at(-1)).toMatchObject({ rank: 4, value: 9 });
  });

  it("都道府県と人口規模で絞り込み、その中で順位を付け直す", () => {
    expect(
      rankNational(rows, { metric: "overall", order: "desc", prefCode: "14" }).map((entry) => [
        entry.row.code,
        entry.rank
      ])
    ).toEqual([
      ["14201", 1],
      ["14202", 2]
    ]);
    expect(
      rankNational(rows, { metric: "overall", order: "desc", populationBand: "10k-50k" }).map((entry) => entry.row.code)
    ).toEqual(["14202"]);
    expect(
      rankNational(rows, { metric: "overall", order: "desc", populationBand: "over-200k" }).map(
        (entry) => entry.row.code
      )
    ).toEqual(["13201"]);
  });
});

describe("findSimilarAreas", () => {
  const target = row("13201", 100_000, [80, 60, 70, 50, 40, 90, 85]);

  it("補助スコアの並び方と人口規模が近い順に返す", () => {
    const rows = [
      target,
      row("01201", 100_000, [20, 30, 10, 50, 40, 10, 15]),
      row("01202", 110_000, [78, 62, 71, 52, 38, 88, 86]),
      row("01203", 100_000, [70, 50, 60, 40, 30, 80, 75])
    ];
    expect(findSimilarAreas(rows, target, 3).map((entry) => entry.row.code)).toEqual(["01202", "01203", "01201"]);
  });

  it("補助スコアが同じでも、人口規模が大きく違えば遠いとみなす", () => {
    const rows = [
      target,
      row("01201", 1_000_000, [80, 60, 70, 50, 40, 90, 85]),
      row("01202", 95_000, [75, 55, 65, 45, 35, 85, 80])
    ];
    expect(findSimilarAreas(rows, target, 2).map((entry) => entry.row.code)).toEqual(["01202", "01201"]);
  });

  it("自分自身と、共通して値のある指標が少ない市区町村は除く", () => {
    const rows = [
      target,
      row("01201", 100_000, [80, 60, 70, 50, null, null, null]),
      row("01202", null, [80, 60, 70, 50, 40, 90, 85]),
      row("01203", 100_000, [80, 60, 70, 50, 40, null, null])
    ];
    expect(findSimilarAreas(rows, target).map((entry) => entry.row.code)).toEqual(["01203"]);
  });

  it("人口の値がなければ比べない", () => {
    expect(findSimilarAreas([target], { ...target, population: null })).toEqual([]);
  });
});

describe("指標値の条件", () => {
  // values は scores / 10。指標の順は 人口・高齢化・転入転出・事業所・雇用・所得・財政。
  const rows = [
    row("13201", 500_000, [90, 20, 90, 90, 90, 90, 90]),
    row("13202", 80_000, [50, 50, 50, 50, 50, 50, 50]),
    row("14202", 30_000, [10, 80, 10, 10, 10, 10, 10]),
    row("14203", 20_000, [60, null, 60, 60, 60, 60, 60]),
    row("14117", 300_000, [99, 10, 99, 99, 99, 99, 99], { kind: "ward", parentName: "横浜市" })
  ];

  it("範囲は両端を含み、すべての条件を満たす市区町村だけを残す", () => {
    const ranked = rankNational(rows, {
      metric: "population",
      order: "desc",
      filters: { population: { min: 5 }, aging: { max: 5 } }
    });
    expect(ranked.map((entry) => entry.row.code)).toEqual(["13201", "13202"]);
    expect(ranked.map((entry) => entry.rank)).toEqual([1, 2]);
  });

  it("条件を付けた指標の値がない市区町村は、対象から外す", () => {
    const ranked = rankNational(rows, { metric: "population", order: "desc", filters: { aging: { max: 100 } } });
    expect(ranked.map((entry) => entry.row.code)).not.toContain("14203");
  });

  it("条件を付けても、政令指定都市の区は含めない", () => {
    const ranked = rankNational(rows, { metric: "population", order: "desc", filters: { population: { min: 9 } } });
    expect(ranked.map((entry) => entry.row.code)).toEqual(["13201"]);
  });

  it("空の指定や数値でない指定は、条件として扱わない", () => {
    expect(activeFilters({ aging: {}, income: { min: Number.NaN }, fiscal: { max: 0.5 } })).toEqual([
      ["fiscal", { max: 0.5 }]
    ]);
    expect(activeFilters(undefined)).toEqual([]);
    expect(matchesFilters(rows[1] as NationalRow, [])).toBe(true);
  });
});

describe("人口での並べ替えと、値の大小での位置", () => {
  it("人口の多い順に並べられる。人口の値がない市区町村は除く", () => {
    const rows = [row("13201", 500_000, [50]), row("13202", null, [50]), row("13203", 800_000, [50])];
    expect(rankNational(rows, { metric: "residents", order: "desc" }).map((entry) => entry.row.code)).toEqual([
      "13203",
      "13201"
    ]);
  });

  it("値が小さいほど補助スコアが高い指標は、位置を反転して値の大小にそろえる", () => {
    expect(valuePosition("aging", 100)).toBe(0);
    expect(valuePosition("employment", 30)).toBe(70);
    expect(valuePosition("income", 80)).toBe(80);
    expect(valuePosition("fiscal", null)).toBeNull();
  });
});

describe("unrankedNational", () => {
  const rows = [
    row("13201", 500_000, [90, 20, 90, 90, 90, 90, 90]),
    row("13102", 80_000, [50, 50, 50, 50, 50, 50, null]),
    row("13101", 60_000, [60, 40, 60, 60, 60, 60, null]),
    row("14117", 300_000, [99, 10, 99, 99, 99, 99, null], { kind: "ward", parentName: "横浜市" })
  ];

  it("条件に合うが並べる値がない市区町村を、コード順に返す", () => {
    const options = { metric: "fiscal", filters: { aging: { max: 5 } } } as const;
    expect(rankNational(rows, { ...options, order: "desc" }).map((entry) => entry.row.code)).toEqual(["13201"]);
    expect(unrankedNational(rows, options).map((entry) => entry.code)).toEqual(["13101", "13102"]);
  });

  it("並べる値がすべてそろっていれば空になる", () => {
    expect(unrankedNational(rows, { metric: "residents" })).toEqual([]);
  });
});

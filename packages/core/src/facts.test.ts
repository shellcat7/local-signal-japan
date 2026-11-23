import { describe, expect, it } from "vitest";
import { computeFact, FACT_GROUPS, FACTS, formatFact, formatYen } from "./facts";
import { FACT_KEYS } from "./model";

describe("formatYen", () => {
  it("100万円未満は円、1億円未満は万円、それ以上は億円で書く", () => {
    expect(formatYen(12_823)).toBe("12,823円");
    expect(formatYen(999_999)).toBe("999,999円");
    expect(formatYen(3_190_000)).toBe("319万円");
    expect(formatYen(22_329_453_385)).toBe("223.3億円");
  });

  it("丸めて1億円に届くときは、億円で書く", () => {
    expect(formatYen(99_995_123)).toBe("1.0億円");
    expect(formatYen(99_994_999)).toBe("9,999万円");
  });

  it("負の数は負号、signed のときは正の数に + を付ける", () => {
    expect(formatYen(-31_910_000_000)).toBe("−319.1億円");
    expect(formatYen(140_000_000, true)).toBe("+1.4億円");
    expect(formatYen(0, true)).toBe("0円");
  });
});

describe("FACTS", () => {
  it("すべてのくらしの指標が定義され、分野は定義にあるものだけを使う", () => {
    expect(Object.keys(FACTS).sort()).toEqual([...FACT_KEYS].sort());
    const groups = FACT_GROUPS.map((group) => group.id) as string[];
    for (const key of FACT_KEYS) {
      expect(FACTS[key].key).toBe(key);
      expect(groups).toContain(FACTS[key].group);
      expect(FACTS[key].notes.length, key).toBeGreaterThan(0);
    }
  });

  it("統計ダッシュボードの指標は、基準年を決める系列を上流に持つ", () => {
    for (const key of FACT_KEYS) {
      const definition = FACTS[key];
      if (definition.provider !== "dashboard" || key === "projection2050") continue;
      expect(
        definition.upstream.map((series) => series.id),
        key
      ).toContain(definition.yearProbe);
    }
  });

  it("もとの数から、定義の小数桁に丸めて値を求める。求められなければ null", () => {
    expect(computeFact("foreignShare", { foreignResidents: 8871, residents: 41646 })).toBe(21.3);
    expect(computeFact("projection2050", { projection2025: 1299, projection2050: 406 })).toBe(-68.7);
    expect(computeFact("furusatoCostShare", { receipts: 0, costs: 10 })).toBeNull();
    expect(computeFact("doctors", { doctors: 4 })).toBeNull();
    expect(formatFact(FACTS.furusatoNet, -31_910_000_000)).toBe("−319.1億円");
    expect(formatFact(FACTS.projection2050, -68.7)).toBe("−68.7%");
  });
});

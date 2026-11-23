import { describe, expect, it } from "vitest";
import { FACT_GROUPS, FACT_KEYS, FACTS, findHighlights, formatFact, toNationalRow } from "@local-signal-japan/core";
import { readArea, readManifest, readNational } from "@local-signal-japan/dataset";
import { buildHighlights, buildShownFacts, factLines, factMissingText, highlightLines } from "./show";

describe("show のくらしの指標と全国で目立つところ", async () => {
  const [manifest, national] = await Promise.all([readManifest(), readNational()]);

  async function load(code: string) {
    const area = await readArea(code);
    if (!area) throw new Error(`データセットに ${code} がありません`);
    return area;
  }

  it("くらしの指標の値・基準時点・順位・もとの数が、データセットと一致する", async () => {
    const area = await load("13101");
    const facts = buildShownFacts(area, manifest);

    expect(Object.keys(facts)).toEqual([...FACT_KEYS]);
    for (const key of FACT_KEYS) {
      const stored = area.facts[key];
      expect(facts[key]).toMatchObject({
        label: FACTS[key].label,
        group: FACTS[key].group,
        unit: FACTS[key].unit,
        value: stored.value,
        valueText: stored.value === null ? null : formatFact(FACTS[key], stored.value),
        period: manifest.facts[key].period,
        rank: stored.rank,
        rankTotal: manifest.facts[key].distribution.count,
        provider: FACTS[key].provider
      });
      expect(Object.fromEntries(Object.entries(facts[key].basis).map(([name, item]) => [name, item.value]))).toEqual(
        stored.basis
      );
    }
    // 千代田区はごみの値が公表されていない。
    expect(facts.garbage).toMatchObject({ value: null, valueText: null, missingText: "値が公表されていません" });
    expect(facts.furusatoReceipts.valueText).toMatch(/億円$/);
  });

  it("値がない理由は、政令指定都市の区のふるさと納税と、住宅・土地統計調査の対象外を書き分ける", () => {
    expect(factMissingText({ kind: "ward" }, FACTS.furusatoReceipts)).toBe("市全体の値だけが公表されています");
    expect(factMissingText({ kind: "town" }, FACTS.vacancy)).toBe("この調査の集計の対象外です");
    expect(factMissingText({ kind: "city" }, FACTS.garbage)).toBe("値が公表されていません");
  });

  it.each(["27223", "13101", "01668", "13206"])(
    "%s: 全国で目立つところが core の findHighlights と一致する",
    async (code) => {
      const area = await load(code);
      const row = national.areas.find((candidate) => candidate.code === code) ?? toNationalRow(area);
      const highlights = buildHighlights(area, national.areas, manifest);

      expect(highlights).toEqual(findHighlights(row, national.areas, manifest));
      expect(highlights.length).toBeLessThanOrEqual(6);
      const lines = highlightLines(area, highlights);
      for (const item of highlights) {
        expect(lines).toContain(`- ${item.label}が${item.phrase}（${item.valueText}、${item.period}）`);
      }
    }
  );

  it("門真市は、自転車だけで通勤・通学する人の割合が全国で最も高い", async () => {
    const highlights = buildHighlights(await load("27223"), national.areas, manifest);
    expect(highlights[0]).toMatchObject({ key: "commuteBike", side: "high", rank: 1, phrase: "全国で最も高い" });
  });

  it("政令指定都市の区は、全国の比較に含めない", async () => {
    const ward = await load("14117");
    expect(buildHighlights(ward, national.areas, manifest)).toEqual([]);
    expect(highlightLines(ward, [])).toContain("- 政令指定都市の区は、市全体と重なるため全国の比較に含めていません。");
    expect(buildShownFacts(ward, manifest).furusatoReceipts.missingText).toBe("市全体の値だけが公表されています");
  });

  it("くらしの指標を分野ごとに並べ、ふるさと納税には総務省の出典を添える", async () => {
    const lines = factLines(buildShownFacts(await load("13101"), manifest), manifest);
    const furusato = manifest.additionalSources.find((source) => source.id === "furusato");

    for (const group of FACT_GROUPS) {
      expect(lines.some((line) => line.startsWith(`[${group.label}]`))).toBe(true);
    }
    expect(lines).toContain(`[ふるさと納税]（出典: ${furusato?.name}）`);
    expect(lines.some((line) => line.startsWith(`- ${FACTS.doctors.label}: `) && line.includes("全国1位/"))).toBe(true);
    expect(lines).toContain(
      `- ${FACTS.garbage.label}: 欠損（値が公表されていません、${manifest.facts.garbage.period}）`
    );
  });
});

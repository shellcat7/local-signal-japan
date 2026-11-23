import { describe, expect, it } from "vitest";
import { readAreaIndex, readManifest, readNational } from "@local-signal-japan/dataset";
import { CliError } from "./errors";
import { renderKujiJson, renderKujiText, runKuji } from "./kuji";

describe("runKuji", async () => {
  const [manifest, index, national] = await Promise.all([readManifest(), readAreaIndex(), readNational()]);
  const reference = national.areas.filter((row) => row.kind !== "ward");

  it("政令指定都市の区を除く市区町村から引き、目立つところを1〜3つ選ぶ", () => {
    for (const random of [0, 0.25, 0.5, 0.75, 0.9999]) {
      const result = runKuji(national.areas, index, manifest, { random: () => random });
      expect(result.area.kind).not.toBe("ward");
      expect(result.scope).toEqual({ name: "全国", count: reference.length });
      expect(result.traits.length).toBeGreaterThanOrEqual(1);
      expect(result.traits.length).toBeLessThanOrEqual(3);
    }
  });

  it("都道府県で絞れ、知らない都道府県は断る", () => {
    const result = runKuji(national.areas, index, manifest, { pref: "沖縄", random: () => 0 });
    expect(result.area.prefName).toBe("沖縄県");
    expect(result.scope.name).toBe("沖縄県");
    expect(() => runKuji(national.areas, index, manifest, { pref: "どこか" })).toThrow(CliError);
  });

  it("文には目立つところ・規則・出典を、JSONには同じ内容を出典つきで入れる", () => {
    const shiranuka = reference.findIndex((row) => row.code === "01668");
    const result = runKuji(national.areas, index, manifest, { random: () => (shiranuka + 0.5) / reference.length });
    expect(result.area).toMatchObject({ code: "01668", name: "白糠町", prefName: "北海道" });

    const text = renderKujiText(result, manifest.counts.referenceAreas);
    expect(text).toContain("北海道 白糠町（01668、町）");
    expect(text).toMatch(/- ふるさと納税の受入額（住民1人当たり）が全国で最も多い: .+万円/);
    expect(text).toContain("良し悪しを表すものではありません");
    expect(text).toContain("出典: 総務省「ふるさと納税に関する現況調査結果」を加工して作成");
    expect(text).toContain(manifest.source.credit);

    const json = JSON.parse(renderKujiJson(result)) as {
      area: { code: string };
      traits: unknown[];
      source: { attribution: string };
      additionalSources: Array<{ id: string }>;
    };
    expect(json.area.code).toBe("01668");
    expect(json.traits[0]).toMatchObject({ key: "furusatoPerCapita", scope: "national", rank: 1 });
    expect(json.source.attribution).toBe(manifest.source.attribution);
    expect(json.additionalSources.map((source) => source.id)).toEqual(["furusato"]);
  });
});

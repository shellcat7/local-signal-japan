import { describe, expect, it } from "vitest";
import { buildSummary } from "./signals";
import { makeArea, makeManifest, withMissing } from "./testing/fixtures";
import { buildAreaView, metricPeriodText, sourceUrl } from "./view";

const manifest = makeManifest();
const viewOf = (area = makeArea()) => buildAreaView(area, manifest);
const indicatorOf = (view: ReturnType<typeof viewOf>, key: string) => {
  const indicator = view.indicators.find((candidate) => candidate.key === key);
  if (!indicator) throw new Error(`指標がありません: ${key}`);
  return indicator;
};

describe("buildAreaView", () => {
  it("表示名・総合補助スコア・信頼度をまとめる", () => {
    const view = viewOf(makeArea({ name: "青葉区", parentName: "横浜市", prefName: "神奈川県", kind: "ward" }));
    expect(view.fullName).toBe("神奈川県 横浜市青葉区");
    expect(view.localName).toBe("横浜市青葉区");
    expect(view.overallScore).toBe(61);
    expect(view.coverage).toEqual({ available: 7, total: 7 });
    expect(view.retrievedAt).toBe(manifest.generatedAt);
  });

  it("指標値を単位・符号つきの文字列にする", () => {
    const view = viewOf();
    expect(indicatorOf(view, "population").valueText).toBe("+5.0%");
    expect(indicatorOf(view, "migration").valueText).toBe("+0.50%");
    expect(indicatorOf(view, "income").valueText).toBe("350.0万円");
    expect(indicatorOf(view, "fiscal").valueText).toBe("0.80");
  });

  it("指標ごとの基準時点を表記する", () => {
    expect(metricPeriodText("population", 2025)).toBe("2020→2025年");
    expect(metricPeriodText("migration", 2024)).toBe("2022〜2024年");
    expect(metricPeriodText("income", 2024)).toBe("2024年度");
    expect(metricPeriodText("employment", 2020)).toBe("2020年");
  });

  it("値の大小での位置は、向きを戻して求める", () => {
    const view = viewOf();
    expect(indicatorOf(view, "population").position).toBe(90);
    // 完全失業率は低いほど高スコア。スコア20は値が大きい側(位置80)。
    expect(indicatorOf(view, "employment").position).toBe(80);
  });

  it("関連する値に基準時点を添える", () => {
    const facts = indicatorOf(viewOf(), "population").facts;
    expect(facts).toEqual([
      { label: "住民基本台帳人口", value: "105,000人", period: "2025年1月1日" },
      { label: "5年前の人口", value: "100,000人", period: "2020年1月1日" }
    ]);
    expect(indicatorOf(viewOf(), "migration").facts.at(-1)).toEqual({
      label: "転入超過数",
      value: "+520人",
      period: "2024年"
    });
  });

  it("出典系列ごとに、その市区町村の値を返すAPIのURLを付ける", () => {
    const source = indicatorOf(viewOf(), "population").sources[0];
    expect(source?.url).toBe(sourceUrl("0000000000000000001", "99201"));
    expect(source?.url).toContain("RegionCode=99201");
  });

  it("出典系列の最新時点は、指標値と同じ年・年度の表記にそろえる", () => {
    // 所得の上流系列は「年」で登録されているが、指標値は「年度」で表記している。
    expect(indicatorOf(viewOf(), "income").sources[0]?.latestPeriod).toBe("2024年度");
    expect(indicatorOf(viewOf(), "population").sources[0]?.latestPeriod).toBe("2025年");
  });

  it("欠損の理由を区分に応じて説明する", () => {
    const ward = withMissing(makeArea({ kind: "ward", parentName: "横浜市" }), ["income", "fiscal"]);
    expect(indicatorOf(viewOf(ward), "income").missingText).toContain("市全体（横浜市）");

    const specialWard = withMissing(makeArea({ kind: "special-ward" }), ["fiscal"]);
    expect(indicatorOf(viewOf(specialWard), "fiscal").missingText).toContain("特別区");

    const city = withMissing(makeArea(), ["employment"]);
    const employment = indicatorOf(viewOf(city), "employment");
    expect(employment.valueText).toBe("欠損");
    expect(employment.band).toBe("missing");
    expect(employment.direction).toBe("unknown");
    expect(employment.missingText).toContain("2020年");
  });

  it("調査方法が変わった系列には切れ目を付ける", () => {
    expect(indicatorOf(viewOf(), "business").chart?.breakAfterYear).toBe(2016);
    expect(indicatorOf(viewOf(), "population").chart?.breakAfterYear).toBeUndefined();
  });
});

describe("buildSummary", () => {
  const summaryOf = (area = makeArea()) => buildSummary(viewOf(area), manifest);

  it("補助スコアが上位帯の指標と下位帯の指標を振り分ける", () => {
    const summary = summaryOf();
    // スコア 90, 80, 85 → 上位帯 / スコア 20 → 下位帯
    expect(summary.upperSignals).toHaveLength(3);
    expect(summary.upperSignals[0]).toBe(
      "5年間の人口増減率は+5.0%（2020→2025年）。全国の市区町村で値が大きいほうから約10%以内の水準です。"
    );
    expect(summary.lowerSignals).toEqual([
      "完全失業率（国勢調査）は4.5%（2020年）。全国の市区町村で値が大きいほうから約20%以内の水準です。"
    ]);
  });

  it("基準時点が古い指標を注意として挙げる", () => {
    // 取得年 2026 に対し、事業所 2021・雇用 2020・財政 2022 は4年以上前
    expect(summaryOf().cautionSignals).toEqual([
      "次の指標は基準時点が古く、現状と差がある可能性があります: 事業所（2021年）、雇用（2020年）、財政（2022年度）。"
    ]);
  });

  it("昼夜間人口比率が極端な地域に注意を添える", () => {
    expect(summaryOf(makeArea({ daytimeRatio: 1355.4 })).cautionSignals[0]).toContain(
      "昼夜間人口比率が1,355.4%（社会・人口統計体系、2020年）で、通勤・通学による昼間の流入が大きい"
    );
    expect(summaryOf(makeArea({ daytimeRatio: 79.8 })).cautionSignals[0]).toContain("域外へ出る人が多い");
  });

  it("人口が少ない地域と政令指定都市の区に注意を添える", () => {
    expect(summaryOf(makeArea({ population: 1689 })).cautionSignals.join("")).toContain("人口が1,689人と少なく");
    expect(summaryOf(makeArea({ kind: "ward", parentName: "横浜市" })).cautionSignals.join("")).toContain(
      "市全体（横浜市）"
    );
  });

  it("欠損した指標を理由つきで列挙する", () => {
    const summary = summaryOf(withMissing(makeArea({ kind: "special-ward" }), ["fiscal"]));
    expect(summary.missingDataNotes).toEqual(["財政: 出典（統計ダッシュボード）に特別区の値が収録されていません。"]);
  });

  it("地域を断定的に評価する言葉を使わない", () => {
    const summary = summaryOf(makeArea({ daytimeRatio: 60, population: 900, kind: "ward", parentName: "横浜市" }));
    const text = Object.values(summary).flat().join("\n");
    for (const word of ["成長", "停滞", "衰退", "消滅", "危険", "劣", "優れ", "良い地域", "悪い地域"]) {
      expect(text).not.toContain(word);
    }
  });
});

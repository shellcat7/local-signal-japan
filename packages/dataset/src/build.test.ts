import { describe, expect, it } from "vitest";
import { FACT_KEYS, FACTS, INDICATOR_KEYS, type SeriesPoint } from "@local-signal-japan/core";
import { buildDataset, latestWellCoveredYear, type UpstreamSnapshot } from "./build";
import { listUpstreamSeries } from "./fetch";
import type { UpstreamArea, UpstreamSeriesData } from "./upstream";

const GENERATED_AT = "2026-11-23T00:00:00.000Z";
const CITY_COUNT = 1800;

/** 架空の全国データを作る。市 i は i が大きいほどすべての値が大きい。 */
function makeSnapshot(): UpstreamSnapshot {
  const prefectures = Array.from({ length: 47 }, (_, index) => ({
    code: String(index + 1).padStart(2, "0"),
    name: `第${index + 1}県`
  }));

  const cities: UpstreamArea[] = Array.from({ length: CITY_COUNT }, (_, index) => ({
    code: `${String((index % 47) + 1).padStart(2, "0")}${String(201 + Math.floor(index / 47)).padStart(3, "0")}`,
    name: `見本${index}市`,
    kana: `みほん${index}し`,
    kind: "city"
  }));
  const ward: UpstreamArea = { code: "01101", name: "見本区", kana: "みほんく", kind: "ward", parentName: "見本0市" };
  // 統計が一切ない地域(対象外になる)
  const empty: UpstreamArea = { code: "01999", name: "無人村", kana: "むじんむら", kind: "village" };

  const series = Object.fromEntries(
    listUpstreamSeries().map((upstream): [string, UpstreamSeriesData] => [
      upstream.id,
      { name: `系列 ${upstream.id}`, statName: "テスト統計", unit: "", valuesByArea: new Map<string, SeriesPoint[]>() }
    ])
  );
  const put = (id: string, code: string, points: SeriesPoint[]) => series[id]?.valuesByArea.set(code, points);

  cities.forEach((city, index) => {
    const growth = 1 + index / 10000;
    put("residents", city.code, [
      [2020, 10000],
      [2021, 10000],
      [2022, 10000],
      [2023, 10000],
      [2024, 10000],
      [2025, Math.round(10000 * growth)]
    ]);
    put("ratio", city.code, [[2025, 20 + index / 100]]);
    put("inflow", city.code, [
      [2022, 500 + index],
      [2023, 500 + index],
      [2024, 500 + index]
    ]);
    put("outflow", city.code, [
      [2022, 500],
      [2023, 500],
      [2024, 500]
    ]);
    put("establishmentsLegacy", city.code, [[2016, 300 + index]]);
    put("establishments", city.code, [[2021, 400 + index]]);
    put("unemployment", city.code, [[2020, 1 + index / 1000]]);
    put("taxableIncome", city.code, [[2024, (3000 + index) * 1000]]);
    put("taxpayers", city.code, [[2024, 1000]]);
    put("index", city.code, [[2022, 0.1 + index / 10000]]);
    put("daytimeRatio", city.code, [[2020, 100]]);

    // くらしの指標（i が大きいほど値が大きい）。
    put("lifeFemale", city.code, [[2020, 86 + index / 1000]]);
    put("lifeMale", city.code, [[2020, 80 + index / 1000]]);
    put("projection", city.code, [
      [2025, 10000],
      [2050, 6000 + index]
    ]);
    put("foreignResidents", city.code, [[2025, 100 + index]]);
    put("marriages", city.code, [[2024, 40 + index / 100]]);
    put("births", city.code, [[2025, 70 + index / 100]]);
    put("elderlyAlone", city.code, [[2020, 5 + index / 100]]);
    put("commuteTotal", city.code, [[2020, 5000]]);
    put("commuteRail", city.code, [[2020, 1000 + index]]);
    put("commuteCar", city.code, [[2020, 2500]]);
    put("commuteBike", city.code, [[2020, 400]]);
    put("commuteWalk", city.code, [[2020, 300]]);
    put("vacancy", city.code, [[2023, 10 + index / 100]]);
    put("floorArea", city.code, [[2023, 80 + index / 10]]);
    put("doctors", city.code, [[2022, 10 + index]]);
    put("libraries", city.code, [[2021, index % 3]]);
    put("garbage", city.code, [[2023, 800 + index]]);
    put("recycling", city.code, [[2023, 15 + index / 100]]);
  });

  // 区は人口と高齢化率だけ公表されている想定。高齢化率は全国で最も低い。
  put("residents", ward.code, [
    [2020, 5000],
    [2025, 5100]
  ]);
  put("ratio", ward.code, [[2025, 10]]);

  const furusato = {
    receiptsYear: 2025,
    deductionYear: 2026,
    receipts: new Map(cities.map((city, index) => [city.code, 1_000_000 * (index + 1)])),
    costs: new Map(cities.map((city, index) => [city.code, 400_000 * (index + 1)])),
    deductions: new Map(cities.map((city) => [city.code, 50_000_000])),
    documents: [
      { title: "各自治体の令和7年度受入額等", publisher: "総務省", url: "https://www.soumu.go.jp/main_content/1.xlsx" },
      { title: "住民税控除額", publisher: "総務省", url: "https://www.soumu.go.jp/main_content/2.xlsx" }
    ]
  };

  return { prefectures, areas: [...cities, ward, empty], series, furusato };
}

describe("buildDataset", () => {
  const dataset = buildDataset(makeSnapshot(), GENERATED_AT);
  const areas = dataset.prefectures.flatMap((pref) => pref.areas);
  const areaOf = (code: string) => {
    const area = areas.find((candidate) => candidate.code === code);
    if (!area) throw new Error(`市区町村がありません: ${code}`);
    return area;
  };
  const cityCode = (index: number) =>
    `${String((index % 47) + 1).padStart(2, "0")}${String(201 + Math.floor(index / 47)).padStart(3, "0")}`;

  it("統計が一切ない地域を除き、件数をマニフェストに記録する", () => {
    expect(areas).toHaveLength(CITY_COUNT + 1);
    expect(areas.some((area) => area.code === "01999")).toBe(false);
    expect(dataset.manifest.counts).toEqual({ areas: CITY_COUNT + 1, referenceAreas: CITY_COUNT });
    expect(dataset.manifest.generatedAt).toBe(GENERATED_AT);
  });

  it("都道府県ごとのファイルと検索用の一覧が同じ市区町村を指す", () => {
    expect(dataset.prefectures).toHaveLength(47);
    expect(dataset.index.areas.map((area) => area.code).sort()).toEqual(areas.map((area) => area.code).sort());
    for (const pref of dataset.prefectures) {
      expect(pref.areas.every((area) => area.prefCode === pref.prefCode)).toBe(true);
    }
  });

  it("指標ごとの基準年を全国で最新の年に決める", () => {
    const years = Object.fromEntries(INDICATOR_KEYS.map((key) => [key, dataset.manifest.indicators[key].year]));
    expect(years).toEqual({
      population: 2025,
      aging: 2025,
      migration: 2024,
      business: 2021,
      employment: 2020,
      income: 2024,
      fiscal: 2022
    });
  });

  it("値が大きいほど高スコアの指標は、最大の市が100に近く最小の市が0に近い", () => {
    const top = areaOf(cityCode(CITY_COUNT - 1));
    const bottom = areaOf(cityCode(0));
    // 丸めによる同値があるため、端の値がちょうど100・0になるとは限らない。
    for (const key of ["population", "migration", "business", "income", "fiscal"] as const) {
      expect(top.indicators[key].score).toBeGreaterThanOrEqual(99);
      expect(bottom.indicators[key].score).toBeLessThanOrEqual(1);
    }
  });

  it("値が小さいほど高スコアの指標は向きを反転する", () => {
    const top = areaOf(cityCode(CITY_COUNT - 1));
    const bottom = areaOf(cityCode(0));
    expect(top.indicators.aging.score).toBeLessThanOrEqual(1);
    expect(bottom.indicators.aging.score).toBeGreaterThanOrEqual(99);
    expect(top.indicators.employment.score).toBeLessThanOrEqual(1);
  });

  it("上流の2系列から所得と転入超過数を算出して保持する", () => {
    const city = areaOf(cityCode(100));
    // (3000 + 100) 千円 × 1000 ÷ 1000人 = 3100千円 = 310万円
    expect(city.indicators.income.series.perTaxpayer).toEqual([[2024, 310]]);
    expect(city.indicators.migration.series.net).toEqual([
      [2022, 100],
      [2023, 100],
      [2024, 100]
    ]);
  });

  it("調査方法の変更で分かれた事業所数の系列を1本に並べる", () => {
    expect(areaOf(cityCode(0)).indicators.business.series.establishments).toEqual([
      [2016, 300],
      [2021, 400]
    ]);
  });

  it("政令指定都市の区は基準集団に含めず、同じ分布の上で位置づける", () => {
    const ward = areaOf("01101");
    expect(ward.parentName).toBe("見本0市");
    expect(dataset.manifest.indicators.aging.distribution.count).toBe(CITY_COUNT);
    // 高齢化率が全国で最も低いので、反転後のスコアは100
    expect(ward.indicators.aging).toMatchObject({ value: 10, score: 100 });
    // 増減率 +2.0% は、0〜+18%に一様に並ぶ市の中で下から約11%の位置
    expect(ward.indicators.population).toMatchObject({ value: 2, score: 11 });
  });

  it("基準集団の中で、値が大きい順の順位を付ける", () => {
    // 所得は市ごとに異なる値なので、最大の市が1位、最小の市が最下位になる。
    expect(areaOf(cityCode(CITY_COUNT - 1)).indicators.income.rank).toBe(1);
    expect(areaOf(cityCode(0)).indicators.income.rank).toBe(CITY_COUNT);
    // 高齢化率も値が大きい順。スコアの向き（低いほど高スコア）とは関係なく付ける。
    expect(areaOf(cityCode(CITY_COUNT - 1)).indicators.aging.rank).toBe(1);
    // 区は基準集団に入らないので順位を持たない。
    expect(areaOf("01101").indicators.aging.rank).toBeNull();
  });

  it("分布図の度数と、全国一覧を組み立てる", () => {
    const { histogram, distribution } = dataset.manifest.indicators.income;
    expect(histogram.counts.reduce((sum, count) => sum + count, 0)).toBe(distribution.count);
    expect(histogram.min).toBeGreaterThanOrEqual(distribution.min);
    expect(histogram.max).toBeLessThanOrEqual(distribution.max);

    expect(dataset.national.areas).toHaveLength(areas.length);
    const row = dataset.national.areas.find((candidate) => candidate.code === cityCode(100));
    expect(row?.values[dataset.national.indicatorKeys.indexOf("income")]).toBe(310);
  });

  it("公表されていない指標は理由つきの欠損にする", () => {
    const ward = areaOf("01101");
    expect(ward.indicators.income).toEqual({
      value: null,
      score: null,
      rank: null,
      series: { perTaxpayer: [] },
      missing: "not-published"
    });
    expect(ward.indicators.migration.missing).toBe("not-published");
    expect(ward.daytimeRatio).toBeNull();
  });

  it("出典系列の名称・統計名・最新年をマニフェストに記録する", () => {
    expect(dataset.manifest.indicators.business.sources).toEqual([
      expect.objectContaining({ id: "establishmentsLegacy", name: "系列 establishmentsLegacy", latestYear: 2016 }),
      expect.objectContaining({ id: "establishments", statName: "テスト統計", latestYear: 2021 })
    ]);
    expect(dataset.manifest.context.daytimeRatio.latestYear).toBe(2020);
  });

  it("廃止された市区町村の古い値があっても、出典系列の最新年は収録している市区町村で決める", () => {
    const snapshot = makeSnapshot();
    // 合併前の市区町村の値が、古い年にだけ大量に残っている想定。
    for (let index = 0; index < CITY_COUNT * 2; index += 1) {
      snapshot.series.ratio?.valuesByArea.set(`9${String(index).padStart(4, "0")}`, [[2005, 20]]);
    }
    const built = buildDataset(snapshot, GENERATED_AT);
    expect(built.manifest.indicators.aging.year).toBe(2025);
    expect(built.manifest.indicators.aging.sources[0]?.latestYear).toBe(2025);
  });

  it("くらしの指標を、もとの数から定義の計算式で求めて保持する", () => {
    const city = areaOf(cityCode(10));
    expect(city.facts.foreignShare.basis).toEqual({ foreignResidents: 110, residents: 10010 });
    expect(city.facts.projection2050.value).toBeCloseTo(((6000 + 10) / 10000) * 100 - 100, 1);
    expect(city.facts.commuteRail.value).toBe(20.2);
    expect(city.facts.furusatoCostShare.value).toBe(40);
    expect(city.facts.furusatoNet.value).toBe(11_000_000 - 50_000_000);
    for (const key of FACT_KEYS) {
      expect(city.facts[key].value, key).not.toBeNull();
    }
  });

  it("くらしの指標の基準年と出典を記録する", () => {
    const facts = dataset.manifest.facts;
    expect(facts.lifeFemale.year).toBe(2020);
    expect(facts.marriageRate.year).toBe(2024);
    expect(facts.birthRate.year).toBe(2025);
    expect(facts.furusatoReceipts.period).toBe("令和7年度（2025年度）");
    expect(facts.furusatoOutflow.period).toBe("令和8年度課税（2025年中の寄附）");
    expect(facts.foreignShare.sources.map((source) => source.id)).toEqual(["foreignResidents", "residents"]);
    expect(facts.furusatoNet.documents).toHaveLength(2);
    expect(facts.furusatoOutflow.documents.map((document) => document.title)).toEqual(["住民税控除額"]);
    expect(dataset.manifest.additionalSources.map((source) => source.id)).toEqual(["furusato"]);
  });

  it("くらしの指標の順位は区を除いて付け、区は値だけを持つ", () => {
    const top = areaOf(cityCode(CITY_COUNT - 1));
    expect(top.facts.lifeFemale.rank).toBe(1);
    expect(top.facts.furusatoReceipts.rank).toBe(1);
    const ward = areaOf("01101");
    expect(ward.facts.lifeFemale.value).toBeNull();
    expect(ward.facts.furusatoReceipts).toEqual({ value: null, rank: null, basis: {} });
    expect(dataset.national.factKeys).toEqual([...FACT_KEYS]);
    expect(dataset.national.areas.find((row) => row.code === top.code)?.facts).toEqual(
      FACT_KEYS.map((key) => top.facts[key].value)
    );
  });

  it("図書館の数が0の市区町村は、値0として順位を付ける", () => {
    const zero = areaOf(cityCode(0));
    expect(zero.facts.libraries.value).toBe(0);
    expect(zero.facts.libraries.rank).toBeGreaterThan(1);
    expect(FACTS.libraries.unit).toBe("館");
  });

  it("市区町村数が少なすぎる取得結果は拒否する", () => {
    const snapshot = makeSnapshot();
    snapshot.areas = snapshot.areas.slice(0, 100);
    expect(() => buildDataset(snapshot, GENERATED_AT)).toThrow("想定の範囲外");
  });

  it("都道府県が47件そろっていない取得結果は拒否する", () => {
    const snapshot = makeSnapshot();
    snapshot.prefectures = snapshot.prefectures.slice(0, 46);
    expect(() => buildDataset(snapshot, GENERATED_AT)).toThrow("47件");
  });
});

describe("latestWellCoveredYear", () => {
  it("一部の地域だけ先に公開された年は基準年にしない", () => {
    const full: SeriesPoint[] = [
      [2023, 1],
      [2024, 1]
    ];
    const early: SeriesPoint[] = [...full, [2025, 1]];
    const repeat = (points: SeriesPoint[], count: number) => Array.from({ length: count }, () => points);

    // 2025年が全体の1割・8割にとどまるうちは採用せず、9割そろったら採用する。
    expect(latestWellCoveredYear([...repeat(early, 1), ...repeat(full, 9)])).toBe(2024);
    expect(latestWellCoveredYear([...repeat(early, 8), ...repeat(full, 2)])).toBe(2024);
    expect(latestWellCoveredYear([...repeat(early, 9), ...repeat(full, 1)])).toBe(2025);
  });

  it("データが1件もなければ例外にする", () => {
    expect(() => latestWellCoveredYear([[], []])).toThrow();
  });
});

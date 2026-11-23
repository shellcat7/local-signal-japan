import { FACTS } from "../facts";
import { FACT_KEYS, INDICATOR_KEYS, type FactKey, type IndicatorKey } from "../model";
import type { AreaFact, AreaIndex, AreaRecord, Manifest, ManifestFact } from "../schema";

/** テスト用の架空データ。実在の統計値ではない。 */
export const fixtureYears: Record<IndicatorKey, number> = {
  population: 2025,
  aging: 2025,
  migration: 2024,
  business: 2021,
  employment: 2020,
  income: 2024,
  fiscal: 2022
};

export function makeManifest(overrides: Partial<Manifest> = {}): Manifest {
  const distribution = { count: 1741, min: 0, p10: 10, p25: 25, p50: 50, p75: 75, p90: 90, max: 100 };

  return {
    schemaVersion: 3,
    generatedAt: "2026-11-23T00:00:00.000Z",
    source: {
      name: "統計ダッシュボード（総務省統計局）",
      url: "https://dashboard.e-stat.go.jp/",
      apiUrl: "https://dashboard.e-stat.go.jp/static/api",
      license: "公共データ利用規約（第1.0版）",
      licenseUrl: "https://dashboard.e-stat.go.jp/static/terms",
      attribution: "統計ダッシュボード（https://dashboard.e-stat.go.jp/）のデータを加工して作成",
      credit:
        "このサービスは、統計ダッシュボードのAPI機能を使用していますが、サービスの内容は国によって保証されたものではありません。"
    },
    counts: { areas: 1912, referenceAreas: 1741 },
    additionalSources: [
      {
        id: "furusato",
        name: "ふるさと納税に関する現況調査結果（総務省）",
        url: "https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/furusato/archive/",
        license: "公共データ利用規約（第1.0版）",
        licenseUrl: "https://www.soumu.go.jp/menu_kyotsuu/policy/tyosaku.html",
        attribution: "総務省「ふるさと納税に関する現況調査結果」を加工して作成"
      }
    ],
    context: {
      daytimeRatio: {
        id: "daytimeRatio",
        code: "0201060000000020000",
        name: "昼夜間人口比率",
        statName: "社会・人口統計体系",
        unit: "%",
        cycle: "CY",
        latestYear: 2020
      }
    },
    indicators: Object.fromEntries(
      INDICATOR_KEYS.map((key) => [
        key,
        {
          year: fixtureYears[key],
          distribution,
          histogram: { min: 0, max: 100, counts: [100, 300, 500, 441, 300, 100] },
          sources: [
            {
              id: key,
              code: "0000000000000000001",
              name: `テスト系列（${key}）`,
              statName: "テスト統計",
              unit: "",
              cycle: "CY",
              latestYear: fixtureYears[key]
            }
          ]
        }
      ])
    ) as Manifest["indicators"],
    facts: Object.fromEntries(
      FACT_KEYS.map((key): [FactKey, ManifestFact] => [
        key,
        {
          year: fixtureFactYears[key],
          period: FACTS[key].period(fixtureFactYears[key]),
          distribution,
          sources: [],
          documents: []
        }
      ])
    ) as Manifest["facts"],
    ...overrides
  };
}

export const fixtureFactYears: Record<FactKey, number> = Object.fromEntries(
  FACT_KEYS.map((key) => [key, FACTS[key].provider === "furusato" ? 2025 : 2020])
) as Record<FactKey, number>;

/** くらしの指標の架空の値（もとの数だけを与え、値は定義の計算式で求める）。 */
export const fixtureFactBasis: Record<FactKey, Record<string, number>> = {
  lifeFemale: { lifeFemale: 87.5 },
  lifeMale: { lifeMale: 81.2 },
  projection2050: { projection2025: 105000, projection2050: 92000 },
  foreignShare: { foreignResidents: 2100, residents: 105000 },
  marriageRate: { marriages: 420, residents: 105000 },
  birthRate: { births: 700, residents: 105000 },
  elderlyAlone: { elderlyAlone: 12.3 },
  commuteRail: { commuteRail: 12000, commuteTotal: 50000 },
  commuteCar: { commuteCar: 25000, commuteTotal: 50000 },
  commuteBike: { commuteBike: 4000, commuteTotal: 50000 },
  commuteWalk: { commuteWalk: 3000, commuteTotal: 50000 },
  vacancy: { vacancy: 13.5 },
  floorArea: { floorArea: 98.7 },
  doctors: { doctors: 210, residents: 105000 },
  libraries: { libraries: 3, residents: 105000 },
  garbage: { garbage: 850 },
  recycling: { recycling: 19.5 },
  furusatoReceipts: { receipts: 1_250_000_000 },
  furusatoPerCapita: { receipts: 1_250_000_000, residents: 105000 },
  furusatoCostShare: { receipts: 1_250_000_000, costs: 560_000_000 },
  furusatoOutflow: { deduction: 320_000_000 },
  furusatoNet: { receipts: 1_250_000_000, deduction: 320_000_000 }
};

export function fixtureFacts(): Record<FactKey, AreaFact> {
  return Object.fromEntries(
    FACT_KEYS.map((key, index) => {
      const basis = fixtureFactBasis[key];
      const value = FACTS[key].compute(basis);
      return [key, { value, rank: value === null ? null : 100 + index, basis }];
    })
  ) as Record<FactKey, AreaFact>;
}

/** 全指標がそろった架空の市。 */
export function makeArea(overrides: Partial<AreaRecord> = {}): AreaRecord {
  return {
    code: "99201",
    name: "見本市",
    kana: "みほんし",
    prefCode: "13",
    prefName: "東京都",
    kind: "city",
    population: 105000,
    daytimeRatio: 100,
    indicators: {
      population: {
        value: 5,
        score: 90,
        rank: 175,
        series: {
          residents: [
            [2020, 100000],
            [2021, 101000],
            [2022, 102000],
            [2023, 103000],
            [2024, 104000],
            [2025, 105000]
          ]
        }
      },
      aging: {
        value: 30,
        score: 50,
        rank: 870,
        series: {
          ratio: [
            [2020, 28],
            [2025, 30]
          ]
        }
      },
      migration: {
        value: 0.5,
        score: 80,
        rank: 348,
        series: {
          net: [
            [2022, 510],
            [2023, 515],
            [2024, 520]
          ],
          inflow: [
            [2022, 5010],
            [2023, 5015],
            [2024, 5020]
          ],
          outflow: [
            [2022, 4500],
            [2023, 4500],
            [2024, 4500]
          ]
        }
      },
      business: {
        value: 39.6,
        score: 40,
        rank: 1045,
        series: {
          establishments: [
            [2016, 3900],
            [2021, 4000]
          ]
        }
      },
      employment: {
        value: 4.5,
        score: 20,
        rank: 348,
        series: {
          unemployment: [
            [2015, 4],
            [2020, 4.5]
          ]
        }
      },
      income: {
        value: 350,
        score: 60,
        rank: 696,
        series: {
          perTaxpayer: [
            [2019, 340],
            [2024, 350]
          ]
        }
      },
      fiscal: {
        value: 0.8,
        score: 85,
        rank: 261,
        series: {
          index: [
            [2017, 0.7],
            [2022, 0.8]
          ]
        }
      }
    },
    facts: fixtureFacts(),
    ...overrides
  };
}

/** 指定した指標を欠損にした架空の市区町村を作る。 */
export function withMissing(area: AreaRecord, keys: IndicatorKey[]): AreaRecord {
  const indicators = { ...area.indicators };
  for (const key of keys) {
    indicators[key] = { value: null, score: null, rank: null, series: {}, missing: "not-published" };
  }
  return { ...area, indicators };
}

export const fixtureIndex: AreaIndex = {
  prefectures: Array.from({ length: 47 }, (_, index) => {
    const code = String(index + 1).padStart(2, "0");
    const names: Record<string, string> = { "13": "東京都", "14": "神奈川県", "16": "富山県", "34": "広島県" };
    return { code, name: names[code] ?? `第${index + 1}県` };
  }),
  areas: [
    { code: "13101", name: "千代田区", kana: "ちよだく", prefCode: "13", kind: "special-ward" },
    { code: "13206", name: "府中市", kana: "ふちゅうし", prefCode: "13", kind: "city" },
    { code: "14100", name: "横浜市", kana: "よこはまし", prefCode: "14", kind: "designated-city" },
    { code: "14117", name: "青葉区", kana: "あおばく", prefCode: "14", parentName: "横浜市", kind: "ward" },
    { code: "16210", name: "南砺市", kana: "なんとし", prefCode: "16", kind: "city" },
    { code: "34208", name: "府中市", kana: "ふちゅうし", prefCode: "34", kind: "city" },
    { code: "34309", name: "府中町", kana: "ふちゅうちょう", prefCode: "34", kind: "town" }
  ]
};

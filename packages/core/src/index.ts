import type { AreaSignal, IndicatorKey, NeighborComparison, SourceAttribution } from "@local-signal-japan/schemas";

const retrievedAt = "2026-05-09";

const mockSource = (
  sourceName: string,
  sourceUrlLabel: string,
  licenseNote = "架空デモデータ。実在統計ではありません。"
): SourceAttribution => ({
  sourceName,
  sourceUrlLabel,
  retrievedAt,
  publishedAt: "demo-only",
  licenseNote,
  attribution: "Local Signal Japan demo fixture",
  isMock: true
});

export const indicatorLabels: Record<IndicatorKey, string> = {
  population: "人口推移",
  agingRate: "高齢化率",
  migration: "転入・転出シグナル",
  landPrice: "地価推移",
  corporateActivity: "法人活動シグナル",
  procurementActivity: "公共案件シグナル",
  employment: "雇用関連シグナル"
};

export const mockAreaSignals: AreaSignal[] = [
  {
    areaCode: "13101",
    areaName: "千代田区",
    prefectureName: "東京都",
    retrievedAt,
    indicators: {
      population: {
        label: indicatorLabels.population,
        value: "居住人口は緩やかな増加傾向",
        unit: "mock",
        score: 72,
        trend: "up",
        notes: [
          "昼間人口を含まない架空の居住人口サンプルです。",
          "実データ利用時は国勢調査と住民基本台帳の差異を分けて表示します。"
        ],
        sources: [mockSource("Mock e-Stat population", "mock://estat/population/13101")]
      },
      agingRate: {
        label: indicatorLabels.agingRate,
        value: "23.4",
        unit: "%",
        score: 58,
        trend: "flat",
        notes: [
          "年齢構成の評価は単独で地域の良し悪しを示すものではありません。",
          "医療・福祉需要の見込み確認に使う補助指標です。"
        ],
        sources: [mockSource("Mock age structure", "mock://estat/age/13101")]
      },
      migration: {
        label: indicatorLabels.migration,
        value: "転入超過のサンプル",
        score: 68,
        trend: "up",
        notes: [
          "転入・転出は年次変動が大きいため、3年平均で見る設計です。",
          "検索履歴や入力値は保存しません。"
        ],
        sources: [mockSource("Mock migration ledger", "mock://estat/migration/13101")]
      },
      landPrice: {
        label: indicatorLabels.landPrice,
        value: "商業地点の上昇シグナル",
        score: 79,
        trend: "up",
        notes: [
          "地価は地点特性に強く影響されるため、用途地域別に分ける余地があります。",
          "この値は架空のデモ値です。"
        ],
        sources: [mockSource("Mock real estate library", "mock://real-estate/price/13101")]
      },
      corporateActivity: {
        label: indicatorLabels.corporateActivity,
        value: "新設法人の増加サンプル",
        score: 74,
        trend: "up",
        notes: [
          "法人活動は本店移転、支店設置、清算を分けて扱う予定です。",
          "実在する会社情報は保存しない前提です。"
        ],
        sources: [mockSource("Mock gBizINFO", "mock://gbizinfo/corporate/13101")]
      },
      procurementActivity: {
        label: indicatorLabels.procurementActivity,
        value: "公共案件は中程度",
        score: 52,
        trend: "flat",
        notes: [
          "入札・落札データは公開範囲と取得日時を明示します。",
          "少額案件や随意契約の扱いはデータソースごとに注意が必要です。"
        ],
        sources: [mockSource("Mock procurement portal", "mock://procurement/awards/13101")]
      },
      employment: {
        label: indicatorLabels.employment,
        value: "求人関連は確認継続",
        score: 61,
        trend: "flat",
        notes: [
          "雇用指標は産業構成と通勤圏を合わせて確認する必要があります。",
          "MVPでは架空データのみ表示します。"
        ],
        sources: [mockSource("Mock employment fixture", "mock://employment/13101")]
      }
    },
    summary: {
      growthSignals: [
        "公開データ上は法人活動と地価に強めのシグナルがあります。",
        "人口・転入のサンプル指標は緩やかな増加方向を示します。"
      ],
      stagnationSignals: [
        "公共案件は中程度で、単独では強い方向性を示していません。"
      ],
      cautionSignals: [
        "昼間人口の影響が大きい地域では居住人口だけで判断しないでください。",
        "地価指標は地点構成に左右されます。"
      ],
      missingDataNotes: [
        "実データconnectorは未接続です。",
        "雇用関連の公開データはMVPでは架空値です。"
      ],
      confidence: "medium"
    }
  },
  {
    areaCode: "14117",
    areaName: "青葉区",
    prefectureName: "神奈川県横浜市",
    retrievedAt,
    indicators: {
      population: {
        label: indicatorLabels.population,
        value: "横ばいから微減のサンプル",
        unit: "mock",
        score: 49,
        trend: "flat",
        notes: ["住宅地中心の架空サンプルです。"],
        sources: [mockSource("Mock e-Stat population", "mock://estat/population/14117")]
      },
      agingRate: {
        label: indicatorLabels.agingRate,
        value: "27.8",
        unit: "%",
        score: 43,
        trend: "up",
        notes: ["高齢化率は需要構造の変化を示す補助指標です。"],
        sources: [mockSource("Mock age structure", "mock://estat/age/14117")]
      },
      migration: {
        label: indicatorLabels.migration,
        value: "転出入は均衡",
        score: 51,
        trend: "flat",
        notes: ["年次差が大きいため複数年平均での確認が必要です。"],
        sources: [mockSource("Mock migration ledger", "mock://estat/migration/14117")]
      },
      landPrice: {
        label: indicatorLabels.landPrice,
        value: "住宅地点は安定",
        score: 55,
        trend: "flat",
        notes: ["用途別の地点構成に注意してください。"],
        sources: [mockSource("Mock real estate library", "mock://real-estate/price/14117")]
      },
      corporateActivity: {
        label: indicatorLabels.corporateActivity,
        value: "小規模法人活動のサンプル",
        score: 48,
        trend: "flat",
        notes: ["実在法人名は表示しない設計です。"],
        sources: [mockSource("Mock gBizINFO", "mock://gbizinfo/corporate/14117")]
      },
      procurementActivity: {
        label: indicatorLabels.procurementActivity,
        value: null,
        score: undefined,
        trend: "unknown",
        notes: ["このデモでは公共案件データを欠損として扱います。"],
        sources: [mockSource("Mock procurement portal", "mock://procurement/awards/14117")]
      },
      employment: {
        label: indicatorLabels.employment,
        value: "雇用関連は近隣圏と一体確認",
        score: 50,
        trend: "flat",
        notes: ["通勤圏をまたぐため自治体単独の解釈には注意が必要です。"],
        sources: [mockSource("Mock employment fixture", "mock://employment/14117")]
      }
    },
    summary: {
      growthSignals: ["地価と雇用関連は安定寄りのサンプルです。"],
      stagnationSignals: ["人口・転入転出は強い方向性を示していません。"],
      cautionSignals: ["公共案件データが欠損しています。"],
      missingDataNotes: ["公共案件データはデモ上の欠損です。"],
      confidence: "low"
    }
  },
  {
    areaCode: "16210",
    areaName: "南砺市",
    prefectureName: "富山県",
    retrievedAt,
    indicators: {
      population: {
        label: indicatorLabels.population,
        value: "人口減少のサンプル",
        unit: "mock",
        score: 38,
        trend: "down",
        notes: [
          "人口減少は地域の価値判断ではなく、需要構造の変化を読むための指標です。"
        ],
        sources: [mockSource("Mock e-Stat population", "mock://estat/population/16210")]
      },
      agingRate: {
        label: indicatorLabels.agingRate,
        value: "35.6",
        unit: "%",
        score: 36,
        trend: "up",
        notes: ["医療・交通・生活サービスの需給確認に使う補助指標です。"],
        sources: [mockSource("Mock age structure", "mock://estat/age/16210")]
      },
      migration: {
        label: indicatorLabels.migration,
        value: "転出超過のサンプル",
        score: 34,
        trend: "down",
        notes: ["移住施策や通勤圏の影響を合わせて確認する必要があります。"],
        sources: [mockSource("Mock migration ledger", "mock://estat/migration/16210")]
      },
      landPrice: {
        label: indicatorLabels.landPrice,
        value: "地点によりばらつき",
        score: 42,
        trend: "flat",
        notes: ["観光地・住宅地・工業地を分けて見る必要があります。"],
        sources: [mockSource("Mock real estate library", "mock://real-estate/price/16210")]
      },
      corporateActivity: {
        label: indicatorLabels.corporateActivity,
        value: "地域産業は安定のサンプル",
        score: 57,
        trend: "flat",
        notes: ["法人活動は業種別に分解すると解釈しやすくなります。"],
        sources: [mockSource("Mock gBizINFO", "mock://gbizinfo/corporate/16210")]
      },
      procurementActivity: {
        label: indicatorLabels.procurementActivity,
        value: "公共案件は相対的に強め",
        score: 64,
        trend: "up",
        notes: ["公共案件は年度ごとの予算に左右されます。"],
        sources: [mockSource("Mock procurement portal", "mock://procurement/awards/16210")]
      },
      employment: {
        label: indicatorLabels.employment,
        value: "職種偏りのサンプル",
        score: 46,
        trend: "flat",
        notes: ["求人指標は産業構成と季節性に注意が必要です。"],
        sources: [mockSource("Mock employment fixture", "mock://employment/16210")]
      }
    },
    summary: {
      growthSignals: ["公共案件と一部法人活動に確認すべきシグナルがあります。"],
      stagnationSignals: ["人口・転入転出は弱めのサンプル値です。"],
      cautionSignals: [
        "人口指標だけで地域を低評価しない設計にしています。",
        "観光・産業・広域交通の情報が未接続です。"
      ],
      missingDataNotes: ["観光関連と交通関連のconnectorは未実装です。"],
      confidence: "low"
    }
  }
];

export const neighborComparisons: NeighborComparison[] = [
  {
    areaCode: "13101",
    areaName: "千代田区",
    prefectureName: "東京都",
    populationScore: 72,
    landPriceScore: 79,
    activityScore: 69,
    overallScore: 66,
    isSelected: true
  },
  {
    areaCode: "13102",
    areaName: "中央区",
    prefectureName: "東京都",
    populationScore: 70,
    landPriceScore: 76,
    activityScore: 67,
    overallScore: 64,
    isSelected: false
  },
  {
    areaCode: "13103",
    areaName: "港区",
    prefectureName: "東京都",
    populationScore: 69,
    landPriceScore: 82,
    activityScore: 73,
    overallScore: 69,
    isSelected: false
  }
];

export function getDefaultAreaSignal(): AreaSignal {
  return mockAreaSignals[0];
}

export function findAreaSignal(query: string): AreaSignal | undefined {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  return mockAreaSignals.find((area) => {
    return (
      area.areaCode === normalized ||
      area.areaName.toLowerCase().includes(normalized) ||
      `${area.prefectureName}${area.areaName}`.toLowerCase().includes(normalized)
    );
  });
}

export function listAreaOptions(): Array<Pick<AreaSignal, "areaCode" | "areaName" | "prefectureName">> {
  return mockAreaSignals.map(({ areaCode, areaName, prefectureName }) => ({
    areaCode,
    areaName,
    prefectureName
  }));
}

export function getIndicatorEntries(area: AreaSignal) {
  return Object.entries(area.indicators).filter((entry): entry is [IndicatorKey, NonNullable<AreaSignal["indicators"][IndicatorKey]>] => {
    return Boolean(entry[1]);
  });
}

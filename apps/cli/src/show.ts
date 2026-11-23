import {
  FACT_GROUPS,
  FACT_KEYS,
  FACTS,
  findHighlights,
  formatFact,
  formatNumber,
  formatYen,
  toNationalRow,
  type AreaRecord,
  type FactDefinition,
  type FactGroupId,
  type FactKey,
  type Highlight,
  type Manifest,
  type NationalRow
} from "@local-signal-japan/core";
import { FURUSATO_SOURCE_ID } from "./screen";

/** show で出す、くらしの指標1つぶん。 */
export type ShownFact = {
  label: string;
  group: FactGroupId;
  /** 「円」は金額（value は円の数値）。 */
  unit: string;
  value: number | null;
  /** 単位つきで書いた値。金額は「18.9億円」のように書く。欠損は null。 */
  valueText: string | null;
  period: string;
  /** 政令指定都市の区を除く市区町村の中で、値が大きい順の順位。区と欠損は null。 */
  rank: number | null;
  /** 順位の母数（値がある市区町村の数）。 */
  rankTotal: number;
  provider: FactDefinition["provider"];
  /** 値を求めたもとの数。 */
  basis: Record<string, { label: string; unit: string; value: number }>;
  /** 値がない理由。 */
  missingText?: string;
};

/** 値がない理由（画面の「くらしの指標」と同じ書き方）。 */
export function factMissingText(area: Pick<AreaRecord, "kind">, definition: FactDefinition): string {
  if (area.kind === "ward" && definition.provider === "furusato") return "市全体の値だけが公表されています";
  if (definition.key === "vacancy" || definition.key === "floorArea") return "この調査の集計の対象外です";
  return "値が公表されていません";
}

export function buildShownFacts(area: AreaRecord, manifest: Manifest): Record<FactKey, ShownFact> {
  return Object.fromEntries(
    FACT_KEYS.map((key): [FactKey, ShownFact] => {
      const definition = FACTS[key];
      const fact = area.facts[key];
      const basis = Object.fromEntries(
        Object.entries(definition.basis).flatMap(([name, { label, unit }]) => {
          const value = fact.basis[name];
          return value === undefined ? [] : [[name, { label, unit, value }]];
        })
      );
      return [
        key,
        {
          label: definition.label,
          group: definition.group,
          unit: definition.unit,
          value: fact.value,
          valueText: fact.value === null ? null : formatFact(definition, fact.value),
          period: manifest.facts[key].period,
          rank: fact.rank,
          rankTotal: manifest.facts[key].distribution.count,
          provider: definition.provider,
          basis,
          ...(fact.value === null ? { missingText: factMissingText(area, definition) } : {})
        }
      ];
    })
  ) as Record<FactKey, ShownFact>;
}

/** 全国の上位・下位10位以内に入る項目。政令指定都市の区は全国の比較に含めないので空。 */
export function buildHighlights(area: AreaRecord, rows: readonly NationalRow[], manifest: Manifest): Highlight[] {
  if (area.kind === "ward") return [];
  const target = rows.find((row) => row.code === area.code) ?? toNationalRow(area);
  return findHighlights(target, rows, manifest);
}

/** もとの数を、単位に合わせて書く。 */
function basisText(unit: string, value: number): string {
  if (unit === "円") return formatYen(value);
  if (unit === "%" || unit === "年" || unit === "㎡") return `${formatNumber(value, 1)}${unit}`;
  return `${formatNumber(value)}${unit}`;
}

function factLine(fact: ShownFact): string {
  if (fact.value === null || fact.valueText === null) {
    return `- ${fact.label}: 欠損（${fact.missingText ?? "値が公表されていません"}、${fact.period}）`;
  }
  const rank = fact.rank === null ? "順位なし" : `全国${formatNumber(fact.rank)}位/${formatNumber(fact.rankTotal)}`;
  // もとの数が2つ以上ある指標だけ、「外国人住民 4,108人／住民 68,835人」のように添える。
  const basis = Object.values(fact.basis);
  const basisNote =
    basis.length < 2 ? "" : ` … ${basis.map((item) => `${item.label} ${basisText(item.unit, item.value)}`).join("／")}`;
  return `- ${fact.label}: ${fact.valueText}（${fact.period}、${rank}）${basisNote}`;
}

/** くらしの指標を分野ごとに並べた行。 */
export function factLines(facts: Record<FactKey, ShownFact>, manifest: Manifest): string[] {
  const furusato = manifest.additionalSources.find((source) => source.id === FURUSATO_SOURCE_ID);
  return [
    "くらしの指標（値・基準時点・全国順位。補助スコアには含めていません）:",
    ...FACT_GROUPS.flatMap((group) => [
      `[${group.label}]${group.id === "furusato" && furusato ? `（出典: ${furusato.name}）` : ""}`,
      ...FACT_KEYS.filter((key) => FACTS[key].group === group.id).map((key) => factLine(facts[key]))
    ]),
    "全国順位は、政令指定都市の区を除く市区町村のうち値があるものの中で、値が大きい順に数えたもの（同じ値は同順位）で、良し悪しの順ではありません。"
  ];
}

/** 全国で目立つところの行。 */
export function highlightLines(area: Pick<AreaRecord, "kind">, highlights: readonly Highlight[]): string[] {
  const items =
    area.kind === "ward"
      ? ["- 政令指定都市の区は、市全体と重なるため全国の比較に含めていません。"]
      : highlights.length === 0
        ? ["- 該当なし（全国の上位・下位10位以内に入る項目はありません）"]
        : highlights.map((item) => `- ${item.label}が${item.phrase}（${item.valueText}、${item.period}）`);
  return [
    "全国で目立つところ（全国の上位・下位10位以内に入る項目を決まった規則で抜き出したもので、良し悪しの判断ではありません）:",
    ...items
  ];
}

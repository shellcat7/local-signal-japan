import {
  AREA_KIND_LABELS,
  areaLocalName,
  drawArea,
  findTraits,
  formatNumber,
  type AreaIndex,
  type AreaKind,
  type Manifest,
  type NationalRow,
  type Trait
} from "@local-signal-japan/core";
import { CliError } from "./errors";
import { attributionLines, resolvePrefecture, toReadableJson } from "./screen";

/** まちくじの結果。 */
export type KujiResult = {
  area: {
    code: string;
    name: string;
    prefName: string;
    kind: AreaKind;
    population: number | null;
    /** 政令指定都市の区を除く市区町村の中で、人口の多いほうからの順位。 */
    populationRank: number | null;
  };
  /** くじの対象にした範囲（都道府県名か「全国」）と、その市区町村の数。 */
  scope: { name: string; count: number };
  traits: Trait[];
  manifest: Manifest;
};

/** 画面のまちくじと同じ規則で1つを引き、目立つところを3つまで選ぶ。 */
export function runKuji(
  rows: readonly NationalRow[],
  index: AreaIndex,
  manifest: Manifest,
  options: { pref?: string; random?: () => number } = {}
): KujiResult {
  const pref = options.pref === undefined ? null : resolvePrefecture(index.prefectures, options.pref);
  const reference = rows.filter((row) => row.kind !== "ward");
  const pool = reference.filter((row) => pref === null || row.prefCode === pref.code);
  const picked = drawArea(pool, { random: options.random });
  if (!picked) throw new CliError("くじの対象になる市区町村がありません。");

  const prefName = index.prefectures.find((item) => item.code === picked.prefCode)?.name ?? "";
  const population = picked.population;
  return {
    area: {
      code: picked.code,
      name: areaLocalName(picked),
      prefName,
      kind: picked.kind,
      population,
      populationRank:
        population === null
          ? null
          : 1 + reference.filter((row) => row.population !== null && row.population > population).length
    },
    scope: { name: pref?.name ?? "全国", count: pool.length },
    traits: findTraits(picked, rows, manifest, prefName, 3, { friendly: true }),
    manifest
  };
}

const usesFurusato = (result: KujiResult) => result.traits.some((trait) => trait.key.startsWith("furusato"));

export function renderKujiText(result: KujiResult, total: number): string {
  const { area, manifest } = result;
  const population =
    area.population === null
      ? "人口: 欠損"
      : `人口: ${formatNumber(area.population)}人${
          area.populationRank === null
            ? ""
            : `（全国${formatNumber(total)}のうち、人口の多いほうから${formatNumber(area.populationRank)}番目）`
        }`;
  return `${[
    `まちくじ（${result.scope.name}の${formatNumber(result.scope.count)}市区町村から1つ）`,
    "",
    `${area.prefName} ${area.name}（${area.code}、${AREA_KIND_LABELS[area.kind]}）`,
    population,
    "",
    "目立つところ:",
    ...result.traits.map((trait) => `- ${trait.label}が${trait.phrase}: ${trait.valueText}（${trait.period}）`),
    "",
    "目立つところは決まった規則で選んでいます（全国で上位・下位10位以内、都道府県の中で最も大きい・小さい、",
    "全国で上位・下位5%以内、都道府県の中で3位以内の順）。良し悪しを表すものではありません。",
    `くわしく: pnpm localsignal show ${area.code}`,
    "",
    ...attributionLines(
      { ...manifest.source, fetchedAt: manifest.generatedAt },
      manifest.additionalSources,
      usesFurusato(result)
    )
  ].join("\n")}\n`;
}

export function renderKujiJson(result: KujiResult): string {
  const { manifest, ...rest } = result;
  return `${toReadableJson({
    ...rest,
    source: manifest.source,
    additionalSources: usesFurusato(result) ? manifest.additionalSources : []
  })}\n`;
}

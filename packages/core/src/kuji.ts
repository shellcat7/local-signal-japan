import {
  describeMetric,
  HIGHLIGHT_EXCLUDED,
  HIGHLIGHT_MIN_POPULATION,
  HIGHLIGHT_WITHIN,
  type Highlight
} from "./highlights";
import { FACT_KEYS, INDICATOR_KEYS, type AreaKind, type MetricKey } from "./model";
import { rowMetricValue } from "./national";
import type { Manifest, NationalRow } from "./schema";

/**
 * まちくじ: 全国の市区町村から1つを引き、そのまちが全国や都道府県の中で目立つ項目を示す。
 * 「全国で目立つところ」（上位・下位10位以内）だけでは多くの町村で何も出ないので、
 * 都道府県の中での順位と、全国の上位・下位5%も使う。どれも決まった規則で選ぶだけで、良し悪しは判断しない。
 */

/** 都道府県の中で順位を言うのに必要な、比べる市区町村の数。これより少ないときは県内の順位を言わない。 */
export const TRAIT_MIN_PREF_POOL = 10;
/** 全国で「◯番目」と言う範囲（比べた市区町村の数に対する割合。同じ値の市区町村も数える）。 */
export const TRAIT_NATIONAL_SHARE = 0.05;
/** 都道府県の中で「◯番目」と言う範囲（同じ値の市区町村も数える）。 */
export const TRAIT_PREF_WITHIN = 3;

/** 総額の項目。少ない側は人口の少なさを言うだけになるので、多い側だけを拾う。 */
const HIGH_SIDE_ONLY: ReadonlySet<MetricKey> = new Set(["furusatoReceipts", "furusatoOutflow"]);

export type TraitScope = "national" | "prefecture";

export type Trait = Omit<Highlight, "phrase"> & {
  scope: TraitScope;
  /** 例: 「全国で最も高い」「群馬県で2番目に多い」「全国で48番目に長い」 */
  phrase: string;
};

type Side = "high" | "low";
type Standing = { side: Side; rank: number; total: number };

/**
 * 値が、並べた値のどちらかの端から `within` 以内（同じ値の市区町村も数える）にあるか。
 * 大きい側を先に見る。順位は、その側から数えて自分より端にある数 + 1（同じ値は同順位）。
 */
function standingWithin(values: readonly number[], value: number, within: number, highOnly = false): Standing | null {
  const atLeast = values.filter((candidate) => candidate >= value).length;
  const atMost = values.filter((candidate) => candidate <= value).length;
  const side: Side | null = atLeast <= within ? "high" : !highOnly && atMost <= within ? "low" : null;
  if (side === null) return null;
  const rank = 1 + values.filter((candidate) => (side === "high" ? candidate > value : candidate < value)).length;
  return { side, rank, total: values.length };
}

/** 端からの近さ（0 に近いほど端）。同じ値の市区町村も数える。 */
function extremity(
  values: readonly number[],
  value: number,
  highOnly = false
): { side: Side; share: number; tied: number } {
  const atLeast = values.filter((candidate) => candidate >= value).length;
  const atMost = values.filter((candidate) => candidate <= value).length;
  const tied = atLeast + atMost - values.length;
  return highOnly || atLeast <= atMost
    ? { side: "high", share: atLeast / values.length, tied }
    : { side: "low", share: atMost / values.length, tied };
}

/** 最後の手段で示すときに、同じ値の市区町村がこれより多い指標は使わない（順位が意味を持たないため）。 */
const FALLBACK_MAX_TIED_SHARE = 0.01;

type Candidate = Trait & { tier: number; share: number; order: number };

/**
 * そのまちの特徴を、目立つ順に返す。1つの指標からは1つだけ。
 *  1. 全国で上位・下位10位以内（「全国で目立つところ」と同じ規則）
 *  2. 都道府県の中で最も大きい・小さい
 *  3. 全国で上位・下位5%以内
 *  4. 都道府県の中で3位以内
 * どれにも当たらないときは、全国で最も端に近い指標を1つだけ返す（同じ値の市区町村が多い指標は使わない）。
 * 受入額・控除額のような総額の項目は、多い側だけを拾う（少ない側は人口の少なさを言うだけになるため）。
 * 人口の少ない市区町村で大きく動く指標は、人口1万人以上の市区町村の中で比べ、対象も1万人以上に限る。
 */
export function findTraits(
  target: NationalRow,
  rows: readonly NationalRow[],
  manifest: Manifest,
  prefName: string,
  limit = 3
): Trait[] {
  if (target.kind === "ward") return [];
  const reference = rows.filter((row) => row.kind !== "ward");
  const candidates: Candidate[] = [];
  let fallback: Candidate | null = null;

  ([...INDICATOR_KEYS, ...FACT_KEYS] as MetricKey[]).forEach((key, order) => {
    if (HIGHLIGHT_EXCLUDED.has(key)) return;
    const value = rowMetricValue(target, key);
    if (value === null) return;
    const { label, words, valueText, period, limited } = describeMetric(key, value, manifest);
    if (limited && (target.population === null || target.population < HIGHLIGHT_MIN_POPULATION)) return;

    const compared = reference.filter(
      (row) => !limited || (row.population !== null && row.population >= HIGHLIGHT_MIN_POPULATION)
    );
    const national = compared.map((row) => rowMetricValue(row, key)).filter((candidate) => candidate !== null);
    const inPref = compared
      .filter((row) => row.prefCode === target.prefCode)
      .map((row) => rowMetricValue(row, key))
      .filter((candidate) => candidate !== null);
    const prefOk = inPref.length >= TRAIT_MIN_PREF_POOL;
    const highOnly = HIGH_SIDE_ONLY.has(key);

    const tiers: Array<[TraitScope, Standing | null]> = [
      ["national", standingWithin(national, value, HIGHLIGHT_WITHIN, highOnly)],
      ["prefecture", prefOk ? standingWithin(inPref, value, 1, highOnly) : null],
      ["national", standingWithin(national, value, Math.floor(national.length * TRAIT_NATIONAL_SHARE), highOnly)],
      ["prefecture", prefOk ? standingWithin(inPref, value, TRAIT_PREF_WITHIN, highOnly) : null]
    ];
    const tier = tiers.findIndex(([, found]) => found !== null);
    const { side: nearSide, share, tied } = extremity(national, value, highOnly);

    const make = (scope: TraitScope, found: Standing, tierIndex: number): Candidate => {
      const where =
        scope === "national"
          ? limited
            ? "人口1万人以上の市区町村で"
            : "全国で"
          : limited
            ? `${prefName}の人口1万人以上の市区町村で`
            : `${prefName}で`;
      const ordinal = found.rank === 1 ? "最も" : `${found.rank}番目に`;
      return {
        key,
        scope,
        side: found.side,
        rank: found.rank,
        total: found.total,
        limited,
        label,
        valueText,
        period,
        phrase: `${where}${ordinal}${words[found.side]}`,
        tier: tierIndex,
        share,
        order
      };
    };

    if (tier >= 0) {
      const [scope, found] = tiers[tier] as [TraitScope, Standing];
      candidates.push(make(scope, found, tier));
      return;
    }
    const fallbackOk = !highOnly && tied <= Math.max(1, national.length * FALLBACK_MAX_TIED_SHARE);
    if (fallbackOk && (fallback === null || share < fallback.share)) {
      const rank =
        1 + national.filter((candidate) => (nearSide === "high" ? candidate > value : candidate < value)).length;
      fallback = make("national", { side: nearSide, rank, total: national.length }, tiers.length);
    }
  });

  const picked = candidates.length > 0 ? candidates : fallback ? [fallback] : [];
  return picked
    .sort((a, b) => a.tier - b.tier || a.rank - b.rank || a.share - b.share || a.order - b.order)
    .slice(0, limit)
    .map(({ tier: _tier, share: _share, order: _order, ...trait }) => trait);
}

/** くじの対象（政令指定都市の区は、市全体と重なるので除く）。都道府県を指定すると、その中だけ。 */
export function kujiPool<T extends { prefCode: string; kind: AreaKind }>(
  entries: readonly T[],
  prefCode: string | null = null
): T[] {
  return entries.filter((entry) => entry.kind !== "ward" && (prefCode === null || entry.prefCode === prefCode));
}

/**
 * くじを引く。直前に引いた市区町村（`exclude`）は、ほかに候補があるかぎり出さない。
 * 乱数は差し替えられる（テストで結果を決めるため）。
 */
export function drawArea<T extends { code: string; prefCode: string; kind: AreaKind }>(
  entries: readonly T[],
  options: { prefCode?: string | null; exclude?: string | null; random?: () => number } = {}
): T | null {
  const pool = kujiPool(entries, options.prefCode ?? null);
  const candidates = pool.length > 1 ? pool.filter((entry) => entry.code !== options.exclude) : pool;
  if (candidates.length === 0) return null;
  const random = options.random ?? Math.random;
  const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
  return candidates[index] ?? null;
}

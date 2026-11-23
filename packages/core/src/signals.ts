import { formatNumber, formatYear } from "./format";
import { LOWER_BAND_MAX, SMALL_POPULATION, UPPER_BAND_MIN } from "./scoring";
import type { Manifest } from "./schema";
import type { AreaView, IndicatorView } from "./view";

export type AreaSummary = {
  /** 補助スコアが上位帯(全国の上位3分の1)の指標。 */
  upperSignals: string[];
  /** 補助スコアが下位帯(全国の下位3分の1)の指標。 */
  lowerSignals: string[];
  /** 数字を読むときの注意。 */
  cautionSignals: string[];
  /** 算出できなかった指標とその理由。 */
  missingDataNotes: string[];
};

/**
 * シグナルの見出し。画面・レポート・CLIで同じ文言を使う。
 * 人口が減っていても全国の中では上位、ということがあるため、
 * 「成長」「停滞」のような方向を決めつける言葉ではなく、全国の中での位置で呼ぶ。
 */
export const SUMMARY_SECTIONS = [
  { key: "upperSignals", title: "補助スコアが上位の指標", note: `全国の上位3分の1（${UPPER_BAND_MIN}以上）` },
  { key: "lowerSignals", title: "補助スコアが下位の指標", note: `全国の下位3分の1（${LOWER_BAND_MAX}以下）` },
  { key: "cautionSignals", title: "読み取り時の注意", note: "数字を読む前に確認したい点" },
  { key: "missingDataNotes", title: "欠損データ", note: "算出できなかった指標" }
] as const satisfies ReadonlyArray<{ key: keyof AreaSummary; title: string; note: string }>;

/** 昼間の流入が大きいとみなす昼夜間人口比率（%）。 */
export const DAYTIME_INFLOW_RATIO = 130;
/** 昼間の流出が大きいとみなす昼夜間人口比率（%）。 */
export const DAYTIME_OUTFLOW_RATIO = 85;
/** 基準年がこの年数以上前の指標は「古い」と注記する。 */
export const STALE_AFTER_YEARS = 4;

function positionPhrase(indicator: IndicatorView): string {
  if (indicator.position === null) return "";

  // position は値の大小での位置。50 を境に、近いほうの端から数える。
  const fromTop = indicator.position >= 50;
  const share = Math.max(1, Math.round(fromTop ? 100 - indicator.position : indicator.position));
  return `全国の市区町村で値が${fromTop ? "大きい" : "小さい"}ほうから約${share}%以内の水準です。`;
}

function signalSentence(indicator: IndicatorView): string {
  return `${indicator.definition.metricLabel}は${indicator.valueText}（${indicator.periodText}）。${positionPhrase(indicator)}`;
}

function buildCautions(view: AreaView, manifest: Manifest): string[] {
  const { area } = view;
  const cautions: string[] = [];
  const daytimeYear = formatYear(manifest.context.daytimeRatio.latestYear);

  if (area.daytimeRatio !== null && area.daytimeRatio >= DAYTIME_INFLOW_RATIO) {
    cautions.push(
      `昼夜間人口比率が${formatNumber(area.daytimeRatio, 1)}%（${daytimeYear}）で、通勤・通学による昼間の流入が大きい地域です。居住人口を基準にした指標だけでは活動の規模を捉えにくい点に注意してください。`
    );
  } else if (area.daytimeRatio !== null && area.daytimeRatio <= DAYTIME_OUTFLOW_RATIO) {
    cautions.push(
      `昼夜間人口比率が${formatNumber(area.daytimeRatio, 1)}%（${daytimeYear}）で、通勤・通学で域外へ出る人が多い地域です。事業所や雇用の指標は通勤圏全体とあわせて確認してください。`
    );
  }

  if (area.population !== null && area.population < SMALL_POPULATION) {
    cautions.push(`人口が${formatNumber(area.population)}人と少なく、率で表す指標は少数の増減で大きく変動します。`);
  }

  const retrievedYear = new Date(manifest.generatedAt).getUTCFullYear();
  const stale = view.indicators.filter(
    (indicator) => indicator.available && retrievedYear - manifest.indicators[indicator.key].year >= STALE_AFTER_YEARS
  );
  if (stale.length > 0) {
    const list = stale.map((indicator) => `${indicator.definition.label}（${indicator.periodText}）`).join("、");
    cautions.push(`次の指標は基準時点が古く、現状と差がある可能性があります: ${list}。`);
  }

  if (area.kind === "ward") {
    cautions.push(
      `政令指定都市の区のため、区単位で収録されていない指標は市全体（${area.parentName ?? "所属する市"}）の値を参照してください。`
    );
  }

  return cautions;
}

/** 指標値と補助スコアから、決まった規則だけで文章のシグナルを組み立てる。 */
export function buildSummary(view: AreaView, manifest: Manifest): AreaSummary {
  return {
    upperSignals: view.indicators.filter((indicator) => indicator.band === "upper").map(signalSentence),
    lowerSignals: view.indicators.filter((indicator) => indicator.band === "lower").map(signalSentence),
    cautionSignals: buildCautions(view, manifest),
    missingDataNotes: view.indicators
      .filter((indicator) => indicator.missingText !== null)
      .map((indicator) => `${indicator.definition.label}: ${indicator.missingText}`)
  };
}

import type { AreaKind } from "./model";
import type { AreaIndexEntry, AreaRecord } from "./schema";

const formatters = new Map<string, Intl.NumberFormat>();

/** 日本語ロケールで桁区切りした数値文字列を返す。signed は 0 以外に符号を付ける。 */
export function formatNumber(value: number, decimals = 0, signed = false): string {
  const cacheKey = `${decimals}:${signed}`;
  let formatter = formatters.get(cacheKey);

  if (!formatter) {
    formatter = new Intl.NumberFormat("ja-JP", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      signDisplay: signed ? "exceptZero" : "auto"
    });
    formatters.set(cacheKey, formatter);
  }

  return formatter.format(value);
}

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  // + 0 で -0 を 0 に正規化する(JSON では区別されず、表示では「-0.0」になってしまうため)。
  return Math.round(value * factor) / factor + 0;
}

export function formatYear(year: number, cycle: "CY" | "FY" = "CY"): string {
  return cycle === "FY" ? `${year}年度` : `${year}年`;
}

const japanDateFormatter = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" });

/**
 * ISO 8601 の日時を、日本時間の日付（YYYY-MM-DD）にする。
 * 取得は日本時間の未明に行うことが多く、UTC のままだと1日前の日付になってしまう。
 */
export function formatDate(isoDateTime: string): string {
  return japanDateFormatter.format(new Date(isoDateTime));
}

/** 日本時間での年。 */
export function yearOf(isoDateTime: string): number {
  return Number(formatDate(isoDateTime).slice(0, 4));
}

export const AREA_KIND_LABELS: Record<AreaKind, string> = {
  "designated-city": "政令指定都市",
  city: "市",
  "special-ward": "特別区",
  ward: "政令指定都市の区",
  town: "町",
  village: "村"
};

type NamedArea = Pick<AreaIndexEntry, "name" | "parentName">;

/** 市区町村名（政令指定都市の区は市名を前置する）。例: 横浜市青葉区 */
export function areaLocalName(area: NamedArea): string {
  return `${area.parentName ?? ""}${area.name}`;
}

/** 都道府県名つきの表示名。例: 神奈川県 横浜市青葉区 */
export function areaFullName(area: Pick<AreaRecord, "name" | "parentName" | "prefName">): string {
  return `${area.prefName} ${areaLocalName(area)}`;
}

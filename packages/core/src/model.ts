/**
 * データセットの基本的な定数と型。
 * ブラウザ用のバンドルに検証ライブラリを含めないよう、zod に依存しない形でここに置く。
 */

/** データセットの形式バージョン。互換性のない変更をしたら上げる。 */
export const DATASET_SCHEMA_VERSION = 1;

export const INDICATOR_KEYS = [
  "population",
  "aging",
  "migration",
  "business",
  "employment",
  "income",
  "fiscal"
] as const;
export type IndicatorKey = (typeof INDICATOR_KEYS)[number];

export const AREA_KINDS = ["designated-city", "city", "special-ward", "ward", "town", "village"] as const;
export type AreaKind = (typeof AREA_KINDS)[number];

/**
 * 指標値が算出できない理由。
 * - not-published: 出典に最新基準年の値がない（区単位では公表されない統計など）
 * - insufficient-history: 比較に必要な過去時点の値がない（再編直後の区など）
 */
export const MISSING_REASONS = ["not-published", "insufficient-history"] as const;
export type MissingReason = (typeof MISSING_REASONS)[number];

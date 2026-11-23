/**
 * データセットの基本的な定数と型。
 * ブラウザ用のバンドルに検証ライブラリを含めないよう、zod に依存しない形でここに置く。
 */

/** データセットの形式バージョン。互換性のない変更をしたら上げる。 */
export const DATASET_SCHEMA_VERSION = 3;

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

/**
 * くらしの指標。補助スコアの対象にはせず、値と全国順位だけを示す。
 * 並び順は画面の表の並び（分野ごと）。
 */
export const FACT_KEYS = [
  "lifeFemale",
  "lifeMale",
  "projection2050",
  "foreignShare",
  "marriageRate",
  "birthRate",
  "elderlyAlone",
  "commuteRail",
  "commuteCar",
  "commuteBike",
  "commuteWalk",
  "vacancy",
  "floorArea",
  "doctors",
  "libraries",
  "garbage",
  "recycling",
  "furusatoReceipts",
  "furusatoPerCapita",
  "furusatoCostShare",
  "furusatoOutflow",
  "furusatoNet"
] as const;
export type FactKey = (typeof FACT_KEYS)[number];

/** 並べ替えや絞り込みに使える値（人口、総合補助スコア、7指標、くらしの指標）。 */
export type MetricKey = IndicatorKey | FactKey;

export const AREA_KINDS = ["designated-city", "city", "special-ward", "ward", "town", "village"] as const;
export type AreaKind = (typeof AREA_KINDS)[number];

/**
 * 指標値が算出できない理由。
 * - not-published: 出典に最新基準年の値がない（区単位では公表されない統計など）
 * - insufficient-history: 比較に必要な過去時点の値がない（再編直後の区など）
 */
export const MISSING_REASONS = ["not-published", "insufficient-history"] as const;
export type MissingReason = (typeof MISSING_REASONS)[number];

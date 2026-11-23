import { z } from "zod";
import {
  AREA_KINDS,
  DATASET_SCHEMA_VERSION,
  FACT_KEYS,
  INDICATOR_KEYS,
  MISSING_REASONS,
  type FactKey,
  type IndicatorKey
} from "./model";

const yearSchema = z.number().int().min(1900).max(2100);
const areaCodeSchema = z.string().regex(/^\d{5}$/);
const prefCodeSchema = z.string().regex(/^(0[1-9]|[1-3]\d|4[0-7])$/);

/** [西暦年, 値] */
export const seriesPointSchema = z.tuple([yearSchema, z.number()]);
export type SeriesPoint = z.infer<typeof seriesPointSchema>;
export type SeriesMap = Record<string, SeriesPoint[]>;

export const areaIndicatorSchema = z
  .object({
    /** スコア対象の指標値。算出できない場合は null。 */
    value: z.number().nullable(),
    /** 全国の市区町村内での位置（0〜100、方向をそろえたパーセンタイル）。 */
    score: z.number().int().min(0).max(100).nullable(),
    /**
     * 基準集団の中で、指標値が大きい順に数えた順位（同じ値は同順位）。
     * 指標値がない場合と、基準集団に入らない政令指定都市の区は null。
     */
    rank: z.number().int().positive().nullable(),
    /** 系列キー → 時系列。キーは指標定義の series[].key に対応する。 */
    series: z.record(z.string(), z.array(seriesPointSchema)),
    missing: z.enum(MISSING_REASONS).optional()
  })
  .refine((indicator) => indicator.value !== null || indicator.rank === null, {
    message: "value が null のときは rank も null でなければなりません"
  })
  .refine((indicator) => (indicator.value === null) === (indicator.score === null), {
    message: "value と score は両方 null か両方数値でなければなりません"
  })
  .refine((indicator) => (indicator.value === null) === (indicator.missing !== undefined), {
    message: "value が null のときだけ missing を指定します"
  });
export type AreaIndicator = z.infer<typeof areaIndicatorSchema>;

function indicatorShape<T extends z.ZodType>(schema: T): Record<IndicatorKey, T> {
  return Object.fromEntries(INDICATOR_KEYS.map((key) => [key, schema])) as Record<IndicatorKey, T>;
}

function factShape<T extends z.ZodType>(schema: T): Record<FactKey, T> {
  return Object.fromEntries(FACT_KEYS.map((key) => [key, schema])) as Record<FactKey, T>;
}

/** くらしの指標の値。補助スコアは持たない。 */
export const areaFactSchema = z
  .object({
    value: z.number().nullable(),
    /** 基準集団の中で、値が大きい順に数えた順位（同じ値は同順位）。区と欠損は null。 */
    rank: z.number().int().positive().nullable(),
    /** 値を求めたもとの数（検算と表示に使う）。キーは指標定義の basis に対応する。 */
    basis: z.record(z.string(), z.number())
  })
  .refine((fact) => fact.value !== null || fact.rank === null, {
    message: "value が null のときは rank も null でなければなりません"
  });
export type AreaFact = z.infer<typeof areaFactSchema>;

export const areaRecordSchema = z.object({
  code: areaCodeSchema,
  name: z.string().min(1),
  kana: z.string(),
  prefCode: prefCodeSchema,
  prefName: z.string().min(1),
  /** 政令指定都市の区の場合の市名（例: 横浜市）。 */
  parentName: z.string().min(1).optional(),
  kind: z.enum(AREA_KINDS),
  /** 文脈情報: 最新の住民基本台帳人口。 */
  population: z.number().int().nonnegative().nullable(),
  /** 文脈情報: 昼夜間人口比率（%）。 */
  daytimeRatio: z.number().positive().nullable(),
  indicators: z.object(indicatorShape(areaIndicatorSchema)),
  facts: z.object(factShape(areaFactSchema))
});
export type AreaRecord = z.infer<typeof areaRecordSchema>;

export const prefectureFileSchema = z.object({
  prefCode: prefCodeSchema,
  prefName: z.string().min(1),
  areas: z.array(areaRecordSchema).min(1)
});
export type PrefectureFile = z.infer<typeof prefectureFileSchema>;

export const areaIndexEntrySchema = z.object({
  code: areaCodeSchema,
  name: z.string().min(1),
  kana: z.string(),
  prefCode: prefCodeSchema,
  parentName: z.string().min(1).optional(),
  kind: z.enum(AREA_KINDS)
});
export type AreaIndexEntry = z.infer<typeof areaIndexEntrySchema>;

export const areaIndexSchema = z.object({
  prefectures: z.array(z.object({ code: prefCodeSchema, name: z.string().min(1) })).length(47),
  areas: z.array(areaIndexEntrySchema).min(1)
});
export type AreaIndex = z.infer<typeof areaIndexSchema>;

export const sourceSeriesSchema = z.object({
  /** 指標定義の upstream[].id に対応する。 */
  id: z.string().min(1),
  /** 統計ダッシュボードの系列コード（19桁）。 */
  code: z.string().regex(/^\d{19}$/),
  name: z.string().min(1),
  statName: z.string().min(1),
  unit: z.string(),
  cycle: z.enum(["CY", "FY"]),
  latestYear: yearSchema
});
export type SourceSeries = z.infer<typeof sourceSeriesSchema>;

export const distributionSchema = z.object({
  count: z.number().int().positive(),
  min: z.number(),
  p10: z.number(),
  p25: z.number(),
  p50: z.number(),
  p75: z.number(),
  p90: z.number(),
  max: z.number()
});
export type Distribution = z.infer<typeof distributionSchema>;

/**
 * 分布の形を描くための度数分布。
 * 極端な値で図がつぶれないよう、範囲は min〜max（基準集団の1%点〜99%点）に区切り、外側の値は両端の階級に数える。
 */
export const histogramSchema = z.object({
  min: z.number(),
  max: z.number(),
  counts: z.array(z.number().int().nonnegative()).min(2)
});
export type Histogram = z.infer<typeof histogramSchema>;

export const manifestIndicatorSchema = z.object({
  /** 指標値の基準年（全国で最新の年）。 */
  year: yearSchema,
  /** 基準集団（政令指定都市の区を除く市区町村）における指標値の分布。 */
  distribution: distributionSchema,
  histogram: histogramSchema,
  sources: z.array(sourceSeriesSchema).min(1)
});
export type ManifestIndicator = z.infer<typeof manifestIndicatorSchema>;

/** 統計ダッシュボード以外の出典の資料（ダウンロードしたファイル）。 */
export const sourceDocumentSchema = z.object({
  title: z.string().min(1),
  publisher: z.string().min(1),
  url: z.url()
});
export type SourceDocument = z.infer<typeof sourceDocumentSchema>;

export const manifestFactSchema = z.object({
  /** 基準年（年度の指標は年度）。 */
  year: yearSchema,
  /** 画面に出す基準時点の書き方。 */
  period: z.string().min(1),
  /** 基準集団（政令指定都市の区を除く）における値の分布。 */
  distribution: distributionSchema,
  /** 統計ダッシュボードの系列。 */
  sources: z.array(sourceSeriesSchema),
  /** それ以外の出典の資料。 */
  documents: z.array(sourceDocumentSchema)
});
export type ManifestFact = z.infer<typeof manifestFactSchema>;

/** 統計ダッシュボード以外の出典（出典の表示に使う）。 */
export const additionalSourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  url: z.url(),
  license: z.string().min(1),
  licenseUrl: z.url(),
  attribution: z.string().min(1)
});
export type AdditionalSource = z.infer<typeof additionalSourceSchema>;

export const manifestSchema = z.object({
  schemaVersion: z.literal(DATASET_SCHEMA_VERSION),
  /** 上流APIからの取得日時（UTC, ISO 8601）。 */
  generatedAt: z.iso.datetime(),
  source: z.object({
    name: z.string().min(1),
    url: z.url(),
    apiUrl: z.url(),
    license: z.string().min(1),
    licenseUrl: z.url(),
    attribution: z.string().min(1),
    credit: z.string().min(1)
  }),
  counts: z.object({
    areas: z.number().int().positive(),
    referenceAreas: z.number().int().positive()
  }),
  /** 統計ダッシュボード以外の出典。 */
  additionalSources: z.array(additionalSourceSchema),
  context: z.object({
    daytimeRatio: sourceSeriesSchema
  }),
  indicators: z.object(indicatorShape(manifestIndicatorSchema)),
  facts: z.object(factShape(manifestFactSchema))
});
export type Manifest = z.infer<typeof manifestSchema>;

/**
 * 全国の市区町村を1ファイルにまとめた一覧。ランキングと、都道府県をまたぐ比較に使う。
 * values / scores は indicatorKeys と同じ順に並ぶ。時系列は含めない。
 */
export const nationalRowSchema = z.object({
  code: areaCodeSchema,
  name: z.string().min(1),
  parentName: z.string().min(1).optional(),
  prefCode: prefCodeSchema,
  kind: z.enum(AREA_KINDS),
  population: z.number().int().nonnegative().nullable(),
  values: z.array(z.number().nullable()).length(INDICATOR_KEYS.length),
  scores: z.array(z.number().int().min(0).max(100).nullable()).length(INDICATOR_KEYS.length),
  /** くらしの指標の値（factKeys と同じ順）。 */
  facts: z.array(z.number().nullable()).length(FACT_KEYS.length)
});
export type NationalRow = z.infer<typeof nationalRowSchema>;

export const nationalFileSchema = z.object({
  indicatorKeys: z
    .array(z.enum(INDICATOR_KEYS))
    .refine(
      (keys) => keys.length === INDICATOR_KEYS.length && keys.every((key, index) => key === INDICATOR_KEYS[index]),
      {
        message: "indicatorKeys は指標定義と同じ並びでなければなりません"
      }
    ),
  factKeys: z
    .array(z.enum(FACT_KEYS))
    .refine((keys) => keys.length === FACT_KEYS.length && keys.every((key, index) => key === FACT_KEYS[index]), {
      message: "factKeys は指標定義と同じ並びでなければなりません"
    }),
  areas: z.array(nationalRowSchema).min(1)
});
export type NationalFile = z.infer<typeof nationalFileSchema>;

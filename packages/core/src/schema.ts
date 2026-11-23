import { z } from "zod";
import { AREA_KINDS, DATASET_SCHEMA_VERSION, INDICATOR_KEYS, MISSING_REASONS, type IndicatorKey } from "./model";

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
    /** 系列キー → 時系列。キーは指標定義の series[].key に対応する。 */
    series: z.record(z.string(), z.array(seriesPointSchema)),
    missing: z.enum(MISSING_REASONS).optional()
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
  indicators: z.object(indicatorShape(areaIndicatorSchema))
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

export const manifestIndicatorSchema = z.object({
  /** 指標値の基準年（全国で最新の年）。 */
  year: yearSchema,
  /** 基準集団（政令指定都市の区を除く市区町村）における指標値の分布。 */
  distribution: distributionSchema,
  sources: z.array(sourceSeriesSchema).min(1)
});
export type ManifestIndicator = z.infer<typeof manifestIndicatorSchema>;

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
  context: z.object({
    daytimeRatio: sourceSeriesSchema
  }),
  indicators: z.object(indicatorShape(manifestIndicatorSchema))
});
export type Manifest = z.infer<typeof manifestSchema>;

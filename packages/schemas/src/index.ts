import { z } from "zod";

export const sourceAttributionSchema = z.object({
  sourceName: z.string().min(1),
  sourceUrlLabel: z.string().min(1),
  retrievedAt: z.string().min(1),
  publishedAt: z.string().optional(),
  licenseNote: z.string().min(1),
  attribution: z.string().min(1),
  isMock: z.boolean()
});

export const trendSchema = z.enum(["up", "flat", "down", "unknown"]);

export const indicatorValueSchema = z.object({
  label: z.string().min(1),
  value: z.union([z.number(), z.string(), z.null()]),
  unit: z.string().optional(),
  score: z.number().min(0).max(100).optional(),
  trend: trendSchema.optional(),
  notes: z.array(z.string()),
  sources: z.array(sourceAttributionSchema).min(1)
});

export const areaSignalSchema = z.object({
  areaCode: z.string().min(1),
  areaName: z.string().min(1),
  prefectureName: z.string().min(1),
  retrievedAt: z.string().min(1),
  indicators: z.object({
    population: indicatorValueSchema.optional(),
    agingRate: indicatorValueSchema.optional(),
    migration: indicatorValueSchema.optional(),
    landPrice: indicatorValueSchema.optional(),
    corporateActivity: indicatorValueSchema.optional(),
    procurementActivity: indicatorValueSchema.optional(),
    employment: indicatorValueSchema.optional()
  }),
  summary: z.object({
    growthSignals: z.array(z.string()),
    stagnationSignals: z.array(z.string()),
    cautionSignals: z.array(z.string()),
    missingDataNotes: z.array(z.string()),
    confidence: z.enum(["low", "medium", "high"])
  })
});

export const neighborComparisonSchema = z.object({
  areaCode: z.string().min(1),
  areaName: z.string().min(1),
  prefectureName: z.string().min(1),
  populationScore: z.number().min(0).max(100),
  landPriceScore: z.number().min(0).max(100),
  activityScore: z.number().min(0).max(100),
  overallScore: z.number().min(0).max(100),
  isSelected: z.boolean()
});

export type SourceAttribution = z.infer<typeof sourceAttributionSchema>;
export type IndicatorValue = z.infer<typeof indicatorValueSchema>;
export type AreaSignal = z.infer<typeof areaSignalSchema>;
export type NeighborComparison = z.infer<typeof neighborComparisonSchema>;
export type IndicatorKey = keyof AreaSignal["indicators"];
export type Trend = z.infer<typeof trendSchema>;

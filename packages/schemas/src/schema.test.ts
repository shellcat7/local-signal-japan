import { describe, expect, it } from "vitest";
import { areaSignalSchema } from "./index";

describe("areaSignalSchema", () => {
  it("accepts a minimal safe mock signal", () => {
    const parsed = areaSignalSchema.parse({
      areaCode: "13101",
      areaName: "千代田区",
      prefectureName: "東京都",
      retrievedAt: "2026-05-09",
      indicators: {
        population: {
          label: "人口推移",
          value: "微増",
          score: 66,
          trend: "up",
          notes: ["架空データであり、実在統計ではありません。"],
          sources: [
            {
              sourceName: "Mock e-Stat fixture",
              sourceUrlLabel: "mock://estat/population",
              retrievedAt: "2026-05-09",
              licenseNote: "架空データ",
              attribution: "Local Signal Japan demo fixture",
              isMock: true
            }
          ]
        }
      },
      summary: {
        growthSignals: [],
        stagnationSignals: [],
        cautionSignals: [],
        missingDataNotes: [],
        confidence: "low"
      }
    });

    expect(parsed.areaCode).toBe("13101");
  });
});

import { describe, expect, it } from "vitest";
import { getDefaultAreaSignal } from "@local-signal-japan/core";
import { calculateOverallScore, normalizeScore, scoreBand } from "./index";

describe("scoring", () => {
  it("clamps normalized scores into a 0 to 100 range", () => {
    expect(normalizeScore(-10)).toBe(0);
    expect(normalizeScore(52.4)).toBe(52);
    expect(normalizeScore(130)).toBe(100);
    expect(normalizeScore(undefined)).toBeNull();
  });

  it("classifies missing and present scores", () => {
    expect(scoreBand(null)).toBe("missing");
    expect(scoreBand(30)).toBe("thin");
    expect(scoreBand(50)).toBe("watch");
    expect(scoreBand(80)).toBe("strong");
  });

  it("calculates an overall score from available indicators only", () => {
    expect(calculateOverallScore(getDefaultAreaSignal())).toBe(66);
  });
});

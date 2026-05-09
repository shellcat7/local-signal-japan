import { getIndicatorEntries } from "@local-signal-japan/core";
import type { AreaSignal, IndicatorValue } from "@local-signal-japan/schemas";

export type ScoreBand = "strong" | "watch" | "thin" | "missing";

export type ScoreBreakdownItem = {
  label: string;
  score: number | null;
  band: ScoreBand;
  notes: string[];
};

export function normalizeScore(value: number | undefined | null): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

export function scoreBand(score: number | null): ScoreBand {
  if (score === null) {
    return "missing";
  }

  if (score >= 67) {
    return "strong";
  }

  if (score >= 45) {
    return "watch";
  }

  return "thin";
}

export function indicatorScore(indicator: IndicatorValue | undefined): number | null {
  return normalizeScore(indicator?.score);
}

export function calculateOverallScore(area: AreaSignal): number | null {
  const scores = getIndicatorEntries(area)
    .map(([, indicator]) => indicatorScore(indicator))
    .filter((score): score is number => score !== null);

  if (scores.length === 0) {
    return null;
  }

  return normalizeScore(scores.reduce((total, score) => total + score, 0) / scores.length);
}

export function buildScoreBreakdown(area: AreaSignal): ScoreBreakdownItem[] {
  return getIndicatorEntries(area).map(([, indicator]) => {
    const score = indicatorScore(indicator);

    return {
      label: indicator.label,
      score,
      band: scoreBand(score),
      notes: indicator.notes
    };
  });
}

export function confidenceLabel(confidence: AreaSignal["summary"]["confidence"]): string {
  switch (confidence) {
    case "high":
      return "高";
    case "medium":
      return "中";
    case "low":
      return "低";
  }
}

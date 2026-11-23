import { describe, expect, it } from "vitest";
import { FACT_KEYS, INDICATOR_KEYS, type FactKey, type IndicatorKey } from "./model";
import { buildQuiz, dailyQuizSeed, isDailySeed, QUIZ_LENGTH, quizTitle, seededRandom, type QuizQuestion } from "./quiz";
import type { NationalRow } from "./schema";
import { makeManifest } from "./testing/fixtures";

const manifest = makeManifest();

/** 400市区町村。指標ごとに値の並びを変えて、どれも重ならない値にする。 */
function rows(overrides: (index: number) => Partial<Record<FactKey | IndicatorKey, number | null>> = () => ({})) {
  const factKeys: FactKey[] = ["lifeFemale", "foreignShare", "commuteBike", "vacancy", "recycling", "floorArea"];
  const indicatorKeys: IndicatorKey[] = ["employment", "income", "fiscal"];
  return Array.from({ length: 400 }, (_, index): NationalRow => {
    const values: Partial<Record<FactKey | IndicatorKey, number | null>> = {};
    [...factKeys, ...indicatorKeys].forEach((key, k) => (values[key] = ((index * (7 + 2 * k)) % 400) + k / 10));
    Object.assign(values, overrides(index));
    return {
      code: `${String(1 + Math.floor(index / 20)).padStart(2, "0")}${String(201 + (index % 20)).padStart(3, "0")}`,
      name: `見本${index}`,
      prefCode: String(1 + Math.floor(index / 20)).padStart(2, "0"),
      kind: "city",
      population: 50_000,
      values: INDICATOR_KEYS.map((key) => values[key] ?? null),
      scores: INDICATOR_KEYS.map(() => null),
      facts: FACT_KEYS.map((key) => values[key] ?? null)
    };
  });
}

const prefNames = new Map(Array.from({ length: 47 }, (_, index) => [String(index + 1).padStart(2, "0"), "見本県"]));

describe("seededRandom", () => {
  it("同じシードなら同じ並び、違うシードなら違う並び", () => {
    const take = (seed: string) => {
      const random = seededRandom(seed);
      return Array.from({ length: 5 }, () => random());
    };
    expect(take("2026-11-23")).toEqual(take("2026-11-23"));
    expect(take("2026-11-23")).not.toEqual(take("2026-11-24"));
    for (const value of take("x")) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("dailyQuizSeed", () => {
  it("日本時間の日付にする", () => {
    expect(dailyQuizSeed(new Date("2026-11-23T14:59:00Z"))).toBe("2026-11-23");
    expect(dailyQuizSeed(new Date("2026-11-23T15:00:00Z"))).toBe("2026-11-24");
    expect(isDailySeed("2026-11-24")).toBe(true);
    expect(isDailySeed("abc123")).toBe(false);
  });
});

describe("buildQuiz", () => {
  const data = rows();
  const check = (question: QuizQuestion) => {
    expect(question.choices).toHaveLength(4);
    expect(question.answer).toBeGreaterThanOrEqual(0);
    expect(question.answer).toBeLessThan(4);
    if (question.kind === "top") {
      expect(new Set(question.choices.map((choice) => choice.code)).size).toBe(4);
      const ranks = question.choices.map((choice) => choice.rank);
      expect(ranks[question.answer]).toBe(1);
      expect(ranks.filter((rank) => rank === 1)).toHaveLength(1);
      expect(Math.max(...ranks)).toBeLessThanOrEqual(60);
    } else {
      expect(new Set(question.choices.map((choice) => choice.key)).size).toBe(4);
      const correct = question.choices[question.answer];
      expect(correct && Math.min(correct.rankHigh, correct.rankLow)).toBeLessThanOrEqual(10);
    }
  };

  it("同じシードからは同じ問題を作り、問題は5問（全国1位を当てる問題と、まちの特徴を当てる問題）", () => {
    const quiz = buildQuiz(data, manifest, prefNames, "2026-11-23");
    expect(quiz).toHaveLength(QUIZ_LENGTH);
    expect(buildQuiz(data, manifest, prefNames, "2026-11-23")).toEqual(quiz);
    expect(buildQuiz(data, manifest, prefNames, "2026-11-24")).not.toEqual(quiz);
    expect(quiz.filter((question) => question.kind === "top")).toHaveLength(3);
    expect(quiz.filter((question) => question.kind === "trait")).toHaveLength(2);
    quiz.forEach(check);
  });

  it("1回の中で同じ指標を2度出さない", () => {
    for (const seed of ["a", "b", "c", "d"]) {
      const keys = buildQuiz(data, manifest, prefNames, seed).flatMap((question) =>
        question.kind === "top" ? [question.key] : [question.choices[question.answer]?.key]
      );
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("1位が同じ値で並ぶ指標は「全国で最も◯◯」に出さない", () => {
    const tied = rows((index) => ({ foreignShare: index < 2 ? 999 : index }));
    for (const seed of ["a", "b", "c", "d", "e", "f"]) {
      for (const question of buildQuiz(tied, manifest, prefNames, seed)) {
        if (question.kind === "top") expect(question.key).not.toBe("foreignShare");
      }
    }
  });

  it("失業率が高いことのように、市区町村を悪く言うことになりやすい向きは正解にしない", () => {
    for (const seed of ["a", "b", "c", "d", "e", "f"]) {
      for (const question of buildQuiz(data, manifest, prefNames, seed)) {
        const key = question.kind === "top" ? question.key : question.choices[question.answer]?.key;
        expect(key).not.toBe("employment");
      }
    }
  });
});

describe("quizTitle", () => {
  it("正解数に応じて呼び名を変える", () => {
    expect(quizTitle(5, 5)).toBe("まち博士");
    expect(quizTitle(4, 5)).toBe("まちの達人");
    expect(quizTitle(3, 5)).toBe("まち通");
    expect(quizTitle(2, 5)).toBe("まち見習い");
    expect(quizTitle(0, 5)).toBe("まち入門");
  });
});

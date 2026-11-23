import { describeMetric, findHighlights, HIGHLIGHT_MIN_POPULATION, type Highlight } from "./highlights";
import type { MetricKey } from "./model";
import { rowMetricValue } from "./national";
import { areaLocalName } from "./format";
import type { Manifest, NationalRow } from "./schema";

/**
 * まちクイズ。公的統計の値から、決まった規則で4択の問題を作る。
 * 同じシードからは同じ問題ができるので、日替わりの問題や、投稿したリンクから同じ問題に挑戦できる。
 */

/** 1回のクイズの問題数。 */
export const QUIZ_LENGTH = 5;

/** 文字列のシードから、0以上1未満の数を順に返す乱数を作る（同じシードなら同じ並び）。 */
export function seededRandom(seed: string): () => number {
  // xmur3 でシードを32ビットの数にし、mulberry32 で並びを作る。
  let hash = 1779033703 ^ seed.length;
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** 日替わりのシード（日本時間の日付。例: 2026-11-23）。 */
export function dailyQuizSeed(now: Date = new Date()): string {
  const japan = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return japan.toISOString().slice(0, 10);
}

export const isDailySeed = (seed: string) => /^\d{4}-\d{2}-\d{2}$/.test(seed);

/**
 * 「全国で最も◯◯な市区町村は？」に使う指標と向き。
 * 特定の市区町村を悪く言うことになりやすい向き（失業率が最も高い、など）は出題しない。
 */
export const QUIZ_TOP_TOPICS: ReadonlyArray<{ key: MetricKey; side: "high" | "low" }> = [
  { key: "lifeFemale", side: "high" },
  { key: "lifeMale", side: "high" },
  { key: "projection2050", side: "high" },
  { key: "projection2050", side: "low" },
  { key: "foreignShare", side: "high" },
  { key: "marriageRate", side: "high" },
  { key: "birthRate", side: "high" },
  { key: "commuteRail", side: "high" },
  { key: "commuteCar", side: "high" },
  { key: "commuteBike", side: "high" },
  { key: "commuteWalk", side: "high" },
  { key: "vacancy", side: "high" },
  { key: "floorArea", side: "high" },
  { key: "floorArea", side: "low" },
  { key: "doctors", side: "high" },
  { key: "libraries", side: "high" },
  { key: "garbage", side: "low" },
  { key: "recycling", side: "high" },
  { key: "furusatoReceipts", side: "high" },
  { key: "furusatoPerCapita", side: "high" },
  { key: "furusatoOutflow", side: "high" },
  { key: "population", side: "high" },
  { key: "aging", side: "high" },
  { key: "aging", side: "low" },
  { key: "migration", side: "high" },
  { key: "business", side: "high" },
  { key: "income", side: "high" },
  { key: "fiscal", side: "high" }
];

/** 選択肢の市区町村。答え合わせのときに、値と順位を見せる。 */
export type QuizAreaChoice = {
  code: string;
  prefCode: string;
  name: string;
  valueText: string;
  /** その向きで数えた全国順位（同じ値は同順位）。 */
  rank: number;
};

/** 選択肢の指標。答え合わせのときに、その市区町村の値と順位を見せる。 */
export type QuizMetricChoice = {
  key: MetricKey;
  label: string;
  valueText: string;
  /** 値が大きい側・小さい側を言うときの言葉。 */
  words: { high: string; low: string };
  /** 値が大きい側から数えた全国順位。 */
  rankHigh: number;
  /** 値が小さい側から数えた全国順位。 */
  rankLow: number;
};

export type QuizQuestion =
  | {
      kind: "top";
      key: MetricKey;
      side: "high" | "low";
      /** 例: 「外国人住民の割合が全国で最も高い市区町村は？」 */
      prompt: string;
      label: string;
      /** 例: 「全国で最も高い」 */
      phrase: string;
      period: string;
      /** 人口1万人以上の市区町村の中で比べたか。 */
      limited: boolean;
      /** 比べた市区町村の数。 */
      total: number;
      choices: QuizAreaChoice[];
      answer: number;
    }
  | {
      kind: "trait";
      code: string;
      prefCode: string;
      name: string;
      /** 例: 「群馬県 大泉町が全国の上位・下位10位以内に入っている項目は？」 */
      prompt: string;
      /** 正解の項目の言い方（例: 「全国で3番目に高い」）と基準時点。 */
      highlight: Pick<Highlight, "phrase" | "period" | "rank" | "side">;
      choices: QuizMetricChoice[];
      answer: number;
    };

type Random = () => number;

const pick = <T>(items: readonly T[], random: Random): T | undefined =>
  items[Math.min(items.length - 1, Math.floor(random() * items.length))];

function shuffle<T>(items: readonly T[], random: Random): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other] as T, result[index] as T];
  }
  return result;
}

const isBig = (row: NationalRow) => row.population !== null && row.population >= HIGHLIGHT_MIN_POPULATION;

/** 「全国で最も◯◯な市区町村は？」。1位が1つに決まらない指標は出題しない。 */
function topQuestion(
  topic: (typeof QUIZ_TOP_TOPICS)[number],
  reference: readonly NationalRow[],
  manifest: Manifest,
  prefNames: ReadonlyMap<string, string>,
  random: Random
): QuizQuestion | null {
  const { key, side } = topic;
  const sample = reference.find((row) => rowMetricValue(row, key) !== null);
  if (!sample) return null;
  const probe = describeMetric(key, rowMetricValue(sample, key) as number, manifest);
  const ranked = reference
    .filter((row) => !probe.limited || isBig(row))
    .map((row) => ({ row, value: rowMetricValue(row, key) }))
    .filter((item): item is { row: NationalRow; value: number } => item.value !== null)
    .sort((a, b) => (side === "high" ? b.value - a.value : a.value - b.value));
  const [first, second] = ranked;
  if (!first || !second || first.value === second.value) return null;

  const rankOf = (value: number) =>
    1 + ranked.filter((item) => (side === "high" ? item.value > value : item.value < value)).length;
  // はずれの選択肢は、2〜10位から1つ、11〜60位から2つ（どれも「ありそう」な市区町村にする）。
  const near = ranked.slice(1, 10);
  const middle = ranked.slice(10, 60);
  const decoys = [pick(near, random), ...shuffle(middle, random).slice(0, 2)].filter((item) => item !== undefined);
  if (decoys.length < 3) return null;

  const options = shuffle([first, ...decoys], random);
  const describe = (item: { row: NationalRow; value: number }): QuizAreaChoice => ({
    code: item.row.code,
    prefCode: item.row.prefCode,
    name: `${prefNames.get(item.row.prefCode) ?? ""} ${areaLocalName(item.row)}`,
    valueText: describeMetric(key, item.value, manifest).valueText,
    rank: rankOf(item.value)
  });
  const scope = probe.limited ? "人口1万人以上の市区町村で" : "全国で";
  return {
    kind: "top",
    key,
    side,
    prompt: `${probe.label}が${scope}最も${probe.words[side]}市区町村は？`,
    label: probe.label,
    phrase: `${scope}最も${probe.words[side]}`,
    period: probe.period,
    limited: probe.limited,
    total: ranked.length,
    choices: options.map(describe),
    answer: options.indexOf(first)
  };
}

/** 「このまちが全国の上位・下位10位以内に入っている項目は？」。はずれは、全国の真ん中あたりの項目から選ぶ。 */
function traitQuestion(
  target: NationalRow,
  rows: readonly NationalRow[],
  reference: readonly NationalRow[],
  manifest: Manifest,
  prefNames: ReadonlyMap<string, string>,
  used: ReadonlySet<MetricKey>,
  random: Random
): QuizQuestion | null {
  const highlights = findHighlights(target, rows, manifest);
  // 正解にするのは、「全国で最も◯◯」と同じく出題してよい指標と向きだけ。
  const allowed = highlights.filter(
    (item) => !used.has(item.key) && QUIZ_TOP_TOPICS.some((topic) => topic.key === item.key && topic.side === item.side)
  );
  const correct = pick(allowed, random);
  if (!correct) return null;

  const standing = (key: MetricKey): QuizMetricChoice | null => {
    const value = rowMetricValue(target, key);
    if (value === null) return null;
    const info = describeMetric(key, value, manifest);
    if (info.limited && !isBig(target)) return null;
    const values = reference
      .filter((row) => !info.limited || isBig(row))
      .map((row) => rowMetricValue(row, key))
      .filter((candidate) => candidate !== null);
    return {
      key,
      label: info.label,
      valueText: info.valueText,
      words: info.words,
      rankHigh: 1 + values.filter((candidate) => candidate > value).length,
      rankLow: 1 + values.filter((candidate) => candidate < value).length
    };
  };

  const answerChoice = standing(correct.key);
  if (!answerChoice) return null;
  // はずれは、どちらの端からも全体の30%より内側にある項目（目立っていないことがはっきりしているもの）。
  const decoys = shuffle(
    QUIZ_TOP_TOPICS.map((topic) => topic.key).filter((key, index, keys) => keys.indexOf(key) === index),
    random
  )
    .filter((key) => key !== correct.key && !highlights.some((item) => item.key === key))
    .map(standing)
    .filter((choice): choice is QuizMetricChoice => {
      if (choice === null) return false;
      const total = choice.rankHigh + choice.rankLow;
      return Math.min(choice.rankHigh, choice.rankLow) > total * 0.3;
    })
    .slice(0, 3);
  if (decoys.length < 3) return null;

  const options = shuffle([answerChoice, ...decoys], random);
  const name = `${prefNames.get(target.prefCode) ?? ""} ${areaLocalName(target)}`;
  return {
    kind: "trait",
    code: target.code,
    prefCode: target.prefCode,
    name,
    prompt: `${name}が全国の上位・下位10位以内に入っている項目は？`,
    highlight: { phrase: correct.phrase, period: correct.period, rank: correct.rank, side: correct.side },
    choices: options,
    answer: options.indexOf(answerChoice)
  };
}

/**
 * シードから問題を作る。「全国で最も◯◯」が3問、「このまちが目立つのは」が2問（順番はシードで決まる）。
 * 1回の中で同じ指標・同じ市区町村は2度出さない。
 */
export function buildQuiz(
  rows: readonly NationalRow[],
  manifest: Manifest,
  prefNames: ReadonlyMap<string, string>,
  seed: string,
  length = QUIZ_LENGTH
): QuizQuestion[] {
  const random = seededRandom(seed);
  const reference = rows.filter((row) => row.kind !== "ward");
  const kinds = shuffle(
    Array.from({ length }, (_, index) => (index % 5 === 1 || index % 5 === 3 ? "trait" : "top")),
    random
  );
  const usedKeys = new Set<MetricKey>();
  const usedAreas = new Set<string>();
  const topics = shuffle(QUIZ_TOP_TOPICS, random);
  const questions: QuizQuestion[] = [];

  for (const kind of kinds) {
    let question: QuizQuestion | null = null;
    if (kind === "top") {
      while (!question && topics.length > 0) {
        const topic = topics.shift() as (typeof QUIZ_TOP_TOPICS)[number];
        if (usedKeys.has(topic.key)) continue;
        question = topQuestion(topic, reference, manifest, prefNames, random);
        if (question?.kind === "top" && question.choices.some((choice) => usedAreas.has(choice.code))) {
          question = null;
        }
      }
    } else {
      for (let attempt = 0; attempt < 200 && !question; attempt += 1) {
        const target = pick(reference, random);
        if (!target || usedAreas.has(target.code)) continue;
        question = traitQuestion(target, rows, reference, manifest, prefNames, usedKeys, random);
      }
    }
    if (!question) continue;
    if (question.kind === "top") {
      usedKeys.add(question.key);
      for (const choice of question.choices) usedAreas.add(choice.code);
    } else {
      usedAreas.add(question.code);
      for (const choice of question.choices) usedKeys.add(choice.key);
    }
    questions.push(question);
  }
  return questions;
}

/** 正解数に応じた呼び名。 */
export function quizTitle(correct: number, total: number): string {
  const ratio = total === 0 ? 0 : correct / total;
  if (ratio >= 1) return "まち博士";
  if (ratio >= 0.8) return "まちの達人";
  if (ratio >= 0.6) return "まち通";
  if (ratio >= 0.4) return "まち見習い";
  return "まち入門";
}

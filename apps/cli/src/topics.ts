import { findTopic, TOPICS, type Manifest, type NationalRow, type Topic } from "@local-signal-japan/core";
import { CliError } from "./errors";
import {
  parseLimit,
  renderScreenCsv,
  renderScreenText,
  resolvePrefecture,
  runScreen,
  screenFooterLines,
  screenHeaderLines,
  toReadableJson,
  type Prefecture,
  type ScreenArgs,
  type ScreenResult
} from "./screen";

/** 特集ランキングの結果。一覧の中身は screen と同じ。 */
export type TopicResult = { topic: Topic } & ScreenResult;

/** 特集で指定できるのは、都道府県と件数だけ。並べ方と条件は特集ごとに決まっている。 */
export type TopicArgs = Pick<ScreenArgs, "pref" | "limit">;

export function resolveTopic(id: string): Topic {
  const topic = findTopic(id.normalize("NFKC").trim().toLowerCase());
  if (topic) return topic;
  throw new CliError(
    [`特集が見つかりません: ${id}`, "使える特集:", ...TOPICS.map((item) => `  ${item.id}  ${item.title}`)].join("\n")
  );
}

/** 特集の決まった条件で、screen と同じ計算をする。 */
export function runTopic(
  rows: readonly NationalRow[],
  manifest: Manifest,
  prefectures: readonly Prefecture[],
  topic: Topic,
  args: TopicArgs = {}
): TopicResult {
  const result = runScreen(rows, manifest, prefectures, {
    filters: topic.filters,
    metric: topic.metric,
    order: topic.order,
    pref: args.pref === undefined ? null : resolvePrefecture(prefectures, args.pref),
    size: topic.size,
    limit: parseLimit(args.limit)
  });
  return { topic, ...result };
}

/** 特集の一覧（id と見出し）。 */
export function renderTopicList(): string {
  const width = Math.max(...TOPICS.map((topic) => topic.id.length));
  return `${[
    "特集ランキング（pnpm localsignal topics <id> で一覧を表示します）:",
    ...TOPICS.map((topic) => `  ${topic.id.padEnd(width)}  ${topic.title}`)
  ].join("\n")}\n`;
}

export function renderTopicListJson(): string {
  return `${toReadableJson({ topics: TOPICS })}\n`;
}

/** 見出しと説明。どの出力形式でも最初に示す。 */
export function topicHeaderLines(result: TopicResult): string[] {
  return [result.topic.title, result.topic.lead];
}

export function renderTopicText(result: TopicResult): string {
  return `${[...topicHeaderLines(result), "", renderScreenText(result)].join("\n")}`;
}

export function renderTopicJson(result: TopicResult): string {
  return `${toReadableJson(result)}\n`;
}

export function renderTopicCsv(result: TopicResult): string {
  return renderScreenCsv(result);
}

/** CSVに入れられない見出し・条件・基準時点・出典。 */
export function topicNoteLines(result: TopicResult): string[] {
  return [
    ...topicHeaderLines(result),
    ...screenHeaderLines(result),
    ...screenFooterLines(result, { allSources: true })
  ];
}

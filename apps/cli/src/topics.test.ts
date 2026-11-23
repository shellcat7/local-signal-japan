import { describe, expect, it } from "vitest";
import { rankNational, TOPICS, unrankedNational } from "@local-signal-japan/core";
import { readAreaIndex, readManifest, readNational } from "@local-signal-japan/dataset";
import { CliError } from "./errors";
import { DEFAULT_SCREEN_LIMIT, renderScreenText } from "./screen";
import {
  renderTopicList,
  renderTopicListJson,
  renderTopicText,
  resolveTopic,
  runTopic,
  topicNoteLines,
  type TopicResult
} from "./topics";

describe("resolveTopic", () => {
  it("id から特集を決める（全角・大文字でもよい）", () => {
    expect(resolveTopic("half-by-2050").id).toBe("half-by-2050");
    expect(resolveTopic(" ＦＵＲＵＳＡＴＯ－ＲＥＣＥＩＰＴＳ ").id).toBe("furusato-receipts");
  });

  it("知らない id は、使える特集を添えて断る", () => {
    expect(() => resolveTopic("best-towns")).toThrow(CliError);
    expect(() => resolveTopic("best-towns")).toThrow(/特集が見つかりません: best-towns[\s\S]*half-by-2050 {2}2050年/);
  });
});

describe("特集の一覧", () => {
  it("すべての特集の id と見出しを並べる", () => {
    const text = renderTopicList();
    for (const topic of TOPICS) {
      expect(text).toMatch(new RegExp(`^  ${topic.id} +${topic.title}$`, "m"));
    }
    expect(JSON.parse(renderTopicListJson())).toEqual({ topics: TOPICS });
  });
});

describe("runTopic", async () => {
  const [manifest, index, national] = await Promise.all([readManifest(), readAreaIndex(), readNational()]);
  const run = (id: string, args = {}) => runTopic(national.areas, manifest, index.prefectures, resolveTopic(id), args);

  it.each(TOPICS.map((topic) => topic.id))("%s: core の rankNational と同じ市区町村・順・順位になる", (id) => {
    const topic = resolveTopic(id);
    const options = { metric: topic.metric, order: topic.order, populationBand: topic.size, filters: topic.filters };
    const ranked = rankNational(national.areas, options);
    const unranked = unrankedNational(national.areas, options);
    const result = run(id, { limit: "0" });

    expect(ranked.length).toBeGreaterThan(1);
    expect(result.rows.map((row) => [row.code, row.rank, row.sortValue])).toEqual([
      ...ranked.map((entry) => [entry.row.code, entry.rank, entry.value]),
      ...unranked.map((row) => [row.code, null, null])
    ]);
    expect(result.conditions).toMatchObject({ sort: topic.metric, order: topic.order, size: topic.size });
    expect(result.topic).toEqual(topic);
  });

  it("件数の既定は20件で、都道府県でも絞れる", () => {
    const result = run("furusato-receipts");
    expect(result.returned).toBe(DEFAULT_SCREEN_LIMIT);
    expect(result.truncated).toBe(true);

    const osaka = run("furusato-receipts", { pref: "大阪府", limit: "3" });
    expect(osaka.rows.map((row) => row.prefCode)).toEqual(["27", "27", "27"]);
    expect(osaka.conditions.text).toBe("都道府県 大阪府 / 並び順 受入額の大きい順");
  });

  it("表には見出し・説明・一覧・基準時点・出典を出す", () => {
    const result: TopicResult = run("half-by-2050", { limit: "5" });
    const text = renderTopicText(result);
    const lines = text.split("\n");

    expect(lines[0]).toBe(result.topic.title);
    expect(lines[1]).toBe(result.topic.lead);
    expect(text).toContain(renderScreenText(result));
    expect(text).toContain("条件: 2050年推計 \u221250%以下 / 並び順 2050年推計の小さい順");
    expect(text).toContain(`- ${result.facts.projection2050.label}: ${manifest.facts.projection2050.period}（`);
    expect(text).toContain(manifest.source.attribution);
    expect(text).toContain(manifest.source.credit);
  });

  it("ふるさと納税の特集には、総務省の出典を入れる", () => {
    const furusato = manifest.additionalSources.find((source) => source.id === "furusato");
    expect(renderTopicText(run("furusato-outflow", { limit: "3" }))).toContain(`出典: ${furusato?.attribution}`);
    expect(renderTopicText(run("bicycle", { limit: "3" }))).not.toContain(`出典: ${furusato?.attribution}`);
    // CSVと一緒に示す注記には、すべての値の出典を入れる。
    expect(topicNoteLines(run("bicycle", { limit: "3" }))).toContain(`出典: ${furusato?.attribution}`);
  });
});

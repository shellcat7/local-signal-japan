import { describe, expect, it } from "vitest";
import { isMetricKey, POPULATION_BANDS } from "./national";
import { FEATURED_TOPIC_IDS, findTopic, TOPICS } from "./topics";

describe("TOPICS", () => {
  it("id が重複せず、並べる値と条件が定義にあるものだけを使う", () => {
    expect(new Set(TOPICS.map((topic) => topic.id)).size).toBe(TOPICS.length);
    for (const topic of TOPICS) {
      expect(topic.metric === "residents" || topic.metric === "overall" || isMetricKey(topic.metric), topic.id).toBe(
        true
      );
      expect(
        POPULATION_BANDS.some((band) => band.id === topic.size),
        topic.id
      ).toBe(true);
      for (const key of Object.keys(topic.filters)) expect(isMetricKey(key), `${topic.id} ${key}`).toBe(true);
    }
  });

  it("トップページの特集は、定義にある特集を指す", () => {
    for (const id of FEATURED_TOPIC_IDS) expect(findTopic(id)?.id).toBe(id);
    expect(findTopic("unknown")).toBeUndefined();
    expect(findTopic(null)).toBeUndefined();
  });
});

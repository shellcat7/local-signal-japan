import {
  FACT_GROUPS,
  FACT_KEYS,
  FACTS,
  FEATURED_TOPIC_IDS,
  findTopic,
  formatDateWithEra,
  formatFact,
  formatNumber,
  INDICATOR_KEYS,
  INDICATORS,
  metricPeriodText,
  TOPICS,
  type AreaIndex,
  type Manifest,
  type NationalFile
} from "@local-signal-japan/core";
import type { AsyncState } from "../lib/useAsync";
import type { RankingRoute } from "../lib/route";
import { hrefOf } from "../lib/route";
import { HowToRead } from "./HowToRead";
import { JapanMap } from "./JapanMap";
import { TopicCard } from "./TopicCard";
import { PrefectureIndex } from "./PrefectureIndex";
import { ScrollRegion } from "./ScrollRegion";

type LandingProps = {
  manifest: Manifest;
  index: AreaIndex;
  national: AsyncState<NationalFile>;
  onOpenArea: (areaCode: string) => void;
  onOpenRanking: (route: RankingRoute) => void;
  onOpenTopics: () => void;
};

/** トップページの、検索欄より下の部分。 */
export function Landing({ manifest, index, national, onOpenArea, onOpenRanking, onOpenTopics }: LandingProps) {
  const prefNames = new Map(index.prefectures.map((pref) => [pref.code, pref.name]));

  return (
    <div className="landing">
      <section className="pref-finder" aria-labelledby="pref-index-title">
        <header className="pref-finder__head">
          <h2 id="pref-index-title">都道府県からさがす</h2>
          <p>
            ます目の数字は、収録している市区町村の数です。全国{formatNumber(manifest.counts.areas)}市区町村・
            {INDICATOR_KEYS.length}指標。
          </p>
          <p>
            出典 {manifest.source.name}
            <br />
            {formatDateWithEra(manifest.generatedAt)}取得
          </p>
        </header>
        {/* 広い画面では地図の形、狭い画面では地方ごとの一覧で示す。 */}
        <JapanMap index={index} onOpenRanking={onOpenRanking} />
        <PrefectureIndex index={index} onOpenRanking={onOpenRanking} />
      </section>

      {national.status === "ready" && (
        <section className="block" aria-labelledby="featured-title">
          <header className="block__head">
            <h2 id="featured-title">特集</h2>
            <a
              className="text-link"
              href={hrefOf({ view: "topics" })}
              onClick={(event) => {
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                onOpenTopics();
              }}
            >
              特集をすべて見る（{TOPICS.length}本）
            </a>
          </header>
          <div className="topics__grid">
            {FEATURED_TOPIC_IDS.map((id) => {
              const topic = findTopic(id);
              return topic ? (
                <TopicCard
                  key={id}
                  topic={topic}
                  rows={national.value.areas}
                  prefNames={prefNames}
                  manifest={manifest}
                  limit={3}
                  onOpenArea={onOpenArea}
                  onOpenRanking={onOpenRanking}
                />
              ) : null;
            })}
          </div>
        </section>
      )}

      <section className="block" aria-labelledby="indicator-list-title">
        <header className="block__head">
          <h2 id="indicator-list-title">収録している指標</h2>
        </header>
        <h3 className="landing__subhead">7つの指標（補助スコアの対象）</h3>
        <ScrollRegion label="収録している指標の表">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">指標</th>
                <th scope="col">指標値</th>
                <th scope="col">基準時点</th>
                <th scope="col" className="is-numeric">
                  全国の中央値
                </th>
                <th scope="col">出典の統計</th>
              </tr>
            </thead>
            <tbody>
              {INDICATOR_KEYS.map((key) => {
                const definition = INDICATORS[key];
                const meta = manifest.indicators[key];
                const statNames = [...new Set(meta.sources.map((source) => source.statName))].join("、");
                return (
                  <tr key={key}>
                    <th scope="row">{definition.label}</th>
                    <td>{definition.metricLabel}</td>
                    <td className="is-nowrap is-mono">{metricPeriodText(key, meta.year)}</td>
                    <td className="is-numeric is-nowrap">
                      {formatNumber(meta.distribution.p50, definition.decimals, definition.signed)}
                      {definition.unit}
                    </td>
                    <td>{statNames}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollRegion>
        <h3 className="landing__subhead">くらしの指標（{FACT_KEYS.length}項目）</h3>
        <ScrollRegion label="くらしの指標の表">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">分野</th>
                <th scope="col">項目</th>
                <th scope="col">基準時点</th>
                <th scope="col" className="is-numeric">
                  全国の中央値
                </th>
              </tr>
            </thead>
            <tbody>
              {FACT_KEYS.map((key) => (
                <tr key={key}>
                  <th scope="row">{FACT_GROUPS.find((group) => group.id === FACTS[key].group)?.label}</th>
                  <td>{FACTS[key].label}</td>
                  <td className="is-nowrap">{manifest.facts[key].period}</td>
                  <td className="is-numeric is-nowrap">
                    {formatFact(FACTS[key], manifest.facts[key].distribution.p50)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
        <ul className="notes">
          <li>くらしの指標は、値と全国順位だけを示し、補助スコアには含めていません。</li>
          <li>
            ふるさと納税の値は、
            {manifest.additionalSources.find((source) => source.id === "furusato")?.attribution}
            したものです。
          </li>
          <li>
            全国の中央値は、政令指定都市の区を除く{formatNumber(manifest.counts.referenceAreas)}
            市区町村のうち、値がある市区町村のものです。
          </li>
          <li>検索や絞り込みはブラウザの中だけで行います。入力した内容は送信も保存もしません。</li>
        </ul>
      </section>

      <section className="block" aria-labelledby="how-to-read-title">
        <header className="block__head">
          <h2 id="how-to-read-title">補助スコアの読み方</h2>
        </header>
        <HowToRead manifest={manifest} />
      </section>
    </div>
  );
}

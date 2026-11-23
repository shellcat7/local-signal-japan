import { Database, Scale, ShieldCheck } from "lucide-react";
import {
  INDICATOR_KEYS,
  INDICATORS,
  metricPeriodText,
  type AreaIndex,
  type Manifest,
  type NationalFile
} from "@local-signal-japan/core";
import type { AsyncState } from "../lib/useAsync";
import type { RankingRoute } from "../lib/route";
import { HowToRead } from "./HowToRead";
import { Leaderboard } from "./Leaderboard";
import { ScrollRegion } from "./ScrollRegion";

const PRINCIPLES = [
  {
    icon: Database,
    title: "出典と基準時点を必ず示す",
    body: "すべての値に、出典の統計名・系列コード・基準時点・取得日を添えています。出典の値そのものへのリンクから検証できます。"
  },
  {
    icon: Scale,
    title: "断定しない",
    body: "地域の良し悪しや将来を判定しません。値がそろわない指標は「欠損」と明示し、低い評価として扱いません。"
  },
  {
    icon: ShieldCheck,
    title: "入力を保存・送信しない",
    body: "検索はブラウザの中だけで行い、入力した文字や閲覧の履歴を保存しません。解析タグや広告もありません。"
  }
];

type LandingProps = {
  manifest: Manifest;
  index: AreaIndex;
  national: AsyncState<NationalFile>;
  onOpenArea: (areaCode: string) => void;
  onOpenRanking: (route: RankingRoute) => void;
};

/** トップページの、検索欄より下の部分。 */
export function Landing({ manifest, index, national, onOpenArea, onOpenRanking }: LandingProps) {
  const prefNames = new Map(index.prefectures.map((pref) => [pref.code, pref.name]));

  return (
    <div className="landing">
      {national.status === "ready" && (
        <section className="section" aria-labelledby="leaderboards-title">
          <header className="section__head">
            <h2 id="leaderboards-title">いまのデータから</h2>
            <p>人口20万人以上の市・特別区を、指標値の順に並べた抜粋です。条件を変えた一覧はランキングで見られます。</p>
          </header>
          <div className="leaderboards">
            <Leaderboard
              rows={national.value.areas}
              prefNames={prefNames}
              metric="population"
              order="desc"
              size="over-200k"
              title="人口の増減率が大きい"
              onOpenArea={onOpenArea}
              onOpenRanking={onOpenRanking}
            />
            <Leaderboard
              rows={national.value.areas}
              prefNames={prefNames}
              metric="migration"
              order="desc"
              size="over-200k"
              title="転入超過率が大きい"
              onOpenArea={onOpenArea}
              onOpenRanking={onOpenRanking}
            />
            <Leaderboard
              rows={national.value.areas}
              prefNames={prefNames}
              metric="aging"
              order="asc"
              size="over-200k"
              title="高齢化率が小さい"
              onOpenArea={onOpenArea}
              onOpenRanking={onOpenRanking}
            />
          </div>
        </section>
      )}

      <section className="section" aria-labelledby="principles-title">
        <header className="section__head">
          <h2 id="principles-title">この道具の約束</h2>
        </header>
        <ul className="principles">
          {PRINCIPLES.map(({ icon: Icon, title, body }) => (
            <li className="principle" key={title}>
              <span className="principle__icon">
                <Icon size={18} aria-hidden="true" />
              </span>
              <h3>{title}</h3>
              <p>{body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="section" aria-labelledby="indicator-list-title">
        <header className="section__head">
          <h2 id="indicator-list-title">収録している指標</h2>
          <p>すべて総務省統計局「統計ダッシュボード」の API から取得した公的統計です。</p>
        </header>
        <div className="card card--flush">
          <ScrollRegion label="収録している指標の表">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">指標</th>
                  <th scope="col">見ているもの</th>
                  <th scope="col">基準時点</th>
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
                      <td>
                        {definition.metricLabel}
                        <span className="cell-note">{definition.summary}</span>
                      </td>
                      <td className="is-nowrap is-mono">{metricPeriodText(key, meta.year)}</td>
                      <td>{statNames}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollRegion>
        </div>
      </section>

      <section className="section" aria-labelledby="how-to-read-title">
        <header className="section__head">
          <h2 id="how-to-read-title">補助スコアの読み方</h2>
        </header>
        <div className="card">
          <HowToRead manifest={manifest} />
        </div>
      </section>
    </div>
  );
}

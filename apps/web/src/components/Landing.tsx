import { Database, Scale, ShieldCheck } from "lucide-react";
import {
  areaLocalName,
  findAreaEntry,
  INDICATOR_KEYS,
  INDICATORS,
  metricPeriodText,
  type AreaIndex,
  type Manifest
} from "@local-signal-japan/core";
import { EXAMPLE_AREA_CODES } from "../lib/site";
import { HowToRead } from "./HowToRead";
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
  onSelect: (areaCode: string) => void;
};

export function Landing({ manifest, index, onSelect }: LandingProps) {
  const examples = EXAMPLE_AREA_CODES.map((code) => findAreaEntry(index, code)).filter((entry) => entry !== undefined);

  return (
    <div className="landing">
      {examples.length > 0 && (
        <p className="examples">
          <span className="examples__label">例から見る</span>
          {examples.map((example) => (
            <button type="button" className="chip-button" key={example.code} onClick={() => onSelect(example.code)}>
              {example.prefName} {areaLocalName(example)}
            </button>
          ))}
        </p>
      )}

      <ul className="principles">
        {PRINCIPLES.map(({ icon: Icon, title, body }) => (
          <li className="principle" key={title}>
            <Icon size={20} aria-hidden="true" />
            <div>
              <h2>{title}</h2>
              <p>{body}</p>
            </div>
          </li>
        ))}
      </ul>

      <section className="panel" aria-labelledby="indicator-list-title">
        <h2 id="indicator-list-title">収録している指標</h2>
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
                    <td className="is-nowrap">{metricPeriodText(key, meta.year)}</td>
                    <td>{statNames}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollRegion>
      </section>

      <section className="panel" aria-labelledby="how-to-read-title">
        <h2 id="how-to-read-title">補助スコアの読み方</h2>
        <HowToRead manifest={manifest} />
      </section>
    </div>
  );
}

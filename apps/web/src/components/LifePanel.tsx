import {
  FACT_GROUPS,
  FACT_KEYS,
  FACTS,
  formatFact,
  formatNumber,
  formatYen,
  type AreaRecord,
  type FactDefinition,
  type FactKey,
  type Manifest
} from "@local-signal-japan/core";
import { positionFromRank } from "../lib/metrics";
import { RangeBar } from "./RangeBar";
import { ScrollRegion } from "./ScrollRegion";

/** もとの数を、単位に合わせて書く。 */
function basisText(unit: string, value: number): string {
  if (unit === "円") return formatYen(value);
  if (unit === "%" || unit === "年" || unit === "㎡") return `${formatNumber(value, 1)}${unit}`;
  return `${formatNumber(value)}${unit}`;
}

/** もとの数が2つ以上ある指標だけ、「外国人住民 8,871人／住民 41,646人」のように添える。 */
function BasisLine({ definition, basis }: { definition: FactDefinition; basis: Record<string, number> }) {
  const entries = Object.entries(definition.basis).filter(([name]) => basis[name] !== undefined);
  if (entries.length < 2) return null;
  return (
    <span className="life-table__basis">
      {entries.map(([name, { label, unit }]) => `${label} ${basisText(unit, basis[name] as number)}`).join("／")}
    </span>
  );
}

function missingText(area: AreaRecord, definition: FactDefinition): string {
  if (area.kind === "ward" && definition.provider === "furusato") return "市全体の値だけが公表されています";
  if (definition.key === "vacancy" || definition.key === "floorArea") return "この調査の集計の対象外です";
  return "値が公表されていません";
}

function FactRow({ area, manifest, factKey }: { area: AreaRecord; manifest: Manifest; factKey: FactKey }) {
  const definition = FACTS[factKey];
  const fact = area.facts[factKey];
  const meta = manifest.facts[factKey];
  const total = meta.distribution.count;

  return (
    <tr data-missing={fact.value === null}>
      <th scope="row">
        <span className="life-table__name">{definition.label}</span>
        <details className="life-table__about">
          <summary>算出方法と注意</summary>
          <div className="prose">
            <p>{definition.summary}</p>
            <p>
              <strong>算出方法</strong>：{definition.method}
            </p>
            <ul>
              {definition.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <p className="life-table__sources">
              資料：
              {[
                ...meta.sources.map((source) => `${source.statName}「${source.name}」`),
                ...meta.documents.map((document) => `${document.publisher}「${document.title}」`)
              ].join("、")}
            </p>
          </div>
        </details>
      </th>
      <td className="life-table__value">
        {fact.value === null ? (
          <span className="life-table__missing">{missingText(area, definition)}</span>
        ) : (
          <>
            <strong>{formatFact(definition, fact.value)}</strong>
            <BasisLine definition={definition} basis={fact.basis} />
          </>
        )}
      </td>
      <td className="life-table__period">{meta.period}</td>
      <td className="life-table__rank">
        {fact.rank !== null ? (
          <>
            <strong>
              {formatNumber(fact.rank)}
              <small>位</small>
            </strong>
            <span>/{formatNumber(total)}</span>
          </>
        ) : (
          <span className="summary__dash" aria-label="順位なし">
            —
          </span>
        )}
      </td>
      <td className="life-table__position">
        {fact.rank !== null && (
          <RangeBar
            position={positionFromRank(fact.rank, total)}
            label={`全国${formatNumber(total)}市区町村のうち、値が大きい順で${formatNumber(fact.rank)}位`}
          />
        )}
      </td>
    </tr>
  );
}

/** くらしの指標。補助スコアは付けず、値と全国順位だけを示す。 */
export function LifePanel({ area, manifest }: { area: AreaRecord; manifest: Manifest }) {
  const furusato = manifest.additionalSources.find((source) => source.id === "furusato");

  return (
    <div className="life">
      {FACT_GROUPS.map((group) => {
        const keys = FACT_KEYS.filter((key) => FACTS[key].group === group.id);
        return (
          <section className="block" aria-labelledby={`life-${group.id}`} key={group.id}>
            <header className="block__head">
              <h3 id={`life-${group.id}`}>{group.label}</h3>
              {group.id === "furusato" && furusato && <p>出典 {furusato.name}</p>}
            </header>
            <ScrollRegion label={`${group.label}の表`}>
              <table className="life-table">
                <colgroup>
                  <col className="life-table__col-name" />
                  <col className="life-table__col-value" />
                  <col className="life-table__col-period" />
                  <col className="life-table__col-rank" />
                  <col />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">項目</th>
                    <th scope="col" className="is-numeric">
                      値
                    </th>
                    <th scope="col">基準時点</th>
                    <th scope="col" className="is-numeric">
                      全国順位
                    </th>
                    <th scope="col">
                      全国での位置
                      <span className="summary__scale" aria-hidden="true">
                        小 ← 中央値 → 大
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((key) => (
                    <FactRow key={key} area={area} manifest={manifest} factKey={key} />
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
          </section>
        );
      })}
      <ul className="notes">
        <li>
          全国順位は、政令指定都市の区を除く市区町村のうち値があるものの中で、値が大きい順に数えています（同じ値は同順位）。値の大小の順で、良し悪しの順ではありません。
        </li>
        <li>くらしの指標は、補助スコアと総合補助スコアには含めていません。</li>
      </ul>
    </div>
  );
}

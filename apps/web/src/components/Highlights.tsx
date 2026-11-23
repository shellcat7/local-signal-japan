import {
  areaFullName,
  findHighlights,
  toNationalRow,
  type AreaRecord,
  type Manifest,
  type NationalFile
} from "@local-signal-japan/core";
import type { AsyncState } from "../lib/useAsync";
import { cardSources, ShareButtons } from "./ShareButtons";

type HighlightsProps = {
  area: AreaRecord;
  manifest: Manifest;
  national: AsyncState<NationalFile>;
};

/** その市区町村が全国の上位・下位10位以内に入る項目。決まった規則で抜き出すだけで、良し悪しは判断しない。 */
export function Highlights({ area, manifest, national }: HighlightsProps) {
  if (area.kind === "ward") {
    return (
      <section className="block highlights" aria-labelledby="highlights-title">
        <header className="block__head">
          <h3 id="highlights-title">全国で目立つところ</h3>
        </header>
        <p className="empty">政令指定都市の区は、市全体と重なるため全国の比較に含めていません。</p>
      </section>
    );
  }

  const rows = national.status === "ready" ? national.value.areas : null;
  const target = rows?.find((row) => row.code === area.code) ?? toNationalRow(area);
  const items = rows ? findHighlights(target, rows, manifest) : [];
  const name = areaFullName(area);
  const first = items[0];

  return (
    <section className="block highlights" aria-labelledby="highlights-title">
      <header className="block__head">
        <h3 id="highlights-title">全国で目立つところ</h3>
        {rows && (
          <ShareButtons
            filename={`machinomonosashi-${area.code}.png`}
            text={
              first
                ? `${name}は、${first.label}が${first.phrase}（${first.valueText}、${first.period}）。`
                : `${name}の公的統計`
            }
            card={() => ({
              kind: "highlights",
              name: area.name,
              sub: area.prefName,
              items: items.slice(0, 5).map((item) => ({
                phrase: item.phrase,
                label: item.label,
                value: item.valueText,
                period: item.period,
                top: item.rank === 1
              })),
              empty: "全国の上位・下位10位以内に入る項目はありません。",
              sources: cardSources(manifest, { furusato: items.some((item) => item.key.startsWith("furusato")) })
            })}
          />
        )}
      </header>
      {national.status === "loading" && <p className="empty">全国のデータを読み込んでいます…</p>}
      {national.status === "error" && <p className="empty">{national.message}</p>}
      {rows &&
        (items.length > 0 ? (
          <ol className="highlights__list">
            {items.map((item) => (
              <li key={item.key} data-top={item.rank === 1}>
                <span className="highlights__phrase">{item.phrase}</span>
                <span className="highlights__label">
                  {item.label}
                  <small>{item.period}</small>
                </span>
                <strong className="highlights__value">{item.valueText}</strong>
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty">全国の上位・下位10位以内に入る項目はありません。</p>
        ))}
      <ul className="notes">
        <li>
          政令指定都市の区を除く全国の市区町村の中で、値が大きい側・小さい側からそれぞれ10位以内に入る項目を、決まった規則で抜き出しています。良し悪しを表すものではありません。
        </li>
        <li>人口の少ない市区町村で大きく動く項目（婚姻率など）は、人口1万人以上の市区町村の中で比べています。</li>
      </ul>
    </section>
  );
}

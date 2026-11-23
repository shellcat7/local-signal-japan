import { ArrowRight } from "lucide-react";
import {
  areaLocalName,
  formatMetric,
  INDICATORS,
  rowOverallScore,
  rowScore,
  rowValue,
  type IndicatorKey,
  type NationalRow
} from "@local-signal-japan/core";
import { RangeBar } from "./RangeBar";

type HeroPreviewProps = {
  row: NationalRow;
  prefName: string;
  onOpen: (areaCode: string) => void;
};

/** 例として見せる指標と、その短い名前。 */
const PREVIEW_ROWS: Array<{ key: IndicatorKey; label: string }> = [
  { key: "population", label: "人口の増減率" },
  { key: "aging", label: "高齢化率" },
  { key: "migration", label: "転入超過率" },
  { key: "income", label: "1人当たり所得" }
];

/** トップページに置く、市区町村ページの見本。実際のデータをそのまま使う。 */
export function HeroPreview({ row, prefName, onOpen }: HeroPreviewProps) {
  const overall = rowOverallScore(row);

  return (
    <aside className="preview" aria-label="表示の例">
      <p className="preview__eyebrow">表示の例</p>
      <header className="preview__head">
        <div>
          <p>{prefName}</p>
          <h3>{areaLocalName(row)}</h3>
        </div>
        <code>{row.code}</code>
      </header>

      {overall !== null && (
        <div className="preview__score">
          <p>総合補助スコア</p>
          <p className="preview__figure">
            {overall}
            <small>/100</small>
          </p>
          <RangeBar position={overall} variant="fill" tone="night" label={`総合補助スコア ${overall}`} />
        </div>
      )}

      <dl className="preview__rows">
        {PREVIEW_ROWS.map(({ key, label }) => {
          const value = rowValue(row, key);
          const score = rowScore(row, key);
          if (value === null || score === null) return null;
          return (
            <div key={key}>
              <dt>{label}</dt>
              <dd>
                <strong>{formatMetric(INDICATORS[key], value)}</strong>
                <RangeBar position={score} variant="fill" tone="night" label={`補助スコア ${score}`} />
              </dd>
            </div>
          );
        })}
      </dl>

      <button type="button" className="preview__open" onClick={() => onOpen(row.code)}>
        {areaLocalName(row)}を開く
        <ArrowRight size={14} aria-hidden="true" />
      </button>
    </aside>
  );
}

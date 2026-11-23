import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  areaLocalName,
  findSimilarAreas,
  formatMetric,
  formatNumber,
  INDICATOR_KEYS,
  INDICATORS,
  metricPeriodText,
  overallScore,
  rowOverallScore,
  rowScore,
  rowValue,
  selectPeers,
  toNationalRow,
  valuePosition,
  type AreaIndex,
  type AreaRecord,
  type IndicatorKey,
  type Manifest,
  type NationalRow,
  type PrefectureFile
} from "@local-signal-japan/core";
import { loadNational } from "../lib/data";
import { MAX_COMPARE } from "../lib/route";
import { useAsync } from "../lib/useAsync";
import { RangeBar } from "./RangeBar";
import { ScrollRegion } from "./ScrollRegion";
import { SearchBox } from "./SearchBox";

type MetricId = "residents" | "overall" | IndicatorKey;
type Scope = "peers" | "all";

type ComparisonPanelProps = {
  area: AreaRecord;
  prefecture: PrefectureFile;
  manifest: Manifest;
  index: AreaIndex;
  /** 並べて比べる市区町村のコード（表示中の市区町村を除く）。 */
  compare: string[];
  onCompareChange: (codes: string[]) => void;
  onSelect: (areaCode: string) => void;
};

/** 都道府県内の順位で初期表示する、人口規模が近い市区町村の数。 */
const PEER_COUNT = 9;
/** 追加の候補として出す市区町村の数。 */
const SUGGESTION_COUNT = 5;

function metricValue(area: AreaRecord, metric: MetricId): number | null {
  if (metric === "residents") return area.population;
  return metric === "overall" ? overallScore(area) : area.indicators[metric].value;
}

function metricText(metric: MetricId, value: number | null): string {
  if (value === null) return "欠損";
  if (metric === "residents") return `${formatNumber(value)}人`;
  return metric === "overall" ? `${value}` : formatMetric(INDICATORS[metric], value);
}

type SuggestionProps = {
  title: string;
  note: string;
  rows: readonly NationalRow[];
  prefNames: ReadonlyMap<string, string>;
  disabled: boolean;
  onAdd: (code: string) => void;
};

function Suggestions({ title, note, rows, prefNames, disabled, onAdd }: SuggestionProps) {
  if (rows.length === 0) return null;

  return (
    <div className="suggestions">
      <p className="suggestions__title">
        {title}
        <span>{note}</span>
      </p>
      <ul>
        {rows.map((row) => (
          <li key={row.code}>
            <button type="button" className="add-button" disabled={disabled} onClick={() => onAdd(row.code)}>
              <span aria-hidden="true">＋</span>
              <span className="visually-hidden">比較に追加: </span>
              {areaLocalName(row)}
              <small>{prefNames.get(row.prefCode)}</small>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ComparisonPanel({
  area,
  prefecture,
  manifest,
  index,
  compare,
  onCompareChange,
  onSelect
}: ComparisonPanelProps) {
  const [metric, setMetric] = useState<MetricId>("residents");
  const [scope, setScope] = useState<Scope>("peers");
  const loadRows = useCallback(() => loadNational(manifest), [manifest]);
  const [national, retry] = useAsync(loadRows);

  const prefNames = useMemo(() => new Map(index.prefectures.map((pref) => [pref.code, pref.name])), [index]);
  const target = useMemo(() => toNationalRow(area), [area]);
  const byCode = useMemo(
    () => new Map((national.status === "ready" ? national.value.areas : []).map((row) => [row.code, row])),
    [national]
  );

  // 別の市区町村へ切り替えている間は、表示中の市区町村が比較の一覧に含まれることがある。同じ列を2つ並べない。
  const others = compare.filter((code) => code !== area.code);
  const compared = others.map((code) => byCode.get(code)).filter((row) => row !== undefined);
  const columns = [target, ...compared];
  const taken = [area.code, ...others];
  const full = others.length >= MAX_COMPARE;
  const pickerRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const refocusRef = useRef(false);
  const comparedKey = others.join(",");

  // 追加・削除で押したボタンが消えるので、フォーカスを追加欄（上限に達したら見出し）へ移す。
  useEffect(() => {
    if (!refocusRef.current) return;
    refocusRef.current = false;
    const input = pickerRef.current?.querySelector<HTMLInputElement>("input:not(:disabled)");
    (input ?? headingRef.current)?.focus();
  }, [comparedKey]);

  const add = (code: string) => {
    if (full || taken.includes(code)) return;
    refocusRef.current = true;
    onCompareChange([...others, code]);
  };
  const remove = (code: string) => {
    refocusRef.current = true;
    onCompareChange(others.filter((candidate) => candidate !== code));
  };

  const similar = useMemo(
    () =>
      national.status === "ready"
        ? findSimilarAreas(national.value.areas, target, SUGGESTION_COUNT + MAX_COMPARE).map((entry) => entry.row)
        : [],
    [national, target]
  );
  const sizePeers = useMemo(
    () => selectPeers(prefecture.areas, area, SUGGESTION_COUNT + MAX_COMPARE).map(toNationalRow),
    [prefecture, area]
  );
  const notTaken = (rows: readonly NationalRow[]) =>
    rows.filter((row) => !taken.includes(row.code)).slice(0, SUGGESTION_COUNT);

  const rankingRows = useMemo(() => {
    const members = scope === "peers" ? [area, ...selectPeers(prefecture.areas, area, PEER_COUNT)] : prefecture.areas;
    return members
      .map((member) => ({ member, value: metricValue(member, metric) }))
      .sort(
        (a, b) =>
          (b.value ?? Number.NEGATIVE_INFINITY) - (a.value ?? Number.NEGATIVE_INFINITY) ||
          a.member.code.localeCompare(b.member.code)
      );
  }, [area, prefecture, metric, scope]);

  // 棒は 0 を起点に伸ばす。負の値がある指標(人口増減率など)は 0 の位置が左端から動く。
  const values = rankingRows.map((row) => row.value).filter((value) => value !== null);
  const domainMin = Math.min(0, ...values);
  // 補助スコアは0〜100の目盛りに固定し、指標値はデータの範囲に合わせる。
  const domainMax = metric === "overall" ? 100 : Math.max(0, ...values);
  const span = domainMax - domainMin || 1;
  const zero = ((0 - domainMin) / span) * 100;

  const metricName =
    metric === "residents" ? "人口" : metric === "overall" ? "総合補助スコア" : INDICATORS[metric].metricLabel;
  const metricPeriod =
    metric === "residents"
      ? `${manifest.indicators.population.year}年`
      : metric === "overall"
        ? null
        : metricPeriodText(metric, manifest.indicators[metric].year);

  return (
    <div className="comparison">
      <section className="block" aria-labelledby="compare-title">
        <header className="block__head">
          <h3 id="compare-title" ref={headingRef} tabIndex={-1}>
            並べて比べる
          </h3>
          <p>
            追加 {others.length}/{MAX_COMPARE}
          </p>
        </header>

        {national.status === "error" && (
          <div className="notice notice--action" role="alert">
            <p>{national.message}</p>
            <button type="button" className="button" onClick={retry}>
              再読み込み
            </button>
          </div>
        )}

        <div className="compare-picker" ref={pickerRef}>
          <SearchBox
            index={index}
            variant="inline"
            label="比べる市区町村を追加"
            placeholder={
              full
                ? `${MAX_COMPARE}つまで。どれかを外すと追加できます`
                : "全国の市区町村から追加（名前・よみがな・コード）"
            }
            disabled={full}
            clearOnSelect
            exclude={taken}
            onSelect={add}
          />
          <Suggestions
            title="指標の傾向が近い"
            note="全国から、補助スコアの並び方と人口規模が近い順"
            rows={notTaken(similar)}
            prefNames={prefNames}
            disabled={full}
            onAdd={add}
          />
          <Suggestions
            title="人口規模が近い"
            note={`${prefecture.prefName}の中で`}
            rows={notTaken(sizePeers)}
            prefNames={prefNames}
            disabled={full}
            onAdd={add}
          />
        </div>

        <ScrollRegion label="並べて比べる表">
          <table className="compare-table">
            <thead>
              <tr>
                <th scope="col">指標</th>
                {columns.map((row) => (
                  <th scope="col" key={row.code} className={row.code === area.code ? "is-current" : undefined}>
                    {row.code === area.code ? (
                      <span className="compare-table__name">
                        {areaLocalName(row)}
                        <small>表示中</small>
                      </span>
                    ) : (
                      <span className="compare-table__name">
                        <button type="button" className="link-button" onClick={() => onSelect(row.code)}>
                          {areaLocalName(row)}
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`${areaLocalName(row)}を比較から外す`}
                          onClick={() => remove(row.code)}
                        >
                          <span aria-hidden="true">×</span>
                        </button>
                      </span>
                    )}
                    <span className="cell-note">{prefNames.get(row.prefCode)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">
                  人口
                  <span className="cell-note is-mono">{manifest.indicators.population.year}年</span>
                </th>
                {columns.map((row) => (
                  <td key={row.code} className={row.code === area.code ? "is-current" : undefined}>
                    <strong>{row.population === null ? "欠損" : `${formatNumber(row.population)}人`}</strong>
                  </td>
                ))}
              </tr>
              {INDICATOR_KEYS.map((key) => (
                <tr key={key}>
                  <th scope="row">
                    {INDICATORS[key].columnLabel}
                    <span className="cell-note">{metricPeriodText(key, manifest.indicators[key].year)}</span>
                  </th>
                  {columns.map((row) => {
                    const value = rowValue(row, key);
                    const position = valuePosition(key, rowScore(row, key));
                    return (
                      <td key={row.code} className={row.code === area.code ? "is-current" : undefined}>
                        <strong>
                          {value === null ? (
                            "欠損"
                          ) : (
                            <>
                              {formatNumber(value, INDICATORS[key].decimals, INDICATORS[key].signed)}
                              {INDICATORS[key].unit !== "" && <small>{INDICATORS[key].unit}</small>}
                            </>
                          )}
                        </strong>
                        {position !== null && (
                          <RangeBar
                            position={position}
                            label={`全国での位置。値が小さい側から数えて${position}%のところ。`}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <th scope="row">
                  総合補助スコア
                  <span className="cell-note">利用できる指標の平均</span>
                </th>
                {columns.map((row) => {
                  const score = rowOverallScore(row);
                  return (
                    <td key={row.code} className={row.code === area.code ? "is-current" : undefined}>
                      <strong>{score ?? "欠損"}</strong>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </ScrollRegion>
        <ul className="notes">
          <li>値の下の線は全国での位置です。左端が最も値が小さい側、右端が最も大きい側、縦線が中央値です。</li>
          <li>
            「指標の傾向が近い」は、補助スコアの並び方と人口規模から求めた目安です。総務省の「類似団体」の区分とは異なります。
          </li>
          <li>並べた組み合わせは、このページのURLで共有できます。</li>
        </ul>
      </section>

      <section className="block" aria-labelledby="comparison-title">
        <header className="block__head">
          <h3 id="comparison-title">{prefecture.prefName}内での比較</h3>
        </header>

        <div className="filter-row">
          <label>
            <span>比べる値</span>
            <select value={metric} onChange={(event) => setMetric(event.target.value as MetricId)}>
              <option value="residents">人口</option>
              {INDICATOR_KEYS.map((key) => (
                <option key={key} value={key}>
                  {INDICATORS[key].metricLabel}
                </option>
              ))}
              <option value="overall">総合補助スコア</option>
            </select>
          </label>
          <label>
            <span>並べる範囲</span>
            <select value={scope} onChange={(event) => setScope(event.target.value as Scope)}>
              <option value="peers">人口規模が近い市区町村</option>
              <option value="all">
                {prefecture.prefName}のすべて（{prefecture.areas.length}）
              </option>
            </select>
          </label>
        </div>

        <table className="rank-table">
          <caption>
            {metricName}
            {metricPeriod && `（${metricPeriod}）`}の大きい順
          </caption>
          <thead className="visually-hidden">
            <tr>
              <th scope="col">順位</th>
              <th scope="col">市区町村</th>
              <th scope="col">{metricName}</th>
            </tr>
          </thead>
          <tbody>
            {rankingRows.map(({ member, value }) => {
              const selected = member.code === area.code;
              const end = value === null ? zero : ((value - domainMin) / span) * 100;
              // 同じ値は同じ順位にする(1位、2位、2位、4位…)。
              const rank = rankingRows.findIndex((row) => row.value === value) + 1;

              return (
                <tr key={member.code} className={selected ? "is-selected" : undefined}>
                  <td className="rank-table__rank">{value === null ? "—" : rank}</td>
                  <th scope="row" className="rank-table__name">
                    {selected ? (
                      <span aria-current="true">
                        {areaLocalName(member)}
                        <small>表示中</small>
                      </span>
                    ) : (
                      <button type="button" className="link-button" onClick={() => onSelect(member.code)}>
                        {areaLocalName(member)}
                      </button>
                    )}
                  </th>
                  <td className="rank-table__value">
                    <span className="rank-bar" aria-hidden="true">
                      <span className="rank-bar__zero" style={{ left: `${zero}%` }} />
                      {value !== null && (
                        <span
                          className={value < 0 ? "rank-bar__fill is-negative" : "rank-bar__fill"}
                          style={{ left: `${Math.min(zero, end)}%`, width: `${Math.abs(end - zero)}%` }}
                        />
                      )}
                    </span>
                    <span className="rank-table__figure">{metricText(metric, value)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {scope === "peers" && (
          <ul className="notes">
            <li>人口規模が近い市区町村を並べています。地理的に隣り合う市区町村とは限りません。</li>
          </ul>
        )}
      </section>
    </div>
  );
}

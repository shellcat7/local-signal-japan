import { useMemo, useState } from "react";
import {
  areaLocalName,
  formatMetric,
  formatNumber,
  INDICATOR_KEYS,
  INDICATORS,
  metricPeriodText,
  overallScore,
  selectPeers,
  type AreaRecord,
  type IndicatorKey,
  type Manifest,
  type PrefectureFile
} from "@local-signal-japan/core";

import { ScrollRegion } from "./ScrollRegion";

type MetricId = "overall" | IndicatorKey;
type Scope = "peers" | "all";

type ComparisonPanelProps = {
  area: AreaRecord;
  prefecture: PrefectureFile;
  manifest: Manifest;
  onSelect: (areaCode: string) => void;
};

/** 比較の初期表示で並べる、人口規模が近い市区町村の数。 */
const PEER_COUNT = 9;

function metricValue(area: AreaRecord, metric: MetricId): number | null {
  return metric === "overall" ? overallScore(area) : area.indicators[metric].value;
}

function metricText(metric: MetricId, value: number | null): string {
  if (value === null) return "欠損";
  return metric === "overall" ? `${value}` : formatMetric(INDICATORS[metric], value);
}

export function ComparisonPanel({ area, prefecture, manifest, onSelect }: ComparisonPanelProps) {
  const [metric, setMetric] = useState<MetricId>("overall");
  const [scope, setScope] = useState<Scope>("peers");

  const rows = useMemo(() => {
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
  const values = rows.map((row) => row.value).filter((value) => value !== null);
  const domainMin = Math.min(0, ...values);
  // 補助スコアは0〜100の目盛りに固定し、指標値はデータの範囲に合わせる。
  const domainMax = metric === "overall" ? 100 : Math.max(0, ...values);
  const span = domainMax - domainMin || 1;
  const zero = ((0 - domainMin) / span) * 100;

  const metricName = metric === "overall" ? "総合補助スコア" : INDICATORS[metric].metricLabel;
  const metricPeriod = metric === "overall" ? null : metricPeriodText(metric, manifest.indicators[metric].year);

  return (
    <div className="comparison">
      <section className="panel" aria-labelledby="comparison-title">
        <div className="panel__head">
          <h3 id="comparison-title">{prefecture.prefName}内での比較</h3>
          <p>
            {scope === "peers"
              ? "人口規模が近い市区町村を並べています。地理的に隣り合う市区町村とは限りません。"
              : `${prefecture.prefName}のすべての市区町村を並べています。`}
          </p>
        </div>

        <div className="filter-row">
          <label>
            <span>比べる値</span>
            <select value={metric} onChange={(event) => setMetric(event.target.value as MetricId)}>
              <option value="overall">総合補助スコア</option>
              {INDICATOR_KEYS.map((key) => (
                <option key={key} value={key}>
                  {INDICATORS[key].label}（{INDICATORS[key].metricLabel}）
                </option>
              ))}
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
            {rows.map(({ member, value }, position) => {
              const selected = member.code === area.code;
              const end = value === null ? zero : ((value - domainMin) / span) * 100;

              return (
                <tr key={member.code} className={selected ? "is-selected" : undefined}>
                  <td className="rank-table__rank">{value === null ? "—" : position + 1}</td>
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
      </section>

      <section className="panel" aria-labelledby="matrix-title">
        <div className="panel__head">
          <h3 id="matrix-title">指標の一覧</h3>
          <p>上の表と同じ市区町村について、すべての指標値を並べています。括弧内は補助スコアです。</p>
        </div>
        <ScrollRegion label="指標の一覧の表">
          <table className="data-table data-table--matrix">
            <thead>
              <tr>
                <th scope="col">市区町村</th>
                <th scope="col" className="is-numeric">
                  人口
                </th>
                <th scope="col" className="is-numeric">
                  総合
                </th>
                {INDICATOR_KEYS.map((key) => (
                  <th scope="col" className="is-numeric" key={key}>
                    {INDICATORS[key].label}
                    <span className="cell-note">
                      {INDICATORS[key].unit !== "" && `${INDICATORS[key].unit}・`}
                      {metricPeriodText(key, manifest.indicators[key].year)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ member }) => (
                <tr key={member.code} className={member.code === area.code ? "is-selected" : undefined}>
                  <th scope="row">{areaLocalName(member)}</th>
                  <td className="is-numeric">
                    {member.population === null ? "欠損" : formatNumber(member.population)}
                  </td>
                  <td className="is-numeric">{overallScore(member) ?? "欠損"}</td>
                  {INDICATOR_KEYS.map((key) => {
                    const { value, score } = member.indicators[key];
                    return (
                      <td className="is-numeric" key={key}>
                        {value === null ? (
                          "欠損"
                        ) : (
                          <>
                            {formatNumber(value, INDICATORS[key].decimals, INDICATORS[key].signed)}
                            <span className="cell-note">（{score}）</span>
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      </section>
    </div>
  );
}

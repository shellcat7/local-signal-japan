import { useMemo, useState } from "react";
import {
  AREA_KIND_LABELS,
  areaLocalName,
  formatMetric,
  formatNumber,
  INDICATOR_KEYS,
  INDICATORS,
  metricPeriodText,
  POPULATION_BANDS,
  rankNational,
  rowOverallScore,
  rowScore,
  type AreaIndex,
  type Manifest,
  type NationalFile,
  type PopulationBandId,
  type RankingMetric
} from "@local-signal-japan/core";
import type { RankingRoute } from "../lib/route";
import { RangeBar } from "./RangeBar";

type RankingViewProps = {
  route: RankingRoute;
  national: NationalFile;
  index: AreaIndex;
  manifest: Manifest;
  onChange: (route: RankingRoute) => void;
  onOpenArea: (areaCode: string) => void;
};

/** 1度に表示する件数。 */
const PAGE_SIZE = 50;

export function RankingView({ route, national, index, manifest, onChange, onOpenArea }: RankingViewProps) {
  const conditionKey = `${route.metric}|${route.order}|${route.prefCode ?? ""}|${route.size}`;
  // 表示件数は条件ごとに持つ。条件を変えたら先頭の PAGE_SIZE 件に戻る。
  const [expanded, setExpanded] = useState<{ key: string; count: number }>({ key: conditionKey, count: PAGE_SIZE });
  const visibleCount = expanded.key === conditionKey ? expanded.count : PAGE_SIZE;

  const ranked = useMemo(
    () =>
      rankNational(national.areas, {
        metric: route.metric,
        order: route.order,
        prefCode: route.prefCode,
        populationBand: route.size
      }),
    [national, route.metric, route.order, route.prefCode, route.size]
  );
  const prefNames = useMemo(() => new Map(index.prefectures.map((pref) => [pref.code, pref.name])), [index]);

  const isOverall = route.metric === "overall";
  const definition = isOverall ? null : INDICATORS[route.metric as Exclude<RankingMetric, "overall">];
  const metricName = definition ? definition.metricLabel : "総合補助スコア";
  const period = definition ? metricPeriodText(definition.key, manifest.indicators[definition.key].year) : null;
  const visible = ranked.slice(0, visibleCount);
  const valueText = (value: number) => (definition ? formatMetric(definition, value) : `${value}`);

  return (
    <div className="container ranking">
      <div className="filter-row" role="group" aria-label="ランキングの条件">
        <label>
          <span>並べる値</span>
          <select
            value={route.metric}
            onChange={(event) => onChange({ ...route, metric: event.target.value as RankingMetric })}
          >
            <option value="overall">総合補助スコア</option>
            {INDICATOR_KEYS.map((key) => (
              <option key={key} value={key}>
                {INDICATORS[key].label}（{INDICATORS[key].metricLabel}）
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>並び順</span>
          <select
            value={route.order}
            onChange={(event) => onChange({ ...route, order: event.target.value as "desc" | "asc" })}
          >
            <option value="desc">値が大きい順</option>
            <option value="asc">値が小さい順</option>
          </select>
        </label>
        <label>
          <span>都道府県</span>
          <select
            value={route.prefCode ?? ""}
            onChange={(event) => onChange({ ...route, prefCode: event.target.value || null })}
          >
            <option value="">全国</option>
            {index.prefectures.map((pref) => (
              <option key={pref.code} value={pref.code}>
                {pref.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>人口規模</span>
          <select
            value={route.size}
            onChange={(event) => onChange({ ...route, size: event.target.value as PopulationBandId })}
          >
            {POPULATION_BANDS.map((band) => (
              <option key={band.id} value={band.id}>
                {band.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="card card--flush" aria-labelledby="ranking-title">
        <header className="card__head">
          <div>
            <h3 id="ranking-title">
              {metricName}
              {period && <span className="is-mono">{period}</span>}
            </h3>
            <p>
              条件に合う{formatNumber(ranked.length)}団体を、{route.order === "desc" ? "値が大きい順" : "値が小さい順"}
              に並べています。政令指定都市の区は市全体と重複するため含めていません。
            </p>
          </div>
        </header>

        {ranked.length === 0 ? (
          <p className="empty">条件に合う市区町村がありません。条件を変えてください。</p>
        ) : (
          <div className="table-scroll" role="region" aria-label="ランキングの表" tabIndex={0}>
            <table className="ranking-table">
              <thead>
                <tr>
                  <th scope="col" className="is-numeric">
                    順位
                  </th>
                  <th scope="col">市区町村</th>
                  <th scope="col" className="is-numeric">
                    {metricName}
                  </th>
                  <th scope="col">補助スコア</th>
                  <th scope="col" className="is-numeric">
                    人口
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ row, value, rank }) => {
                  const score = definition ? rowScore(row, definition.key) : rowOverallScore(row);
                  return (
                    <tr key={row.code}>
                      <td className="is-numeric ranking-table__rank">{rank}</td>
                      <th scope="row">
                        <button type="button" className="link-button" onClick={() => onOpenArea(row.code)}>
                          {areaLocalName(row)}
                        </button>
                        <span className="cell-note">
                          {prefNames.get(row.prefCode)}・{AREA_KIND_LABELS[row.kind]}
                        </span>
                      </th>
                      <td className="is-numeric ranking-table__value">{valueText(value)}</td>
                      <td className="ranking-table__score">
                        {score !== null && (
                          <>
                            <RangeBar position={score} variant="fill" label={`補助スコア ${score}`} />
                            <span aria-hidden="true">{score}</span>
                          </>
                        )}
                      </td>
                      <td className="is-numeric">{row.population === null ? "—" : formatNumber(row.population)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {visibleCount < ranked.length && (
          <div className="card__foot card__foot--center">
            <button
              type="button"
              className="button"
              onClick={() => setExpanded({ key: conditionKey, count: visibleCount + PAGE_SIZE })}
            >
              さらに{Math.min(PAGE_SIZE, ranked.length - visibleCount)}件を表示
            </button>
            <span className="cell-note">
              {formatNumber(ranked.length)}団体中 {formatNumber(visible.length)}団体を表示中
            </span>
          </div>
        )}
      </section>
    </div>
  );
}

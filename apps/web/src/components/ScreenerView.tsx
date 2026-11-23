import { useState } from "react";
import {
  activeFilters,
  AREA_KIND_LABELS,
  areaLocalName,
  formatDate,
  formatNumber,
  INDICATOR_KEYS,
  INDICATORS,
  metricPeriodText,
  POPULATION_BANDS,
  rankNational,
  rowOverallScore,
  rowValue,
  unrankedNational,
  type AreaIndex,
  type IndicatorKey,
  type Manifest,
  type NationalFile,
  type NationalRow,
  type PopulationBandId,
  type RangeFilter,
  type RankingMetric
} from "@local-signal-japan/core";
import { downloadText, toCsv } from "../lib/download";
import { parseDecimalInput } from "../lib/number";
import { DEFAULT_RANKING, type RankingRoute } from "../lib/route";
import { ScrollRegion } from "./ScrollRegion";

type ScreenerViewProps = {
  route: RankingRoute;
  national: NationalFile;
  index: AreaIndex;
  manifest: Manifest;
  onChange: (route: RankingRoute) => void;
  onOpenArea: (areaCode: string) => void;
};

/** 1度に表示する件数。 */
const PAGE_SIZE = 50;

/** 条件ごとの表示件数。市区町村を開いて戻ってきたときに、続きから見られるようにする。 */
const shownCounts = new Map<string, number>();

/** 条件の欄に添える単位。「事業所」は列名と重なるので出さない。 */
const unitOf = (key: IndicatorKey) => (key === "business" ? "" : INDICATORS[key].unit);

/** 表の列見出し。幅を取らないよう、名前・単位・基準時点を3行に分ける。 */
const COLUMN_HEADS: Record<IndicatorKey, { name: string; unit: string }> = {
  population: { name: "人口増減率", unit: "%" },
  aging: { name: "高齢化率", unit: "%" },
  migration: { name: "転入超過率", unit: "%" },
  business: { name: "事業所数", unit: "千人当たり" },
  employment: { name: "完全失業率", unit: "%" },
  income: { name: "課税対象所得", unit: "万円" },
  fiscal: { name: "財政力指数", unit: "指数" }
};

const plainValue = (key: IndicatorKey, value: number | null) =>
  value === null ? null : formatNumber(value, INDICATORS[key].decimals, INDICATORS[key].signed);

type BoundInputProps = {
  value: number | undefined;
  label: string;
  onCommit: (value: number | undefined) => void;
};

/** 下限・上限の入力欄。数値として読める間だけ条件に反映し、読めない文字は欄を離れたときに元へ戻す。 */
function BoundInput({ value, label, onCommit }: BoundInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const invalid = draft !== null && parseDecimalInput(draft) === "invalid";

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      aria-label={label}
      aria-invalid={invalid || undefined}
      value={draft ?? (value === undefined ? "" : String(value))}
      onChange={(event) => {
        setDraft(event.target.value);
        const parsed = parseDecimalInput(event.target.value);
        if (parsed !== "invalid") onCommit(parsed);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

export function ScreenerView({ route, national, index, manifest, onChange, onOpenArea }: ScreenerViewProps) {
  const filters = activeFilters(route.filters);
  const conditionKey = [
    route.metric,
    route.order,
    route.prefCode ?? "",
    route.size,
    ...filters.map(([key, range]) => `${key}:${range.min ?? ""}..${range.max ?? ""}`)
  ].join("|");
  const [expanded, setExpanded] = useState(() => ({
    key: conditionKey,
    count: shownCounts.get(conditionKey) ?? PAGE_SIZE
  }));
  const visibleCount = expanded.key === conditionKey ? expanded.count : PAGE_SIZE;

  const scope = { metric: route.metric, prefCode: route.prefCode, populationBand: route.size, filters: route.filters };
  // 並べる値がない市区町村も条件には合っているので、順位を付けずに末尾へ並べる。
  const matched: Array<{ row: NationalRow; rank: number | null }> = [
    ...rankNational(national.areas, { ...scope, order: route.order }),
    ...unrankedNational(national.areas, scope).map((row) => ({ row, rank: null }))
  ];
  const visible = matched.slice(0, visibleCount);
  const prefNames = new Map(index.prefectures.map((pref) => [pref.code, pref.name]));
  const periodOf = (key: IndicatorKey) => metricPeriodText(key, manifest.indicators[key].year);
  const narrowed = filters.length > 0 || route.prefCode !== null || route.size !== "all";

  const setBound = (key: IndicatorKey, side: "min" | "max", value: number | undefined) => {
    const next = { min: route.filters[key]?.min, max: route.filters[key]?.max, [side]: value };
    const range: RangeFilter = {
      ...(next.min === undefined ? {} : { min: next.min }),
      ...(next.max === undefined ? {} : { max: next.max })
    };
    onChange({ ...route, filters: { ...route.filters, [key]: range } });
  };

  // 同じ列をもう一度選ぶと、並び順を逆にする。
  const sortBy = (metric: RankingMetric) =>
    onChange({ ...route, metric, order: route.metric === metric && route.order === "desc" ? "asc" : "desc" });
  const ariaSort = (metric: RankingMetric) =>
    route.metric === metric ? (route.order === "desc" ? "descending" : "ascending") : undefined;
  const sortMark = (metric: RankingMetric) =>
    route.metric === metric ? (
      <span className="sort-button__mark" aria-hidden="true">
        {route.order === "desc" ? "▼" : "▲"}
      </span>
    ) : null;

  const showMore = () => {
    const count = visibleCount + PAGE_SIZE;
    shownCounts.set(conditionKey, count);
    setExpanded({ key: conditionKey, count });
  };

  const saveCsv = () => {
    const header = [
      "順位",
      "市区町村コード",
      "都道府県",
      "市区町村",
      "区分",
      `人口（人・${manifest.indicators.population.year}年）`,
      ...INDICATOR_KEYS.map((key) => {
        const unit = INDICATORS[key].unit;
        return `${INDICATORS[key].metricLabel}（${unit === "" ? "" : `${unit}・`}${periodOf(key)}）`;
      }),
      "総合補助スコア"
    ];
    const lines = matched.map(({ row, rank }) => [
      rank,
      row.code,
      prefNames.get(row.prefCode) ?? "",
      areaLocalName(row),
      AREA_KIND_LABELS[row.kind],
      row.population,
      ...INDICATOR_KEYS.map((key) => rowValue(row, key)),
      rowOverallScore(row)
    ]);
    const notes = [
      [],
      ["出典", manifest.source.attribution],
      ["注記", manifest.source.credit],
      ["データ取得日", formatDate(manifest.generatedAt)]
    ];
    downloadText(
      `local-signal-${formatDate(manifest.generatedAt)}.csv`,
      toCsv([header, ...lines, ...notes]),
      "text/csv"
    );
  };

  return (
    <div className="container screener">
      <form className="conditions" aria-label="条件" onSubmit={(event) => event.preventDefault()}>
        <div className="conditions__scope">
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
          <label>
            <span>並べる値</span>
            <select
              value={route.metric}
              onChange={(event) => onChange({ ...route, metric: event.target.value as RankingMetric })}
            >
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
            <span>並び順</span>
            <select
              value={route.order}
              onChange={(event) => onChange({ ...route, order: event.target.value as "desc" | "asc" })}
            >
              <option value="desc">値が大きい順</option>
              <option value="asc">値が小さい順</option>
            </select>
          </label>
        </div>

        <div className="conditions__ranges">
          <p className="conditions__legend" id="ranges-title">
            指標値の範囲<span>空欄は条件なし。右の数字は全国の中央値</span>
          </p>
          <ul aria-labelledby="ranges-title">
            {INDICATOR_KEYS.map((key) => {
              const definition = INDICATORS[key];
              const unit = unitOf(key);
              const name = `${definition.columnLabel}${unit === "" ? "" : `（${unit}）`}`;
              return (
                <li key={key} data-active={route.filters[key] !== undefined && filters.some(([k]) => k === key)}>
                  <span className="conditions__name">{name}</span>
                  <BoundInput
                    label={`${name}の下限`}
                    value={route.filters[key]?.min}
                    onCommit={(value) => setBound(key, "min", value)}
                  />
                  <span aria-hidden="true">〜</span>
                  <BoundInput
                    label={`${name}の上限`}
                    value={route.filters[key]?.max}
                    onCommit={(value) => setBound(key, "max", value)}
                  />
                  <span className="conditions__median">
                    {plainValue(key, manifest.indicators[key].distribution.p50)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </form>

      <section className="block results" aria-labelledby="results-title">
        <header className="block__head">
          <h3 id="results-title" role="status">
            該当 <strong>{formatNumber(matched.length)}</strong>市区町村
            <span>／対象 {formatNumber(manifest.counts.referenceAreas)}市区町村</span>
          </h3>
          <div className="button-row">
            {narrowed && (
              <button
                type="button"
                className="button"
                onClick={() => onChange({ ...DEFAULT_RANKING, metric: route.metric, order: route.order })}
              >
                条件をすべて外す
              </button>
            )}
            <button type="button" className="button" disabled={matched.length === 0} onClick={saveCsv}>
              CSVで保存
            </button>
          </div>
        </header>

        {matched.length === 0 ? (
          <p className="empty">条件に合う市区町村がありません。範囲を広げるか、条件を外してください。</p>
        ) : (
          <ScrollRegion label="条件に合う市区町村の表">
            <table className="screen-table">
              <thead>
                <tr>
                  <th scope="col" className="is-numeric">
                    順位
                  </th>
                  <th scope="col" className="screen-table__name">
                    市区町村
                  </th>
                  <th scope="col" className="is-numeric" aria-sort={ariaSort("residents")}>
                    <button type="button" className="sort-button" onClick={() => sortBy("residents")}>
                      人口{sortMark("residents")}
                      <small>人</small>
                      <small>{manifest.indicators.population.year}年</small>
                    </button>
                  </th>
                  {INDICATOR_KEYS.map((key) => (
                    <th scope="col" className="is-numeric" key={key} aria-sort={ariaSort(key)}>
                      <button type="button" className="sort-button" onClick={() => sortBy(key)}>
                        {COLUMN_HEADS[key].name}
                        {sortMark(key)}
                        <small>{COLUMN_HEADS[key].unit}</small>
                        <small>{periodOf(key)}</small>
                      </button>
                    </th>
                  ))}
                  <th scope="col" className="is-numeric" aria-sort={ariaSort("overall")}>
                    <button type="button" className="sort-button" onClick={() => sortBy("overall")}>
                      総合{sortMark("overall")}
                      <small>補助スコア</small>
                      <small>の平均</small>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ row, rank }) => (
                  <tr key={row.code}>
                    <td className="is-numeric screen-table__rank">{rank ?? "—"}</td>
                    <th scope="row" className="screen-table__name">
                      <button type="button" className="link-button" onClick={() => onOpenArea(row.code)}>
                        {areaLocalName(row)}
                      </button>
                      <small>{prefNames.get(row.prefCode)}</small>
                    </th>
                    <td className={route.metric === "residents" ? "is-numeric is-sorted" : "is-numeric"}>
                      {row.population === null ? "…" : formatNumber(row.population)}
                    </td>
                    {INDICATOR_KEYS.map((key) => (
                      <td className={route.metric === key ? "is-numeric is-sorted" : "is-numeric"} key={key}>
                        {plainValue(key, rowValue(row, key)) ?? (
                          <>
                            <span aria-hidden="true">…</span>
                            <span className="visually-hidden">欠損</span>
                          </>
                        )}
                      </td>
                    ))}
                    <td className={route.metric === "overall" ? "is-numeric is-sorted" : "is-numeric"}>
                      {rowOverallScore(row) ?? "…"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        )}

        {visibleCount < matched.length && (
          <p className="results__more">
            <button type="button" className="button" onClick={showMore}>
              さらに{Math.min(PAGE_SIZE, matched.length - visibleCount)}件を表示
            </button>
            <span>
              {formatNumber(matched.length)}件中 {formatNumber(visible.length)}件を表示
            </span>
          </p>
        )}

        <ul className="notes">
          <li>
            順位は、条件で絞り込んだ中で付けています。同じ値は同順位です。値の大小の順であり、良し悪しの順ではありません。
          </li>
          <li>
            「…」は値がそろわない指標（欠損）です。条件を付けた指標が欠損の市区町村は、条件に合わないものとして扱います。並べる値が欠損の市区町村は、順位を付けずに末尾に並べます。
          </li>
          <li>政令指定都市の区は、市全体と重複するため対象に含めていません。</li>
          <li>
            人口の少ない市区町村では、率や1人当たりの値が少数の増減で大きく動きます。人口規模とあわせて見てください。
          </li>
          <li>総合は、利用できる指標の補助スコア（全国の中での位置、0〜100）の平均です。</li>
        </ul>
      </section>
    </div>
  );
}

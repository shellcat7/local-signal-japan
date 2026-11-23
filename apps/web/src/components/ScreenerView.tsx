import { useCallback, useMemo, useState } from "react";
import {
  activeFilters,
  AREA_KIND_LABELS,
  areaLocalName,
  FACT_GROUPS,
  FACT_KEYS,
  FACTS,
  findTopic,
  formatDate,
  formatNumber,
  formatYen,
  INDICATOR_KEYS,
  INDICATORS,
  isFactKey,
  metricPeriodText,
  POPULATION_BANDS,
  rankNational,
  rowFact,
  rowOverallScore,
  rowValue,
  unrankedNational,
  type AreaIndex,
  type FactKey,
  type IndicatorKey,
  type Manifest,
  type MetricKey,
  type NationalFile,
  type NationalRow,
  type PopulationBandId,
  type RangeFilter,
  type RankingMetric
} from "@local-signal-japan/core";
import { loadMap } from "../lib/data";
import { downloadText, toCsv } from "../lib/download";
import { metricName, metricPeriod, metricShortName, metricValueText } from "../lib/metrics";
import { parseDecimalInput } from "../lib/number";
import { DEFAULT_RANKING, type RankingRoute } from "../lib/route";
import { useAsync } from "../lib/useAsync";
import { quantileBins } from "../lib/mapScale";
import { ChoroplethMap, mapFills, mapSvgString } from "./ChoroplethMap";
import { ScrollRegion } from "./ScrollRegion";
import { cardSources, ShareButtons } from "./ShareButtons";

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

/**
 * 条件の入力欄の単位。金額は「万円」で入れてもらい、円に直して比べる。
 * 「事業所」は名前と重なるので出さない。
 */
function inputUnit(key: MetricKey): { unit: string; scale: number } {
  if (isFactKey(key)) {
    const unit = FACTS[key].unit;
    return unit === "円" ? { unit: "万円", scale: 10_000 } : { unit, scale: 1 };
  }
  return { unit: key === "business" ? "" : INDICATORS[key].unit, scale: 1 };
}

function conditionLabel(key: MetricKey): string {
  const name = isFactKey(key) ? FACTS[key].columnLabel : INDICATORS[key].columnLabel;
  const { unit } = inputUnit(key);
  return `${name}${unit === "" ? "" : `（${unit}）`}`;
}

/** 表のセルに入れる値（単位は列見出しにあるので付けない。金額だけは億・万で書く）。 */
function cellText(key: MetricKey, value: number | null): string | null {
  if (value === null) return null;
  if (isFactKey(key)) {
    const definition = FACTS[key];
    return definition.unit === "円"
      ? formatYen(value, definition.signed)
      : formatNumber(value, definition.decimals, definition.signed);
  }
  return formatNumber(value, INDICATORS[key].decimals, INDICATORS[key].signed);
}

const rowMetricOf = (row: NationalRow, key: MetricKey) => (isFactKey(key) ? rowFact(row, key) : rowValue(row, key));

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

/** 絞り込みの条件を、1行の文にする（画像と共有の文に使う）。 */
function describeConditions(route: RankingRoute, prefNames: ReadonlyMap<string, string>): string {
  const parts: string[] = [];
  if (route.prefCode) parts.push(prefNames.get(route.prefCode) ?? route.prefCode);
  const band = POPULATION_BANDS.find((candidate) => candidate.id === route.size);
  if (band && band.id !== "all") parts.push(`人口${band.label}`);
  for (const [key, range] of activeFilters(route.filters)) {
    const name = isFactKey(key) ? FACTS[key].columnLabel : INDICATORS[key].columnLabel;
    const { unit, scale } = inputUnit(key);
    const bound = (value: number) => `${formatNumber(value / scale, 2).replace(/\.?0+$/, "")}${unit}`;
    if (range.min !== undefined && range.max !== undefined)
      parts.push(`${name} ${bound(range.min)}〜${bound(range.max)}`);
    else if (range.min !== undefined) parts.push(`${name} ${bound(range.min)}以上`);
    else if (range.max !== undefined) parts.push(`${name} ${bound(range.max)}以下`);
  }
  return parts.length > 0 ? parts.join("・") : "全国";
}

export function ScreenerView({ route, national, index, manifest, onChange, onOpenArea }: ScreenerViewProps) {
  const topic = findTopic(route.topic);
  // 条件を変えたら、特集の見出しは外す（もう特集と同じ一覧ではないため）。
  const update = (next: RankingRoute) => onChange({ ...next, topic: null });

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

  // 追加したが、まだ範囲を入れていないくらしの指標の条件。
  const [addedFacts, setAddedFacts] = useState<FactKey[]>([]);
  const factFilterKeys = FACT_KEYS.filter((key) => addedFacts.includes(key) || route.filters[key] !== undefined);
  const factColumns = FACT_KEYS.filter(
    (key) => route.metric === key || filters.some(([filterKey]) => filterKey === key)
  );

  const scope = { metric: route.metric, prefCode: route.prefCode, populationBand: route.size, filters: route.filters };
  // 並べる値がない市区町村も条件には合っているので、順位を付けずに末尾へ並べる。
  const matched: Array<{ row: NationalRow; rank: number | null }> = useMemo(
    () => [
      ...rankNational(national.areas, { ...scope, order: route.order }),
      ...unrankedNational(national.areas, scope).map((row) => ({ row, rank: null }))
    ],
    // scope は route から作るので、route の値で十分。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [national, conditionKey]
  );
  const visible = matched.slice(0, visibleCount);
  const rankedCount = matched.filter(({ rank }) => rank !== null).length;
  const missingCount = matched.length - rankedCount;
  const prefNames = useMemo(() => new Map(index.prefectures.map((pref) => [pref.code, pref.name])), [index]);
  const periodOf = (key: IndicatorKey) => metricPeriodText(key, manifest.indicators[key].year);
  const narrowed = filters.length > 0 || route.prefCode !== null || route.size !== "all";
  const usesFurusato = [route.metric, ...filters.map(([key]) => key)].some((key) => key.startsWith("furusato"));

  const loadMapData = useCallback(() => loadMap(manifest), [manifest]);
  const [mapData] = useAsync(route.display === "map" ? loadMapData : noMap);

  const metricValues = useMemo(
    () =>
      new Map(
        matched.map(({ row }) => [
          row.code,
          route.metric === "residents"
            ? row.population
            : route.metric === "overall"
              ? rowOverallScore(row)
              : rowMetricOf(row, route.metric)
        ])
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matched]
  );
  const ranks = useMemo(() => new Map(matched.map(({ row, rank }) => [row.code, rank])), [matched]);
  const names = useMemo(
    () =>
      new Map(national.areas.map((row) => [row.code, `${areaLocalName(row)}（${prefNames.get(row.prefCode) ?? ""}）`])),
    [national, prefNames]
  );
  const [pendingFact, setPendingFact] = useState<FactKey | "">("");
  const bins = useMemo(
    () => quantileBins([...metricValues.values()].filter((value): value is number => value !== null)),
    [metricValues]
  );

  const setBound = (key: MetricKey, side: "min" | "max", value: number | undefined) => {
    const { scale } = inputUnit(key);
    // 万円で入れた金額を円に直す。小数の誤差（5699.999…）が残らないよう、円の単位に丸める。
    const scaled = value === undefined ? undefined : scale === 1 ? value : Math.round(value * scale);
    const next = { min: route.filters[key]?.min, max: route.filters[key]?.max, [side]: scaled };
    const range: RangeFilter = {
      ...(next.min === undefined ? {} : { min: next.min }),
      ...(next.max === undefined ? {} : { max: next.max })
    };
    update({ ...route, filters: { ...route.filters, [key]: range } });
  };

  const removeFact = (key: FactKey) => {
    setAddedFacts((current) => current.filter((candidate) => candidate !== key));
    const rest = { ...route.filters };
    delete rest[key];
    update({ ...route, filters: rest });
  };

  // 同じ列をもう一度選ぶと、並び順を逆にする。
  const sortBy = (metric: RankingMetric) =>
    update({ ...route, metric, order: route.metric === metric && route.order === "desc" ? "asc" : "desc" });
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

  const period = metricPeriod(route.metric, manifest);
  const title = topic?.title ?? `${metricName(route.metric)}の${route.order === "desc" ? "大きい順" : "小さい順"}`;
  const conditions = describeConditions(route, prefNames);
  const top = matched[0];
  const shareText = top
    ? `${title}${period ? `（${period}）` : ""}。1位は${areaLocalName(top.row)}（${prefNames.get(top.row.prefCode) ?? ""}）。${formatNumber(rankedCount)}市区町村の中での順位です。`
    : title;
  const countNote =
    missingCount > 0
      ? `該当 ${formatNumber(matched.length)}市区町村のうち、値がある${formatNumber(rankedCount)}市区町村の順位です。`
      : `該当 ${formatNumber(matched.length)}市区町村（全国${formatNumber(manifest.counts.referenceAreas)}市区町村のうち）。順位は値の大小の順です。`;

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
      "総合補助スコア",
      ...FACT_KEYS.map((key) => {
        const unit = FACTS[key].unit;
        return `${FACTS[key].label}（${unit === "" ? "" : `${unit}・`}${manifest.facts[key].period}）`;
      })
    ];
    const lines = matched.map(({ row, rank }) => [
      rank,
      row.code,
      prefNames.get(row.prefCode) ?? "",
      areaLocalName(row),
      AREA_KIND_LABELS[row.kind],
      row.population,
      ...INDICATOR_KEYS.map((key) => rowValue(row, key)),
      rowOverallScore(row),
      ...FACT_KEYS.map((key) => rowFact(row, key))
    ]);
    const notes = [
      [],
      ["出典", manifest.source.attribution],
      ...manifest.additionalSources.map((source) => ["出典", source.attribution]),
      ["注記", manifest.source.credit],
      ["データ取得日", formatDate(manifest.generatedAt)]
    ];
    downloadText(
      `machinomonosashi-${formatDate(manifest.generatedAt)}.csv`,
      toCsv([header, ...lines, ...notes]),
      "text/csv"
    );
  };

  const shareCard = () => {
    if (route.display === "map" && mapData.status === "ready") {
      const map = mapData.value;
      const svg = mapSvgString(map, mapFills(map, metricValues, bins));
      const [, , width, height] = map.viewBox;
      return {
        kind: "map" as const,
        title,
        subtitle: [period, conditions, `該当 ${formatNumber(matched.length)}市区町村`].filter(Boolean).join("・"),
        mapUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
        mapAspect: width / height,
        legend: [
          ...bins.map((bin) => ({
            color: bin.color,
            label:
              bin.min === bin.max
                ? metricValueText(route.metric, bin.min)
                : `${metricValueText(route.metric, bin.min)}〜${metricValueText(route.metric, bin.max)}`
          })),
          ...(missingCount > 0 ? [{ color: "#ffffff", label: "値なし", pattern: true }] : []),
          { color: "#ffffff", label: "条件に合わない" }
        ],
        sources: cardSources(manifest, { furusato: usesFurusato, map: map.source.attribution })
      };
    }
    return {
      kind: "ranking" as const,
      title,
      subtitle: [period, conditions].filter(Boolean).join("・"),
      rows: matched.slice(0, 10).map(({ row, rank }) => ({
        rank,
        name: areaLocalName(row),
        sub: prefNames.get(row.prefCode) ?? "",
        value:
          metricValues.get(row.code) == null ? "—" : metricValueText(route.metric, metricValues.get(row.code) as number)
      })),
      note: countNote,
      sources: cardSources(manifest, { furusato: usesFurusato })
    };
  };

  return (
    <div className="container screener">
      <form className="conditions" aria-label="条件" onSubmit={(event) => event.preventDefault()}>
        <div className="conditions__scope">
          <label>
            <span>都道府県</span>
            <select
              value={route.prefCode ?? ""}
              onChange={(event) => update({ ...route, prefCode: event.target.value || null })}
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
              onChange={(event) => update({ ...route, size: event.target.value as PopulationBandId })}
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
              onChange={(event) => update({ ...route, metric: event.target.value as RankingMetric })}
            >
              <option value="residents">人口</option>
              <optgroup label="7つの指標">
                {INDICATOR_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {INDICATORS[key].metricLabel}
                  </option>
                ))}
                <option value="overall">総合補助スコア</option>
              </optgroup>
              {FACT_GROUPS.map((group) => (
                <optgroup key={group.id} label={`くらし：${group.label}`}>
                  {FACT_KEYS.filter((key) => FACTS[key].group === group.id).map((key) => (
                    <option key={key} value={key}>
                      {FACTS[key].label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label>
            <span>並び順</span>
            <select
              value={route.order}
              onChange={(event) => update({ ...route, order: event.target.value as "desc" | "asc" })}
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
            {[...INDICATOR_KEYS, ...factFilterKeys].map((key: MetricKey) => {
              const name = conditionLabel(key);
              const { scale } = inputUnit(key);
              const median = isFactKey(key)
                ? manifest.facts[key].distribution.p50
                : manifest.indicators[key].distribution.p50;
              const range = route.filters[key];
              return (
                <li key={key} data-active={filters.some(([filterKey]) => filterKey === key)}>
                  <span className="conditions__name">{name}</span>
                  <BoundInput
                    label={`${name}の下限`}
                    value={range?.min === undefined ? undefined : range.min / scale}
                    onCommit={(value) => setBound(key, "min", value)}
                  />
                  <span aria-hidden="true">〜</span>
                  <BoundInput
                    label={`${name}の上限`}
                    value={range?.max === undefined ? undefined : range.max / scale}
                    onCommit={(value) => setBound(key, "max", value)}
                  />
                  <span className="conditions__median">
                    {isFactKey(key) ? (
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`${name}の条件を外す`}
                        onClick={() => removeFact(key)}
                      >
                        <span aria-hidden="true">×</span>
                      </button>
                    ) : (
                      cellText(key, median)
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="conditions__add">
            <label>
              <span>くらしの指標で絞り込む</span>
              <select value={pendingFact} onChange={(event) => setPendingFact(event.target.value as FactKey | "")}>
                <option value="">項目を選ぶ…</option>
                {FACT_GROUPS.map((group) => (
                  <optgroup key={group.id} label={group.label}>
                    {FACT_KEYS.filter((key) => FACTS[key].group === group.id && !factFilterKeys.includes(key)).map(
                      (key) => (
                        <option key={key} value={key}>
                          {FACTS[key].label}
                        </option>
                      )
                    )}
                  </optgroup>
                ))}
              </select>
            </label>
            {/* 選択欄は矢印キーで項目を移るたびに変わるので、追加はボタンで確定する。 */}
            <button
              type="button"
              className="button"
              disabled={pendingFact === ""}
              onClick={() => {
                if (pendingFact === "") return;
                setAddedFacts((current) => [...current, pendingFact]);
                setPendingFact("");
              }}
            >
              条件に加える
            </button>
          </div>
        </div>
      </form>

      <section className="block results" aria-labelledby="results-title">
        <header className="block__head">
          <h3 id="results-title" role="status">
            該当 <strong>{formatNumber(matched.length)}</strong>市区町村
            <span>／対象 {formatNumber(manifest.counts.referenceAreas)}市区町村</span>
            {missingCount > 0 && (
              <span className="results__missing">
                うち {formatNumber(missingCount)}市区町村は{metricShortName(route.metric)}
                の値がないため、順位を付けずに末尾に並べています
              </span>
            )}
          </h3>
          <div className="button-row">
            <div className="view-switch" role="group" aria-label="表示">
              <button
                type="button"
                aria-pressed={route.display === "table"}
                onClick={() => onChange({ ...route, display: "table" })}
              >
                表
              </button>
              <button
                type="button"
                aria-pressed={route.display === "map"}
                onClick={() => onChange({ ...route, display: "map" })}
              >
                地図
              </button>
            </div>
            {narrowed && (
              <button
                type="button"
                className="button"
                onClick={() => {
                  setAddedFacts([]);
                  update({ ...DEFAULT_RANKING, metric: route.metric, order: route.order, display: route.display });
                }}
              >
                条件をすべて外す
              </button>
            )}
            <button type="button" className="button" disabled={matched.length === 0} onClick={saveCsv}>
              CSVで保存
            </button>
          </div>
        </header>

        {matched.length > 0 && (
          <div className="results__share">
            <p>
              {title}
              {period && <span>{period}</span>}
            </p>
            <ShareButtons
              filename={`machinomonosashi-${topic?.id ?? route.metric}.png`}
              text={shareText}
              card={shareCard}
            />
          </div>
        )}

        {matched.length === 0 ? (
          <p className="empty">条件に合う市区町村がありません。範囲を広げるか、条件を外してください。</p>
        ) : route.display === "map" ? (
          mapData.status === "ready" ? (
            <>
              <ChoroplethMap
                map={mapData.value}
                metric={route.metric}
                values={metricValues}
                ranks={ranks}
                names={names}
                bins={bins}
                label={`${title}の地図。値の大きさを墨の濃さで示しています。同じ値は表でも確認できます。`}
                onOpenArea={onOpenArea}
              />
              <p className="map__source">
                地図：{mapData.value.source.attribution}（{mapData.value.source.edition}、{mapData.value.source.license}
                ）
              </p>
            </>
          ) : (
            <p className="empty">{mapData.status === "error" ? mapData.message : "地図を読み込んでいます…"}</p>
          )
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
                  {factColumns.map((key) => (
                    <th scope="col" className="is-numeric" key={key} aria-sort={ariaSort(key)}>
                      <button type="button" className="sort-button" onClick={() => sortBy(key)}>
                        {metricShortName(key)}
                        {sortMark(key)}
                        <small>{FACTS[key].unit === "円" ? "円" : FACTS[key].unit || "—"}</small>
                        <small>{manifest.facts[key].period.replace(/（.*）$/, "")}</small>
                      </button>
                    </th>
                  ))}
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
                    {[...factColumns, ...INDICATOR_KEYS].map((key: MetricKey) => (
                      <td className={route.metric === key ? "is-numeric is-sorted" : "is-numeric"} key={key}>
                        {cellText(key, rowMetricOf(row, key)) ?? (
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

        {route.display === "table" && visibleCount < matched.length && (
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
          <li>順位は、条件で絞り込んだ中で付けています（同じ値は同順位）。</li>
          <li>
            「…」は値がそろわない指標（欠損）です。条件を付けた指標が欠損の市区町村は条件に合わないものとして扱い、並べる値が欠損の市区町村は順位を付けずに末尾に並べます。
          </li>
          <li>人口の少ない市区町村では、率や1人当たりの値が少数の増減で大きく動きます。</li>
          {usesFurusato && (
            <li>
              ふるさと納税：
              {manifest.additionalSources.find((source) => source.id === "furusato")?.attribution}
              。受入額は、返礼品などの費用を差し引く前の金額です。
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}

/** 表を表示しているときは、地図を読まない。 */
const noMap = () => new Promise<never>(() => {});

import {
  activeFilters,
  AREA_KIND_LABELS,
  areaLocalName,
  FACT_KEYS,
  FACTS,
  formatDate,
  formatFact,
  formatMetric,
  formatNumber,
  INDICATOR_KEYS,
  INDICATORS,
  isFactKey,
  METRIC_KEYS,
  metricPeriodText,
  MIN_INDICATORS_FOR_OVERALL,
  POPULATION_BANDS,
  rankNational,
  unrankedNational,
  residentsAsOf,
  rowFact,
  rowOverallScore,
  rowScore,
  rowValue,
  type AdditionalSource,
  type AreaKind,
  type FactKey,
  type IndicatorFilters,
  type IndicatorKey,
  type Manifest,
  type MetricKey,
  type NationalRow,
  type PopulationBandId,
  type RangeFilter,
  type RankingMetric,
  type RankingOptions
} from "@local-signal-japan/core";
import { CliError } from "./errors";

/** 条件に使える演算子。>= は以上、<= は以下。 */
export type ScreenOperator = ">=" | "<=";
export type ScreenCondition = { key: MetricKey; op: ScreenOperator; value: number };

export const DEFAULT_SCREEN_LIMIT = 20;
const OVERALL_LABEL = "総合補助スコア";
const RESIDENTS_LABEL = "人口";
/** 並べ替えに使える値。人口、総合補助スコア、7指標の指標値、くらしの指標。 */
const SORT_METRICS: readonly RankingMetric[] = ["residents", "overall", ...METRIC_KEYS];
/** 金額（円）のくらしの指標。JSONでは円の数値に、読みやすく書いた文字列を添える。 */
export const MONEY_FACT_KEYS: readonly FactKey[] = FACT_KEYS.filter((key) => FACTS[key].unit === "円");
/** 統計ダッシュボード以外の出典のうち、ふるさと納税の値の出典。 */
export const FURUSATO_SOURCE_ID = "furusato";

export type Prefecture = { code: string; name: string };

/** コマンドラインから受け取ったままの指定。 */
export type ScreenArgs = {
  where?: readonly string[];
  sort?: string;
  order?: string;
  pref?: string;
  size?: string;
  limit?: string;
};

export type ScreenQuery = {
  filters: IndicatorFilters;
  metric: RankingMetric;
  order: "desc" | "asc";
  pref: Prefecture | null;
  size: PopulationBandId;
  /** 出力する件数。0 はすべて。 */
  limit: number;
};

/** 大文字・小文字の違いを問わずに、指標キー（7指標とくらしの指標）を決める。 */
function findMetricKey(text: string): MetricKey | undefined {
  const lower = text.toLowerCase();
  return METRIC_KEYS.find((key) => key.toLowerCase() === lower);
}

/** 表の列見出しなどに使う短い名前。 */
function columnLabelOf(key: MetricKey): string {
  return isFactKey(key) ? FACTS[key].columnLabel : INDICATORS[key].columnLabel;
}

function unitOf(key: MetricKey): string {
  return isFactKey(key) ? FACTS[key].unit : INDICATORS[key].unit;
}

/** 条件に使える指標キーの説明。例: aging（高齢化率（65歳以上人口の割合）、%） */
export function describeIndicatorKeys(): string[] {
  return INDICATOR_KEYS.map((key) => {
    const { metricLabel, unit } = INDICATORS[key];
    return `${key}（${metricLabel}${unit ? `、${unit}` : ""}）`;
  });
}

/** 条件に使えるくらしの指標キーの説明。例: vacancy（空き家率、%） */
export function describeFactKeys(): string[] {
  return FACT_KEYS.map((key) => {
    const { label, unit } = FACTS[key];
    return `${key}（${label}${unit ? `、${unit}` : ""}）`;
  });
}

/** 全角の英数字・記号や、不等号の別の書き方を、半角の書き方にそろえる。 */
function normalizeExpression(expression: string): string {
  return expression
    .normalize("NFKC")
    .replace(/[≧≥]/g, ">=")
    .replace(/[≦≤]/g, "<=")
    .replace(/\u2212/g, "-")
    .trim();
}

/** 「aging>=30」「vacancy<=20」のような条件を1つ読み取る。読み取れなければ、理由を添えたエラーにする。 */
export function parseCondition(expression: string): ScreenCondition {
  const match = /^([^<>=!\s]*)\s*([<>=!]*)\s*(.*)$/.exec(normalizeExpression(expression));
  const keyText = match?.[1] ?? "";
  const op = match?.[2] ?? "";
  const valueText = match?.[3] ?? "";

  if (keyText === "" || op === "") {
    throw new CliError(`条件は「<指標キー><演算子><数値>」の形で指定してください（例: "aging>=30"）: ${expression}`);
  }
  const key = findMetricKey(keyText);
  if (key === undefined) {
    throw new CliError(
      [
        `条件の指標キーが不明です: ${keyText.toLowerCase()}`,
        "使える指標キー:",
        ...describeIndicatorKeys().map((line) => `  ${line}`),
        "くらしの指標キー:",
        ...describeFactKeys().map((line) => `  ${line}`)
      ].join("\n")
    );
  }
  if (op !== ">=" && op !== "<=") {
    throw new CliError(`条件の演算子は >=（以上）と <=（以下）だけ使えます: ${expression}`);
  }
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(valueText)) {
    throw new CliError(`条件の値が数値ではありません（単位や桁区切りを付けずに指定してください）: ${expression}`);
  }

  return { key, op, value: Number(valueText) };
}

/**
 * 条件を指標ごとの範囲にまとめる。条件はすべて同時に満たすものとして扱うので、
 * 同じ向きの条件が重なったら厳しいほうを残す。
 */
export function buildFilters(conditions: readonly ScreenCondition[]): IndicatorFilters {
  const filters: IndicatorFilters = {};

  for (const { key, op, value } of conditions) {
    const range: RangeFilter = filters[key] ?? {};
    if (op === ">=") range.min = range.min === undefined ? value : Math.max(range.min, value);
    else range.max = range.max === undefined ? value : Math.min(range.max, value);
    filters[key] = range;
  }

  for (const [key, range] of activeFilters(filters)) {
    if (range.min !== undefined && range.max !== undefined && range.min > range.max) {
      throw new CliError(
        `条件が両立しません: ${columnLabelOf(key)}が ${range.min}以上 かつ ${range.max}以下 になっています。`
      );
    }
  }
  return filters;
}

export function parseSort(value: string | undefined): RankingMetric {
  const text = (value ?? "residents").trim().toLowerCase();
  const metric = SORT_METRICS.find((candidate) => candidate.toLowerCase() === text);
  if (metric) return metric;
  throw new CliError(
    `--sort には residents（人口）、overall（総合補助スコア）、指標キー（${INDICATOR_KEYS.join(", ")}）、` +
      `くらしの指標キー（${FACT_KEYS.join(", ")}）のどれかを指定してください: ${value}`
  );
}

export function parseOrder(value: string | undefined): "desc" | "asc" {
  const order = (value ?? "desc").trim().toLowerCase();
  if (order === "desc" || order === "asc") return order;
  throw new CliError(`--order には desc（大きい順）か asc（小さい順）を指定してください: ${value}`);
}

export function parseSize(value: string | undefined): PopulationBandId {
  const size = (value ?? "all").trim().toLowerCase();
  const band = POPULATION_BANDS.find((candidate) => candidate.id === size);
  if (band) return band.id;
  throw new CliError(
    `--size には ${POPULATION_BANDS.map((candidate) => candidate.id).join(" | ")} のどれかを指定してください: ${value}`
  );
}

export function parseLimit(value: string | undefined): number {
  if (value === undefined) return DEFAULT_SCREEN_LIMIT;
  if (/^\d+$/.test(value.trim())) return Number(value);
  throw new CliError(`--limit には0以上の整数を指定してください（0 はすべて）: ${value}`);
}

/** 都道府県名（「東京都」「東京」）か2桁コード（「13」）から都道府県を決める。 */
export function resolvePrefecture(prefectures: readonly Prefecture[], value: string): Prefecture {
  const text = value.normalize("NFKC").trim();
  const code = /^\d{1,2}$/.test(text) ? text.padStart(2, "0") : null;
  const found = prefectures.find((pref) =>
    code === null ? pref.name === text || pref.name.replace(/[都府県]$/, "") === text : pref.code === code
  );
  if (found) return { code: found.code, name: found.name };
  throw new CliError(`都道府県が見つかりません（都道府県名か2桁コードで指定してください。例: 東京都、13）: ${value}`);
}

export function parseScreenArgs(args: ScreenArgs, prefectures: readonly Prefecture[]): ScreenQuery {
  return {
    filters: buildFilters((args.where ?? []).map(parseCondition)),
    metric: parseSort(args.sort),
    order: parseOrder(args.order),
    pref: args.pref === undefined ? null : resolvePrefecture(prefectures, args.pref),
    size: parseSize(args.size),
    limit: parseLimit(args.limit)
  };
}

type IndicatorValues = Record<IndicatorKey, number | null>;
type FactValues = Record<FactKey, number | null>;

type ScreenArea = {
  code: string;
  name: string;
  prefCode: string;
  prefName: string;
  kind: AreaKind;
  population: number | null;
  overallScore: number | null;
  values: IndicatorValues;
  scores: IndicatorValues;
  /** くらしの指標の値。金額は円。 */
  facts: FactValues;
  /** 金額のくらしの指標を「18.9億円」のように書いたもの（欠損は null）。 */
  moneyTexts: Partial<Record<FactKey, string | null>>;
};

/**
 * rank は、条件で絞り込んだ中での順位。sortValue は並べ替えに使った値。
 * 条件には合うが並べ替えに使う値が欠損の市区町村は、どちらも null にして末尾に並べる。
 */
export type ScreenRow = { rank: number | null; sortValue: number | null } & ScreenArea;

export type ScreenIndicatorInfo = {
  label: string;
  metricLabel: string;
  unit: string;
  period: string;
  /** 出典の統計名。 */
  statName: string;
};

export type ScreenFactInfo = {
  label: string;
  columnLabel: string;
  /** 「円」は金額（値は円の数値）。 */
  unit: string;
  period: string;
  /** 出典の統計名・資料名。 */
  statName: string;
  /** dashboard = 統計ダッシュボード、furusato = 総務省「ふるさと納税に関する現況調査結果」。 */
  provider: "dashboard" | "furusato";
};

export type ScreenResult = {
  conditions: {
    /** 指標値の条件を「aging>=30」の形にそろえたもの。 */
    where: string[];
    filters: IndicatorFilters;
    sort: RankingMetric;
    order: "desc" | "asc";
    pref: Prefecture | null;
    size: PopulationBandId;
    limit: number;
    /** 条件を日本語で書いたもの。 */
    text: string;
  };
  /** 対象の市区町村の数（政令指定都市の区を除き、都道府県・人口規模で絞ったあと）。 */
  total: number;
  /** 条件に合う市区町村の数。 */
  matched: number;
  /** そのうち順位を付けた数。残りは並べ替えに使う値が欠損で、順位がない。 */
  ranked: number;
  /** rows に入れた数。 */
  returned: number;
  /** --limit で途中までしか入れていないとき true。 */
  truncated: boolean;
  /** 順位を付けた市区町村を順位順に、続けて順位のない市区町村をコード順に並べる。 */
  rows: ScreenRow[];
  indicators: Record<IndicatorKey, ScreenIndicatorInfo>;
  facts: Record<FactKey, ScreenFactInfo>;
  population: { label: string; unit: string; period: string };
  source: Manifest["source"] & { fetchedAt: string };
  /** 統計ダッシュボード以外の出典（ふるさと納税の値の出典）。 */
  additionalSources: AdditionalSource[];
};

function keyed<T>(valueOf: (key: IndicatorKey) => T): Record<IndicatorKey, T> {
  return Object.fromEntries(INDICATOR_KEYS.map((key) => [key, valueOf(key)])) as Record<IndicatorKey, T>;
}

function factKeyed<T>(valueOf: (key: FactKey) => T): Record<FactKey, T> {
  return Object.fromEntries(FACT_KEYS.map((key) => [key, valueOf(key)])) as Record<FactKey, T>;
}

/** 金額のくらしの指標を読みやすく書いたもの。 */
export function moneyTextsOf(valueOf: (key: FactKey) => number | null): Partial<Record<FactKey, string | null>> {
  return Object.fromEntries(
    MONEY_FACT_KEYS.map((key) => {
      const value = valueOf(key);
      return [key, value === null ? null : formatFact(FACTS[key], value)];
    })
  );
}

function toScreenArea(row: NationalRow, prefNames: ReadonlyMap<string, string>): ScreenArea {
  return {
    code: row.code,
    name: areaLocalName(row),
    prefCode: row.prefCode,
    prefName: prefNames.get(row.prefCode) ?? "",
    kind: row.kind,
    population: row.population,
    overallScore: rowOverallScore(row),
    values: keyed((key) => rowValue(row, key)),
    scores: keyed((key) => rowScore(row, key)),
    facts: factKeyed((key) => rowFact(row, key)),
    moneyTexts: moneyTextsOf((key) => rowFact(row, key))
  };
}

/** くらしの指標の出典の統計名・資料名。ふるさと納税の値は総務省の調査、それ以外は統計ダッシュボードの系列。 */
export function factStatName(manifest: Manifest, key: FactKey): string {
  const furusato = manifest.additionalSources.find((source) => source.id === FURUSATO_SOURCE_ID);
  const names = [
    ...(FACTS[key].provider === "furusato" && furusato ? [furusato.name] : []),
    ...manifest.facts[key].sources.map((source) => source.statName)
  ];
  return [...new Set(names)].join("・");
}

/**
 * 並べ替えの値があるかどうかを問わず、条件に合う市区町村を集める（コード順）。
 * rankNational は並べ替えの値がない市区町村を外すので、並べ替えに使える値のそれぞれで呼んで結果を合わせる。
 * 対象の決め方を core と二重に持たないための書き方。
 */
function collectAreas(rows: readonly NationalRow[], options: Omit<RankingOptions, "metric">): NationalRow[] {
  const found = new Map<string, NationalRow>();
  for (const metric of SORT_METRICS) {
    for (const { row } of rankNational(rows, { ...options, metric })) {
      found.set(row.code, row);
    }
  }
  return [...found.values()].sort((a, b) => a.code.localeCompare(b.code));
}

function sortLabel(metric: RankingMetric): string {
  if (metric === "residents") return RESIDENTS_LABEL;
  return metric === "overall" ? OVERALL_LABEL : columnLabelOf(metric);
}

/** 条件の数値は、指定されたとおりの桁で書く（負の数は表と同じ負号にする）。金額は桁区切りを付ける。 */
function boundText(value: number, unit: string): string {
  const text = String(value);
  const grouped =
    unit === "円"
      ? text.replace(/^(-?)(\d+)/, (_, sign: string, digits: string) => sign + digits.replace(/\B(?=(\d{3})+$)/g, ","))
      : text;
  return `${grouped.replace("-", "\u2212")}${unit}`;
}

function rangeText(range: RangeFilter, unit: string): string {
  const min = range.min === undefined ? "" : `${boundText(range.min, unit)}以上`;
  const max = range.max === undefined ? "" : `${boundText(range.max, unit)}以下`;
  return `${min}${max}`;
}

/** 条件を日本語で1行にまとめる。 */
export function describeConditions(query: ScreenQuery): string {
  const parts = activeFilters(query.filters).map(
    ([key, range]) => `${columnLabelOf(key)} ${rangeText(range, unitOf(key))}`
  );
  if (query.pref) parts.push(`都道府県 ${query.pref.name}`);
  const band = POPULATION_BANDS.find((candidate) => candidate.id === query.size);
  if (band && band.id !== "all") parts.push(`人口規模 ${band.label}`);
  if (parts.length === 0) parts.push("指定なし（全国）");

  parts.push(`並び順 ${sortLabel(query.metric)}の${query.order === "desc" ? "大きい順" : "小さい順"}`);
  return parts.join(" / ");
}

function whereExpressions(filters: IndicatorFilters): string[] {
  return activeFilters(filters).flatMap(([key, range]) => [
    ...(range.min === undefined ? [] : [`${key}>=${range.min}`]),
    ...(range.max === undefined ? [] : [`${key}<=${range.max}`])
  ]);
}

/** 条件に合う市区町村を抽出して順位を付ける。並べ替えと絞り込みは core の rankNational に任せる。 */
export function runScreen(
  rows: readonly NationalRow[],
  manifest: Manifest,
  prefectures: readonly Prefecture[],
  query: ScreenQuery
): ScreenResult {
  const prefNames = new Map(prefectures.map((pref) => [pref.code, pref.name]));
  const scope = { order: query.order, prefCode: query.pref?.code ?? null, populationBand: query.size };

  const ranked = rankNational(rows, { ...scope, metric: query.metric, filters: query.filters });
  // 並べ替えに使う値が欠損でも、条件に合う市区町村は一覧から落とさない。
  const unranked = unrankedNational(rows, { ...scope, metric: query.metric, filters: query.filters });
  const matched: ScreenRow[] = [
    ...ranked.map((entry) => ({ rank: entry.rank, sortValue: entry.value, ...toScreenArea(entry.row, prefNames) })),
    ...unranked.map((row) => ({ rank: null, sortValue: null, ...toScreenArea(row, prefNames) }))
  ];
  const shown = query.limit === 0 ? matched : matched.slice(0, query.limit);
  const populationYear = manifest.indicators.population.year;

  return {
    conditions: {
      where: whereExpressions(query.filters),
      filters: Object.fromEntries(activeFilters(query.filters)),
      sort: query.metric,
      order: query.order,
      pref: query.pref,
      size: query.size,
      limit: query.limit,
      text: describeConditions(query)
    },
    total: collectAreas(rows, scope).length,
    matched: matched.length,
    ranked: ranked.length,
    returned: shown.length,
    truncated: shown.length < matched.length,
    rows: shown,
    indicators: keyed((key) => ({
      label: INDICATORS[key].label,
      metricLabel: INDICATORS[key].metricLabel,
      unit: INDICATORS[key].unit,
      period: metricPeriodText(key, manifest.indicators[key].year),
      statName: [...new Set(manifest.indicators[key].sources.map((source) => source.statName))].join("・")
    })),
    facts: factKeyed((key) => ({
      label: FACTS[key].label,
      columnLabel: FACTS[key].columnLabel,
      unit: FACTS[key].unit,
      period: manifest.facts[key].period,
      statName: factStatName(manifest, key),
      provider: FACTS[key].provider
    })),
    population: {
      label: "住民基本台帳人口",
      unit: "人",
      period: `${populationYear}年${residentsAsOf(populationYear)}`
    },
    source: { ...manifest.source, fetchedAt: manifest.generatedAt },
    additionalSources: manifest.additionalSources
  };
}

/** 並べ替えか条件に使ったくらしの指標（定義順）。表に列を出し、基準時点と出典を添える。 */
export function involvedFacts(result: ScreenResult): FactKey[] {
  const { sort, filters } = result.conditions;
  return FACT_KEYS.filter((key) => key === sort || filters[key] !== undefined);
}

function isWide(codePoint: number): boolean {
  return (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe4f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  );
}

/** 等幅の端末での表示幅。漢字・かななどの全角文字は2桁ぶんに数える。 */
export function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    width += isWide(char.codePointAt(0) ?? 0) ? 2 : 1;
  }
  return width;
}

type Column = { header: string; align: "left" | "right"; cell: (row: ScreenRow) => string };

function pad(text: string, width: number, align: Column["align"]): string {
  const space = " ".repeat(Math.max(0, width - displayWidth(text)));
  return align === "left" ? `${text}${space}` : `${space}${text}`;
}

const MISSING_TEXT = "欠損";

function mark(label: string, isSortColumn: boolean): string {
  return isSortColumn ? `【${label}】` : label;
}

function indicatorColumn(key: IndicatorKey, isSortColumn: boolean): Column {
  const definition = INDICATORS[key];
  return {
    header: mark(definition.columnLabel, isSortColumn),
    align: "right",
    cell: (row) => {
      const value = row.values[key];
      return value === null ? MISSING_TEXT : formatMetric(definition, value);
    }
  };
}

function factColumn(key: FactKey, isSortColumn: boolean): Column {
  const definition = FACTS[key];
  return {
    header: mark(definition.columnLabel, isSortColumn),
    align: "right",
    cell: (row) => {
      const value = row.facts[key];
      return value === null ? MISSING_TEXT : formatFact(definition, value);
    }
  };
}

function residentsColumn(isSortColumn: boolean): Column {
  return {
    header: mark(RESIDENTS_LABEL, isSortColumn),
    align: "right",
    cell: (row) => (row.population === null ? MISSING_TEXT : `${formatNumber(row.population)}人`)
  };
}

/**
 * 並べ替えに使った値の列を【】付きで先頭に置き、続けて条件に使ったくらしの指標、
 * 7指標（定義順）、最後に人口を並べる。
 */
function tableColumns(metric: RankingMetric, facts: readonly FactKey[]): Column[] {
  const lead: Column[] = [
    { header: "順位", align: "right", cell: (row) => String(row.rank ?? "-") },
    { header: "コード", align: "left", cell: (row) => row.code },
    { header: "市区町村", align: "left", cell: (row) => row.name },
    { header: "都道府県", align: "left", cell: (row) => row.prefName }
  ];
  const factColumns = facts.filter((key) => key !== metric).map((key) => factColumn(key, false));
  const indicators = INDICATOR_KEYS.filter((key) => key !== metric).map((key) => indicatorColumn(key, false));

  if (metric === "residents") {
    return [...lead, residentsColumn(true), ...factColumns, ...indicators];
  }
  const sortColumn: Column =
    metric === "overall"
      ? { header: mark(OVERALL_LABEL, true), align: "right", cell: (row) => String(row.sortValue ?? MISSING_TEXT) }
      : isFactKey(metric)
        ? factColumn(metric, true)
        : indicatorColumn(metric, true);
  return [...lead, sortColumn, ...factColumns, ...indicators, residentsColumn(false)];
}

function renderTable(rows: readonly ScreenRow[], columns: readonly Column[]): string[] {
  const cells = rows.map((row) => columns.map((column) => column.cell(row)));
  const widths = columns.map((column, index) =>
    Math.max(displayWidth(column.header), ...cells.map((line) => displayWidth(line[index] ?? "")))
  );
  const line = (texts: readonly string[]) =>
    texts
      .map((text, index) => pad(text, widths[index] ?? 0, columns[index]?.align ?? "left"))
      .join("  ")
      .trimEnd();

  return [
    line(columns.map((column) => column.header)),
    widths.map((width) => "-".repeat(width)).join("  "),
    ...cells.map(line)
  ];
}

/** 条件と、該当・対象の市区町村の数。どの出力形式でも最初に示す。 */
export function screenHeaderLines(result: ScreenResult): string[] {
  const unranked = result.matched - result.ranked;
  const notes = [
    ...(unranked > 0
      ? [`うち${formatNumber(unranked)}件は${sortLabel(result.conditions.sort)}が欠損のため順位なし`]
      : []),
    ...(result.truncated ? [`先頭の${formatNumber(result.returned)}件を出力。すべて出すには --limit 0`] : [])
  ];
  return [
    `条件: ${result.conditions.text}`,
    `該当 ${formatNumber(result.matched)}市区町村／対象 ${formatNumber(result.total)}市区町村` +
      (notes.length > 0 ? `（${notes.join("。")}）` : "")
  ];
}

/**
 * 出典の行。統計ダッシュボードの出典とクレジットは常に、ふるさと納税の出典は furusato が true のときに入れる。
 * show など、ほかの出力でも同じ書き方を使う。
 */
export function attributionLines(
  source: Manifest["source"] & { fetchedAt: string },
  additionalSources: readonly AdditionalSource[],
  furusato: boolean
): string[] {
  const extra = furusato ? additionalSources.filter((item) => item.id === FURUSATO_SOURCE_ID) : [];
  return [
    `出典: ${source.attribution}（取得日 ${formatDate(source.fetchedAt)}）`,
    ...extra.map((item) => `出典: ${item.attribution}`),
    source.credit
  ];
}

/**
 * 順位の付け方、基準時点、出典。数値を引用するときに必要な情報をまとめる。
 * allSources を true にすると、表に出していない値の出典（ふるさと納税）も入れる（CSV・JSONは全指標の値を含むため）。
 */
export function screenFooterLines(result: ScreenResult, options: { allSources?: boolean } = {}): string[] {
  const { sort } = result.conditions;
  const facts = involvedFacts(result);
  const lines = [
    "対象は政令指定都市の区を除く市区町村です。順位は条件で絞り込んだ中で付けたもので（同じ値は同順位）、良し悪しの順ではありません。",
    "",
    "基準時点（出典の統計名）:"
  ];

  if (sort === "overall") {
    lines.push(
      `- ${OVERALL_LABEL}: 下の7指標の補助スコア（全国の市区町村の中での位置、0〜100）の平均。` +
        `${MIN_INDICATORS_FOR_OVERALL}指標以上そろう市区町村だけ算出`
    );
  }
  for (const key of INDICATOR_KEYS) {
    const info = result.indicators[key];
    lines.push(`- ${info.metricLabel}: ${info.period}（${info.statName}）`);
  }
  for (const key of facts) {
    const info = result.facts[key];
    lines.push(`- ${info.label}: ${info.period}（${info.statName}）`, ...FACTS[key].notes.map((note) => `  ${note}`));
  }
  lines.push(
    `- 人口: ${result.population.period}現在（${result.population.label}）`,
    "",
    ...attributionLines(
      result.source,
      result.additionalSources,
      options.allSources === true || facts.some((key) => FACTS[key].provider === "furusato")
    )
  );
  return lines;
}

export function renderScreenText(result: ScreenResult): string {
  const lines = [...screenHeaderLines(result), ""];

  if (result.rows.length === 0) {
    lines.push("条件に合う市区町村はありません。");
  } else {
    lines.push(...renderTable(result.rows, tableColumns(result.conditions.sort, involvedFacts(result))));
  }
  if (result.truncated) {
    lines.push(`（ほか ${formatNumber(result.matched - result.returned)}市区町村）`);
  }

  lines.push("", ...screenFooterLines(result));
  return `${lines.join("\n")}\n`;
}

/** 上の階層だけ改行し、それより深いデータは1行に収めたJSON。全件を出しても1市区町村が1行になる。 */
export function toReadableJson(value: unknown, expandDepth = 2, depth = 0): string {
  if (value === null || typeof value !== "object" || depth >= expandDepth) {
    return JSON.stringify(value) ?? "null";
  }

  const inner = "  ".repeat(depth + 1);
  const outer = "  ".repeat(depth);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((item) => `${inner}${toReadableJson(item, expandDepth, depth + 1)}`);
    return `[\n${items.join(",\n")}\n${outer}]`;
  }

  const entries = Object.entries(value).filter(([, item]) => item !== undefined);
  if (entries.length === 0) return "{}";
  const items = entries.map(
    ([key, item]) => `${inner}${JSON.stringify(key)}: ${toReadableJson(item, expandDepth, depth + 1)}`
  );
  return `{\n${items.join(",\n")}\n${outer}}`;
}

export function renderScreenJson(result: ScreenResult): string {
  return `${toReadableJson(result)}\n`;
}

const BOM = "\uFEFF";

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * 表計算ソフトでそのまま開けるCSV（BOM付きUTF-8、CRLF）。数値は単位を付けず、欠損は空欄にする。
 * くらしの指標はすべての列を入れる。金額は円の数値のまま。
 */
export function renderScreenCsv(result: ScreenResult): string {
  const header = [
    "順位",
    "市区町村コード",
    "都道府県",
    "市区町村",
    "区分",
    `人口（${result.population.unit}、${result.population.period}）`,
    OVERALL_LABEL,
    ...INDICATOR_KEYS.map((key) => {
      const { unit, period } = result.indicators[key];
      return `${INDICATORS[key].columnLabel}（${unit ? `${unit}、` : ""}${period}）`;
    }),
    ...FACT_KEYS.map((key) => {
      const { label, unit, period } = result.facts[key];
      return `${label}（${unit ? `${unit}、` : ""}${period}）`;
    })
  ];
  const lines = result.rows.map((row) => [
    row.rank,
    row.code,
    row.prefName,
    row.name,
    AREA_KIND_LABELS[row.kind],
    row.population,
    row.overallScore,
    ...INDICATOR_KEYS.map((key) => row.values[key]),
    ...FACT_KEYS.map((key) => row.facts[key])
  ]);

  return `${BOM}${[header, ...lines].map((line) => line.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

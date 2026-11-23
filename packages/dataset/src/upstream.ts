import type { AreaKind, Cycle, SeriesPoint, UpstreamSeries } from "@local-signal-japan/core";

/**
 * 統計ダッシュボード（総務省統計局）WebAPIのクライアント。
 * 利用登録・APIキーは不要。仕様: https://dashboard.e-stat.go.jp/static/api
 */
export const DASHBOARD_API_BASE = "https://dashboard.e-stat.go.jp/api/1.0/Json";

/** 短時間の大量アクセスを避けるため、リクエストの間隔を空ける。 */
const REQUEST_INTERVAL_MS = 1500;
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_ATTEMPTS = 3;

/** 地域レベル（getRegionInfo の @level）と市区町村の区分の対応。 */
const AREA_KIND_BY_LEVEL: Record<string, AreaKind> = {
  "8": "designated-city",
  "9": "city",
  "10": "special-ward",
  "11": "ward",
  "12": "town",
  "13": "village"
};

const CYCLE_CODES: Record<Cycle, string> = { CY: "3", FY: "4" };

export type UpstreamArea = {
  code: string;
  name: string;
  kana: string;
  kind: AreaKind;
  /** 政令指定都市の区の場合の市名。 */
  parentName?: string;
};

export type UpstreamPrefecture = { code: string; name: string };

export type UpstreamSeriesData = {
  name: string;
  statName: string;
  unit: string;
  /** 市区町村コード → 年の昇順に並んだ時系列。 */
  valuesByArea: Map<string, SeriesPoint[]>;
};

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 要素が1件のときに配列でなくオブジェクトで返る上流の癖を吸収する。 */
function asArray(value: unknown): JsonObject[] {
  if (Array.isArray(value)) return value.filter(isObject);
  return isObject(value) ? [value] : [];
}

function child(value: unknown, key: string): unknown {
  return isObject(value) ? value[key] : undefined;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function assertOk(result: unknown, allowEmpty: boolean): void {
  const status = text(child(result, "status"));
  // 0: 正常終了, 1: 正常終了だが該当データなし
  if (status === "0" || (allowEmpty && status === "1")) return;
  throw new Error(`統計ダッシュボードAPIがエラーを返しました（status=${status}）: ${text(child(result, "errorMsg"))}`);
}

function classObjects(root: unknown): JsonObject[] {
  return asArray(child(child(child(root, "METADATA_INF"), "CLASS_INF"), "CLASS_OBJ"));
}

export function parsePrefectures(json: unknown): UpstreamPrefecture[] {
  const root = child(json, "GET_META_REGION_INF");
  assertOk(child(root, "RESULT"), false);

  return classObjects(root)
    .flatMap((group) => asArray(group.CLASS))
    .filter((region) => text(region["@level"]) === "3" && text(region["@toDate"]) === "999912")
    .map((region) => ({ code: text(region["@regionCode"]).slice(0, 2), name: text(region["@name"]) }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

/** 現存する市区町村（政令指定都市・市・特別区・区・町・村）だけを取り出す。 */
export function parseAreas(json: unknown): UpstreamArea[] {
  const root = child(json, "GET_META_REGION_INF");
  assertOk(child(root, "RESULT"), false);
  const areas: UpstreamArea[] = [];

  for (const group of classObjects(root)) {
    const parentName = text(group["@name"]);

    for (const region of asArray(group.CLASS)) {
      const kind = AREA_KIND_BY_LEVEL[text(region["@level"])];
      const code = text(region["@regionCode"]);
      if (!kind || text(region["@toDate"]) !== "999912" || !/^\d{5}$/.test(code)) continue;

      areas.push({
        code,
        name: text(region["@name"]),
        kana: text(region["@hiragana"]),
        kind,
        ...(kind === "ward" && parentName !== "" ? { parentName } : {})
      });
    }
  }

  return areas.sort((a, b) => a.code.localeCompare(b.code));
}

function parseYear(time: string, cycle: Cycle): number | null {
  const match = /^(\d{4})(CY|FY)00$/.exec(time);
  return match && match[2] === cycle ? Number(match[1]) : null;
}

/** 「-」「***」「X」など数値でないセルは欠損として読み飛ばす。 */
function parseValue(raw: string): number | null {
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function parseSeriesData(json: unknown, series: UpstreamSeries): UpstreamSeriesData {
  const root = child(json, "GET_STATS");
  assertOk(child(root, "RESULT"), false);
  const data = child(root, "STATISTICAL_DATA");
  const classes = asArray(child(child(data, "CLASS_INF"), "CLASS_OBJ"));

  const classOf = (id: string) => asArray(classes.find((group) => text(group["@id"]) === id)?.CLASS);
  const indicator = classOf("indicator").find((entry) => text(entry["@code"]) === series.code);
  const units = new Map(classOf("unit").map((entry) => [text(entry["@code"]), text(entry.$)]));
  const stats = new Map(
    asArray(child(child(data, "TABLE_INF"), "STAT_NAME")).map((entry) => [text(entry["@code"]), text(entry.$)])
  );

  // 続きがある応答（ページ分割）には対応していない。黙って一部だけ使うことがないよう、検知して止める。
  if (child(child(data, "RESULT_INF"), "NEXT_KEY") !== undefined) {
    throw new Error(`系列 ${series.id}（${series.code}）の応答が分割されています。取得範囲を見直してください`);
  }

  const valuesByArea = new Map<string, SeriesPoint[]>();
  const unitCodes = new Set<string>();
  const statCodes = new Set<string>();

  for (const entry of asArray(child(child(data, "DATA_INF"), "DATA_OBJ"))) {
    const cell = child(entry, "VALUE");
    if (text(child(cell, "@indicator")) !== series.code) continue;

    const year = parseYear(text(child(cell, "@time")), series.cycle);
    const value = parseValue(text(child(cell, "$")));
    if (year === null || year < series.fromYear || value === null) continue;

    const areaCode = text(child(cell, "@regionCode"));
    const points = valuesByArea.get(areaCode) ?? [];
    // 同じ地域・同じ年の値が複数あるのは、定義の違う統計が混ざっている場合。どちらが正しいか決められない。
    if (points.some(([pointYear]) => pointYear === year)) {
      throw new Error(`系列 ${series.id}（${series.code}）に、地域 ${areaCode}・${year}年の値が重複しています`);
    }
    points.push([year, value]);
    valuesByArea.set(areaCode, points);
    unitCodes.add(text(child(cell, "@unit")));
    statCodes.add(text(child(cell, "@stat")));
  }

  for (const points of valuesByArea.values()) {
    points.sort((a, b) => a[0] - b[0]);
  }

  const name = text(indicator?.["@name"]);
  if (name === "" || valuesByArea.size === 0) {
    throw new Error(`系列 ${series.id}（${series.code}）のデータまたは名称を取得できませんでした`);
  }
  if (unitCodes.size > 1) {
    throw new Error(`系列 ${series.id}（${series.code}）に複数の単位が混ざっています`);
  }

  return {
    name,
    statName:
      [...statCodes]
        .map((code) => stats.get(code) ?? "")
        .filter(Boolean)
        .join("／") || "統計ダッシュボード",
    unit: [...unitCodes]
      .map((code) => units.get(code) ?? "")
      .filter(Boolean)
      .join("／"),
    valuesByArea
  };
}

export type FetchJson = (url: string) => Promise<unknown>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type PoliteClient = {
  json: FetchJson;
  /** 文字コードを指定して本文を読む（総務省のページは Shift_JIS）。 */
  text: (url: string, encoding?: string) => Promise<string>;
  binary: (url: string) => Promise<ArrayBuffer>;
};

/** 間隔を空けつつ、失敗時は待ち時間を延ばして再試行する取得関数を作る。 */
export function createPoliteClient(log: (message: string) => void = () => {}): PoliteClient {
  let lastRequestAt = 0;

  // 本文の読み込みも再試行の対象に含める（大きなファイルの途中で接続が切れることがあるため）。
  const request = async <T>(url: string, accept: string, read: (response: Response) => Promise<T>): Promise<T> => {
    for (let attempt = 1; ; attempt += 1) {
      const wait = lastRequestAt + REQUEST_INTERVAL_MS - Date.now();
      if (wait > 0) await sleep(wait);
      lastRequestAt = Date.now();

      try {
        const response = await fetch(url, {
          headers: { accept, "user-agent": "local-signal-japan-dataset" },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return await read(response);
      } catch (error) {
        if (attempt >= MAX_ATTEMPTS) {
          throw new Error(`取得に失敗しました: ${url}`, { cause: error });
        }
        log(`  再試行します（${attempt}/${MAX_ATTEMPTS - 1}）: ${String(error)}`);
        await sleep(REQUEST_INTERVAL_MS * 2 ** attempt);
      }
    }
  };

  return {
    json: (url) => request(url, "application/json", async (response) => (await response.json()) as unknown),
    text: (url, encoding = "utf-8") =>
      request(url, "text/html", async (response) => new TextDecoder(encoding).decode(await response.arrayBuffer())),
    binary: (url) => request(url, "*/*", (response) => response.arrayBuffer())
  };
}

/** JSON だけを取得する、従来の形の関数。 */
export function createPoliteFetch(log: (message: string) => void = () => {}): FetchJson {
  return createPoliteClient(log).json;
}

export function regionInfoUrl(levels: readonly number[]): string {
  return `${DASHBOARD_API_BASE}/getRegionInfo?Lang=JP&RegionLevel=${levels.join(",")}`;
}

/** 1系列ぶんを全国の市区町村について一括取得するURL。 */
export function seriesDataUrl(series: UpstreamSeries): string {
  const params = new URLSearchParams({
    Lang: "JP",
    IndicatorCode: series.code,
    RegionalRank: "4",
    Cycle: CYCLE_CODES[series.cycle],
    TimeFrom: `${series.fromYear}${series.cycle}00`,
    MetaGetFlg: "Y"
  });
  return `${DASHBOARD_API_BASE}/getData?${params.toString()}`;
}

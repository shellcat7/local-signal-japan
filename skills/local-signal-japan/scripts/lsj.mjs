#!/usr/bin/env node
/**
 * まちのものさし（Local Signal Japan）のデータセット（全国の市区町村の公的統計）を読む、依存なしの単体スクリプト。
 * Node.js 18 以上で動く。このフォルダだけを持ち出しても使えるよう、ほかのファイルは import しない。
 *
 *   node lsj.mjs --help
 *
 * 指標の定義・並べ替え・検索の規則は、リポジトリの packages/core と同じ結果になるようにしてあり、
 * リポジトリ側のテスト（apps/cli/src/skill-script.test.ts）で食い違いを検出する。
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_DATA = "https://local-signal-japan.pages.dev/data/";
const SUPPORTED_SCHEMA_VERSION = 2;
const FETCH_TIMEOUT_MS = 30_000;

const KEYS = ["population", "aging", "migration", "business", "employment", "income", "fiscal"];
/** 人口・所得・財政などを過去と比べる年数。 */
const COMPARISON_LAG_YEARS = 5;
/** 転入超過率を平均する年数。 */
const MIGRATION_WINDOW_YEARS = 3;
/** 総合補助スコアを算出するのに必要な指標数。 */
const MIN_INDICATORS_FOR_OVERALL = 4;
const DEFAULT_LIMIT = 20;
const MAX_COMPARE = 5;
const MAX_CANDIDATES = 20;
const OVERALL_LABEL = "総合補助スコア";
const RESIDENTS_LABEL = "人口";
/** 並べ替えに使える値。人口、総合補助スコア、各指標の指標値。 */
const SORT_METRICS = ["residents", "overall", ...KEYS];
const MISSING_TEXT = "欠損";

/**
 * 指標の定義。orientation は補助スコアが高くなる向き（higher = 値が大きいほど高い）。
 * fiscalYear は基準時点を「年度」で書く指標。facts は時系列からそのまま引ける関連の値、
 * change は5年前（国勢調査の指標は前回調査）との比べ方。
 */
const INDICATORS = {
  population: {
    label: "人口",
    metricLabel: "5年間の人口増減率",
    columnLabel: "人口増減率",
    unit: "%",
    decimals: 1,
    signed: true,
    orientation: "higher",
    fiscalYear: false,
    summary: "住民基本台帳人口が5年前からどれだけ増減したかを見ます。",
    method: "（基準年の住民基本台帳人口 ÷ 5年前の住民基本台帳人口 − 1）× 100",
    notes: [
      "住民基本台帳人口は各年1月1日現在（2013年のみ3月31日現在）で、外国人住民を含みます。国勢調査の人口とは定義と時点が異なります。",
      "増減率は地域の良し悪しを示すものではなく、需要構造の変化を読むための手がかりです。"
    ],
    facts: [
      { series: "residents", offset: 0, label: "住民基本台帳人口", unit: "人", decimals: 0 },
      { series: "residents", offset: -COMPARISON_LAG_YEARS, label: "5年前の人口", unit: "人", decimals: 0 }
    ],
    change: { series: "residents", type: "rate", unit: "%", decimals: 1 }
  },
  aging: {
    label: "高齢化",
    metricLabel: "高齢化率（65歳以上人口の割合）",
    columnLabel: "高齢化率",
    unit: "%",
    decimals: 1,
    signed: false,
    orientation: "lower",
    fiscalYear: false,
    summary: "国勢調査による65歳以上人口の割合を見ます。",
    method: "国勢調査の「総人口に占める割合（65歳以上）」をそのまま使用",
    notes: [
      "高齢化率は医療・福祉・交通などの需要構造を読むための補助指標で、単独で地域の評価を示すものではありません。",
      "補助スコアは高齢化率が低いほど高くなる向きにそろえています。向きは集計上の約束であり、価値判断ではありません。"
    ],
    facts: [
      { series: "ratio", offset: 0, label: "高齢化率", unit: "%", decimals: 1 },
      { series: "ratio", offset: -5, label: "前回調査の高齢化率", unit: "%", decimals: 1 }
    ],
    change: { series: "ratio", type: "difference", unit: "pt", decimals: 1 }
  },
  migration: {
    label: "転入・転出",
    metricLabel: "転入超過率（直近3年平均）",
    columnLabel: "転入超過率",
    unit: "%",
    decimals: 2,
    signed: true,
    orientation: "higher",
    fiscalYear: false,
    summary: "国内の他市区町村との転入・転出の差を、人口に対する割合で見ます。",
    method: "各年の（転入者数 − 転出者数）÷ 住民基本台帳人口 × 100 を、基準年までの3年間で平均",
    notes: [
      "転入・転出は年ごとの変動が大きいため、3年平均で見ています。",
      "国内の市区町村間の移動を対象とした値で、国外との移動は含みません。"
    ],
    facts: [
      { series: "inflow", offset: 0, label: "転入者数", unit: "人", decimals: 0 },
      { series: "outflow", offset: 0, label: "転出者数", unit: "人", decimals: 0 },
      { series: "net", offset: 0, label: "転入超過数", unit: "人", decimals: 0, signed: true }
    ],
    change: null
  },
  business: {
    label: "事業所",
    metricLabel: "人口千人当たりの民営事業所数",
    columnLabel: "千人当たり事業所数",
    unit: "事業所",
    decimals: 1,
    signed: false,
    orientation: "higher",
    fiscalYear: false,
    summary: "経済センサスの民営事業所数を、居住人口に対する密度で見ます。",
    method: "民営事業所数 ÷ 同じ年の住民基本台帳人口 × 1,000",
    notes: [
      "2021年の経済センサス-活動調査は調査方法が変わったため、2016年以前の値とは単純に比較できません。直近の動きは判定していません。",
      "事業所は従業地ベース、人口は居住地ベースです。昼間人口の多い都心部では密度が非常に高く出ます。"
    ],
    facts: [{ series: "establishments", offset: 0, label: "民営事業所数", unit: "事業所", decimals: 0 }],
    change: null
  },
  employment: {
    label: "雇用",
    metricLabel: "完全失業率（国勢調査）",
    columnLabel: "完全失業率",
    unit: "%",
    decimals: 1,
    signed: false,
    orientation: "lower",
    fiscalYear: false,
    summary: "国勢調査による、労働力人口に占める完全失業者の割合を見ます。",
    method: "社会・人口統計体系の「完全失業率（国勢調査）」をそのまま使用",
    notes: [
      "5年に一度の国勢調査に基づく値で、毎月公表される労働力調査の失業率とは調査方法が異なります。",
      "居住地ベースの値です。通勤圏をまたぐ地域では、周辺の市区町村とあわせて確認してください。"
    ],
    facts: [
      { series: "unemployment", offset: 0, label: "完全失業率", unit: "%", decimals: 1 },
      { series: "unemployment", offset: -5, label: "前回調査の完全失業率", unit: "%", decimals: 1 }
    ],
    change: { series: "unemployment", type: "difference", unit: "pt", decimals: 1 }
  },
  income: {
    label: "所得",
    metricLabel: "納税義務者1人当たりの課税対象所得",
    columnLabel: "課税対象所得",
    unit: "万円",
    decimals: 1,
    signed: false,
    orientation: "higher",
    fiscalYear: true,
    summary: "市町村民税（所得割）の課税対象所得を、納税義務者1人当たりで見ます。",
    method: "課税対象所得 ÷ 納税義務者数（所得割）。千円単位の上流データを万円に換算",
    notes: [
      "各年度の課税対象となった前年の所得で、所得控除を行う前の金額です。物価変動は調整していません。",
      "納税義務者に限った平均であり、住民全体の平均所得ではありません。"
    ],
    facts: [
      { series: "perTaxpayer", offset: 0, label: "1人当たり課税対象所得", unit: "万円", decimals: 1 },
      {
        series: "perTaxpayer",
        offset: -COMPARISON_LAG_YEARS,
        label: "5年前の1人当たり課税対象所得",
        unit: "万円",
        decimals: 1
      }
    ],
    change: { series: "perTaxpayer", type: "rate", unit: "%", decimals: 1 }
  },
  fiscal: {
    label: "財政",
    metricLabel: "財政力指数",
    columnLabel: "財政力指数",
    unit: "",
    decimals: 2,
    signed: false,
    orientation: "higher",
    fiscalYear: true,
    summary: "標準的な行政需要を自前の税収等でどの程度まかなえるかを見ます。",
    method:
      "社会・人口統計体系の「財政力指数（市町村財政）」をそのまま使用（基準財政収入額 ÷ 基準財政需要額 の過去3年平均）",
    notes: [
      "財政力指数は財源の自立度を示す指数で、行政サービスの水準や財政の健全性そのものを示すものではありません。",
      "特別区と政令指定都市の区は、出典に値が収録されていません。"
    ],
    facts: [
      { series: "index", offset: 0, label: "財政力指数", unit: "", decimals: 2 },
      { series: "index", offset: -COMPARISON_LAG_YEARS, label: "5年前の財政力指数", unit: "", decimals: 2 }
    ],
    change: { series: "index", type: "difference", unit: "", decimals: 2 }
  }
};

const POPULATION_BANDS = [
  { id: "all", label: "すべての規模", min: 0, max: Number.POSITIVE_INFINITY },
  { id: "under-10k", label: "1万人未満", min: 0, max: 10_000 },
  { id: "10k-50k", label: "1万〜5万人", min: 10_000, max: 50_000 },
  { id: "50k-200k", label: "5万〜20万人", min: 50_000, max: 200_000 },
  { id: "over-200k", label: "20万人以上", min: 200_000, max: Number.POSITIVE_INFINITY }
];

const KIND_LABELS = {
  "designated-city": "政令指定都市",
  city: "市",
  "special-ward": "特別区",
  ward: "政令指定都市の区",
  town: "町",
  village: "村"
};

/** 数値の読み方。どの結果にも当てはまる約束ごと。 */
const READING_NOTES = [
  "補助スコアは、全国の市区町村（政令指定都市の区を除く基準集団）の中での位置を0〜100で表したパーセンタイルで、50が全国の中央です。",
  "補助スコアは値が大きいほど高くなりますが、高齢化率と完全失業率だけは値が小さいほど高くなります。向きは集計上の約束で、良し悪しの判定ではありません。",
  "順位は基準集団の中で指標値が大きい順に数えたもので（同じ値は同順位）、良し悪しの順ではありません。",
  "値が null の指標は欠損です。低い値や0として扱わないでください。政令指定都市の区には順位がありません。"
];

const USAGE = `まちのものさし（Local Signal Japan）データ参照スクリプト（全国の市区町村の公的統計）

使い方:
  node lsj.mjs indicators
      7指標の定義・単位・基準時点・全国の分布（中央値など）・出典の系列を表示します。
  node lsj.mjs search <検索語> [--limit N]
      市区町村名・よみがな・5桁の市区町村コードで検索します。
  node lsj.mjs show <市区町村>
      1つの市区町村の全指標（値・基準時点・補助スコア・全国順位・5年前比・欠損理由・出典の系列）を表示します。
  node lsj.mjs screen [--where "<指標キー><演算子><数値>"]... [--sort residents|overall|<指標キー>]
                      [--order desc|asc] [--pref <都道府県>] [--size <人口規模>] [--limit N] [--csv]
      数値の条件に合う市区町村をもれなく抜き出し、条件に合う中での順位を付けます（政令指定都市の区は対象外）。
      --where  指標値の条件。何度でも指定でき、すべてを満たす市区町村だけが残ります。
               演算子は >=（以上）と <=（以下）。同じ指標に両方を付けると範囲になります。
      --sort   並べ替えに使う値。residents（人口、既定）、overall（総合補助スコア）、指標キーのどれか。
      --order  desc（大きい順、既定）か asc（小さい順）。
      --pref   都道府県名（例: 東京都）か2桁の都道府県コード（例: 13）。
      --size   人口規模。all（既定） | under-10k | 10k-50k | 50k-200k | over-200k
      --limit  出力する件数（既定 ${DEFAULT_LIMIT}、0 ですべて）。該当した市区町村の数は件数にかかわらず出力します。
      --csv    BOM付きUTF-8のCSVで出力します。
  node lsj.mjs compare <市区町村> <市区町村> [...]
      2〜${MAX_COMPARE}つの市区町村を並べて比べます。

指標キー:
${KEYS.map((key) => `  ${key.padEnd(10)} ${INDICATORS[key].metricLabel}${INDICATORS[key].unit ? `（${INDICATORS[key].unit}）` : ""}`).join("\n")}

<市区町村> には5桁の市区町村コード（例: 13101）か名前（例: 千代田区、横浜市青葉区、東京都府中市）を指定します。
同じ名前の市区町村が複数あるときは、候補を返して終了します（推測で1つに決めません）。

共通のオプション:
  --data <フォルダまたはURL>  データセットの場所。省略すると環境変数 LSJ_DATA、それもなければ
                              ${DEFAULT_DATA} を読みます。
  --text                      人が読むための表で出力します（既定はJSON）。
  --help                      この説明を表示します。

例:
  node lsj.mjs screen --where "aging<=25" --where "income>=400" --pref 東京都 --sort income --limit 0
  node lsj.mjs compare 13101 横浜市青葉区 --text`;

/** code は機械が読むための種別。extra は JSON の error にそのまま入れる追加情報。 */
class LsjError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    this.extra = extra;
  }
}

// ---------------------------------------------------------------------------
// 引数
// ---------------------------------------------------------------------------

const OPTION_TYPES = {
  data: "string",
  where: "list",
  sort: "string",
  order: "string",
  pref: "string",
  size: "string",
  limit: "string",
  text: "boolean",
  json: "boolean",
  csv: "boolean",
  help: "boolean"
};

function parseArgv(argv) {
  const options = { where: [] };
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h") {
      options.help = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const equals = arg.indexOf("=");
    const name = equals === -1 ? arg.slice(2) : arg.slice(2, equals);
    const type = Object.hasOwn(OPTION_TYPES, name) ? OPTION_TYPES[name] : undefined;
    if (!type) {
      throw new LsjError("usage", `不明なオプションです: --${name}（--help で使い方を表示します）`);
    }
    if (type === "boolean") {
      if (equals !== -1) throw new LsjError("usage", `--${name} に値は付けられません。`);
      options[name] = true;
      continue;
    }

    let value;
    if (equals === -1) {
      index += 1;
      value = argv[index];
    } else {
      value = arg.slice(equals + 1);
    }
    if (value === undefined) throw new LsjError("usage", `--${name} には値が必要です。`);
    if (type === "list") options[name].push(value);
    else options[name] = value;
  }

  return { options, positionals };
}

// ---------------------------------------------------------------------------
// データの読み込み
// ---------------------------------------------------------------------------

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** データセットの置き場所（フォルダか、末尾が /data/ のURL）からファイルを読む関数を作る。 */
function createReader(location) {
  const isUrl = /^https?:\/\//i.test(location);
  const base = isUrl
    ? location.replace(/\/*$/, "/")
    : path.resolve(location.startsWith("file:") ? fileURLToPath(location) : location);
  const hint = "--data か環境変数 LSJ_DATA で、データセットのフォルダかURLを指定してください。";

  async function readText(target) {
    if (!isUrl) {
      try {
        return await readFile(target, "utf8");
      } catch (error) {
        throw new LsjError(
          "data-unavailable",
          `データを読めません: ${target}（${error.code ?? error.message}）。${hint}`
        );
      }
    }

    if (typeof globalThis.fetch !== "function") {
      throw new LsjError("data-unavailable", "URLからデータを読むには Node.js 18 以上が必要です。");
    }
    let response;
    let text;
    try {
      response = await globalThis.fetch(target, {
        headers: { accept: "application/json" },
        signal: globalThis.AbortSignal.timeout(FETCH_TIMEOUT_MS)
      });
      text = await response.text();
    } catch (error) {
      const reason = error.cause?.code ?? error.cause?.message ?? error.name ?? "通信エラー";
      throw new LsjError("data-unavailable", `データを取得できません: ${target}（${reason}）。${hint}`);
    }
    if (!response.ok) {
      throw new LsjError("data-unavailable", `データを取得できません: ${target}（HTTP ${response.status}）。${hint}`);
    }
    return text;
  }

  const cache = new Map();
  return (file) => {
    if (!cache.has(file)) {
      const target = isUrl ? new URL(file, base).href : path.join(base, file);
      cache.set(
        file,
        readText(target).then((text) => {
          try {
            return JSON.parse(text);
          } catch {
            // 公開前のサイトなどは、存在しないパスにもHTMLのページを返すことがある。
            throw new LsjError(
              "invalid-data",
              `${target} の内容がJSONではありません。この場所にデータセットが置かれていない可能性があります。${hint}`
            );
          }
        })
      );
    }
    return cache.get(file);
  };
}

/** 形式バージョンと、このスクリプトが前提にする項目を確かめる。合わなければ理由を示して止める。 */
function validateManifest(manifest) {
  if (!isPlainObject(manifest)) {
    throw new LsjError("invalid-data", "manifest.json の形式が正しくありません。");
  }
  if (manifest.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw new LsjError(
      "unsupported-schema",
      `データセットの形式バージョン（schemaVersion）が ${JSON.stringify(manifest.schemaVersion)} です。` +
        `このスクリプトは形式バージョン ${SUPPORTED_SCHEMA_VERSION} だけを読めます。` +
        "スクリプトとデータセットを同じ版にそろえてください。",
      { schemaVersion: manifest.schemaVersion ?? null, supported: SUPPORTED_SCHEMA_VERSION }
    );
  }

  const complete =
    typeof manifest.generatedAt === "string" &&
    isPlainObject(manifest.source) &&
    typeof manifest.source.attribution === "string" &&
    typeof manifest.source.credit === "string" &&
    isPlainObject(manifest.counts) &&
    isPlainObject(manifest.indicators) &&
    KEYS.every((key) => {
      const indicator = manifest.indicators[key];
      return (
        isPlainObject(indicator) &&
        Number.isInteger(indicator.year) &&
        isPlainObject(indicator.distribution) &&
        Array.isArray(indicator.sources)
      );
    });
  if (!complete) {
    throw new LsjError(
      "invalid-data",
      "manifest.json に必要な項目（出典、取得日時、7指標の基準年・分布）がそろっていません。"
    );
  }
  return manifest;
}

function createContext(location) {
  const read = createReader(location);
  let manifestPromise;

  return {
    manifest() {
      manifestPromise ??= read("manifest.json").then(validateManifest);
      return manifestPromise;
    },
    async index() {
      const index = await read("areas.json");
      if (!isPlainObject(index) || !Array.isArray(index.prefectures) || !Array.isArray(index.areas)) {
        throw new LsjError("invalid-data", "areas.json の形式が正しくありません。");
      }
      return index;
    },
    async national() {
      const national = await read("national.json");
      const keys = isPlainObject(national) ? national.indicatorKeys : null;
      if (!Array.isArray(keys) || keys.join(",") !== KEYS.join(",") || !Array.isArray(national.areas)) {
        throw new LsjError("invalid-data", "national.json の指標の並びが、このスクリプトの想定と一致しません。");
      }
      return national.areas;
    },
    async prefecture(prefCode) {
      const prefecture = await read(`pref/${prefCode}.json`);
      if (!isPlainObject(prefecture) || !Array.isArray(prefecture.areas)) {
        throw new LsjError("invalid-data", `pref/${prefCode}.json の形式が正しくありません。`);
      }
      return prefecture.areas;
    }
  };
}

// ---------------------------------------------------------------------------
// 共通の計算と書式
// ---------------------------------------------------------------------------

function roundTo(value, decimals) {
  const factor = 10 ** decimals;
  // + 0 で -0 を 0 にそろえる。
  return Math.round(value * factor) / factor + 0;
}

function formatYear(year, fiscalYear) {
  return fiscalYear ? `${year}年度` : `${year}年`;
}

/** 住民基本台帳人口の調査時点。2014年調査から1月1日現在に変わった。 */
function residentsAsOf(year) {
  return year <= 2013 ? "3月31日" : "1月1日";
}

/** 指標値の基準時点。例: 2020→2025年 */
function periodOf(key, year) {
  if (key === "population") return `${year - COMPARISON_LAG_YEARS}→${year}年`;
  if (key === "migration") return `${year - MIGRATION_WINDOW_YEARS + 1}〜${year}年`;
  return formatYear(year, INDICATORS[key].fiscalYear);
}

function overallScoreOf(scores) {
  const available = scores.filter((score) => score !== null);
  if (available.length < MIN_INDICATORS_FOR_OVERALL) return null;
  return Math.round(available.reduce((total, score) => total + score, 0) / available.length);
}

function localNameOf(area) {
  return `${area.parentName ?? ""}${area.name}`;
}

function keyed(valueOf) {
  return Object.fromEntries(KEYS.map((key) => [key, valueOf(key)]));
}

const numberFormatters = new Map();

function formatNumber(value, decimals = 0, signed = false) {
  const cacheKey = `${decimals}:${signed}`;
  if (!numberFormatters.has(cacheKey)) {
    numberFormatters.set(
      cacheKey,
      new Intl.NumberFormat("ja-JP", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        signDisplay: signed ? "exceptZero" : "auto"
      })
    );
  }
  // 負の数にはハイフンではなく負号（U+2212）を使う。数字と同じ幅で、桁がそろう。JSONとCSVの数値には使わない。
  return numberFormatters.get(cacheKey).format(value).replace("-", "\u2212");
}

function formatMetric(key, value) {
  if (value === null) return MISSING_TEXT;
  const definition = INDICATORS[key];
  return `${formatNumber(value, definition.decimals, definition.signed)}${definition.unit}`;
}

/** ISO 8601 の日時を、日本時間の日付（YYYY-MM-DD）にする。 */
function formatDate(isoDateTime) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date(isoDateTime));
}

function statNameOf(manifest, key) {
  return [...new Set(manifest.indicators[key].sources.map((source) => source.statName))].join("・");
}

/** どの結果にも付ける出典。数値を引用するときは attribution・credit と、指標ごとの基準時点を添える。 */
function sourceBlock(manifest) {
  return {
    attribution: manifest.source.attribution,
    credit: manifest.source.credit,
    name: manifest.source.name,
    url: manifest.source.url,
    license: manifest.source.license,
    licenseUrl: manifest.source.licenseUrl,
    fetchedAt: manifest.generatedAt,
    // 取得日（日本時間）。回答に「データ取得日」として書く日付。
    fetchedDate: formatDate(manifest.generatedAt),
    periods: keyed((key) => periodOf(key, manifest.indicators[key].year))
  };
}

function indicatorInfo(manifest, key) {
  return {
    label: INDICATORS[key].label,
    metricLabel: INDICATORS[key].metricLabel,
    unit: INDICATORS[key].unit,
    period: periodOf(key, manifest.indicators[key].year),
    statName: statNameOf(manifest, key)
  };
}

function populationInfo(manifest) {
  const year = manifest.indicators.population.year;
  return { label: "住民基本台帳人口", unit: "人", period: `${year}年${residentsAsOf(year)}` };
}

// ---------------------------------------------------------------------------
// 検索
// ---------------------------------------------------------------------------

/**
 * 全角英数・カタカナ・空白の違いを吸収して比較用の文字列にする。
 * 「鎌ケ谷」「茅ヶ崎」のように小書きかどうかが地名ごとに違う文字は、大きいほうにそろえる。
 */
function normalizeQuery(text) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/ヶ/g, "ケ")
    .replace(/ヵ/g, "カ")
    .replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .replace(/\s+/g, "");
}

/** 一致の強さ（小さいほど強い）。0 は名前かコードの完全一致、1 はよみがなの完全一致かコードの前方一致。 */
function matchRank(entry, prefName, query) {
  const name = normalizeQuery(entry.name);
  const localName = normalizeQuery(localNameOf(entry));
  const kana = normalizeQuery(entry.kana);

  if (/^\d+$/.test(query)) {
    if (entry.code === query) return 0;
    return entry.code.startsWith(query) ? 1 : null;
  }

  if (name === query || localName === query) return 0;
  if (kana === query) return 1;
  if (name.startsWith(query) || localName.startsWith(query)) return 2;
  if (kana !== "" && kana.startsWith(query)) return 3;
  if (localName.includes(query)) return 4;

  // 都道府県名から始まる入力は、残りを市区町村名として照合する。
  const pref = normalizeQuery(prefName);
  if (pref !== "" && query.startsWith(pref)) {
    const rest = query.slice(pref.length);
    if (rest === "") return 8;
    if (localName.startsWith(rest) || name.startsWith(rest)) return 5;
    if (localName.includes(rest)) return 6;
  }

  if (kana !== "" && kana.includes(query)) return 7;
  return null;
}

/** 一致した市区町村を、一致度の高い順（同じ一致度はコード順）に返す。 */
function matchAreas(index, rawQuery) {
  const query = normalizeQuery(rawQuery);
  if (query === "") return [];

  const prefNames = new Map(index.prefectures.map((pref) => [pref.code, pref.name]));
  const matches = [];
  for (const entry of index.areas) {
    const prefName = prefNames.get(entry.prefCode) ?? "";
    const rank = matchRank(entry, prefName, query);
    if (rank !== null) matches.push({ rank, area: { ...entry, prefName } });
  }
  return matches.sort((a, b) => a.rank - b.rank || a.area.code.localeCompare(b.area.code));
}

function areaSummary(area) {
  return {
    code: area.code,
    name: localNameOf(area),
    prefName: area.prefName,
    kind: area.kind,
    kindLabel: KIND_LABELS[area.kind] ?? area.kind,
    kana: area.kana
  };
}

/**
 * コードまたは名前から市区町村を1つに決める。
 * 同じ強さで一致する市区町村が複数あるときは、推測せず、候補を付けたエラーにする。
 */
async function resolveAreaCode(context, query) {
  const matches = matchAreas(await context.index(), query);
  if (matches.length === 0) {
    throw new LsjError("not-found", `「${query}」に一致する市区町村がありません。search で表記を確かめてください。`, {
      query
    });
  }

  const best = matches[0].rank;
  const candidates = best <= 1 ? matches.filter((match) => match.rank === best) : matches;
  if (candidates.length > 1) {
    throw new LsjError(
      "ambiguous",
      `「${query}」に一致する市区町村が${candidates.length}件あります。` +
        "candidates から選び、5桁の市区町村コードか「都道府県名＋市区町村名」（例: 東京都府中市）で指定し直してください。",
      {
        query,
        candidateCount: candidates.length,
        candidates: candidates.slice(0, MAX_CANDIDATES).map((match) => areaSummary(match.area))
      }
    );
  }
  return candidates[0].area.code;
}

async function loadArea(context, query) {
  if (query === undefined || query.trim() === "") {
    throw new LsjError("usage", "市区町村を、5桁の市区町村コードか名前で指定してください。");
  }

  const text = query.normalize("NFKC").trim();
  const code = /^\d{5}$/.test(text) ? text : await resolveAreaCode(context, query);
  const prefCode = code.slice(0, 2);
  const area =
    Number(prefCode) >= 1 && Number(prefCode) <= 47
      ? (await context.prefecture(prefCode)).find((candidate) => candidate.code === code)
      : undefined;
  if (!area) {
    throw new LsjError("not-found", `市区町村コード ${code} はデータセットにありません。search で確かめてください。`, {
      query
    });
  }
  return area;
}

// ---------------------------------------------------------------------------
// 市区町村1件ぶんの値
// ---------------------------------------------------------------------------

function valueAt(points, year) {
  const point = points?.find(([pointYear]) => pointYear === year);
  return point ? point[1] : null;
}

/** 5年前（国勢調査の指標は前回調査）と比べた変化。比べられない指標と欠損は null。 */
function changeOf(key, indicator, year) {
  const spec = INDICATORS[key].change;
  if (!spec || indicator.value === null) return null;

  const current = valueAt(indicator.series[spec.series], year);
  const past = valueAt(indicator.series[spec.series], year - COMPARISON_LAG_YEARS);
  if (current === null || past === null) return null;
  if (spec.type === "rate") {
    return past <= 0
      ? null
      : { label: "5年前比", value: roundTo((current / past - 1) * 100, spec.decimals), unit: spec.unit };
  }
  return { label: "5年前比", value: roundTo(current - past, spec.decimals), unit: spec.unit };
}

function factsOf(key, indicator, year) {
  const definition = INDICATORS[key];
  return definition.facts.flatMap((fact) => {
    const factYear = year + fact.offset;
    const value = valueAt(indicator.series[fact.series], factYear);
    if (value === null) return [];
    const asOf = key === "population" ? residentsAsOf(factYear) : "";
    return [
      { label: fact.label, value, unit: fact.unit, period: `${formatYear(factYear, definition.fiscalYear)}${asOf}` }
    ];
  });
}

function missingTextOf(area, key, year) {
  const reason = area.indicators[key].missing;
  if (!reason) return null;

  if (reason === "insufficient-history") {
    return "比較に必要な過去時点の値がありません（区の再編や合併の直後などが該当します）。";
  }
  if (area.kind === "ward" && (key === "income" || key === "fiscal")) {
    return `政令指定都市の区単位では収録されていません。市全体（${area.parentName ?? "所属する市"}）の値を参照してください。`;
  }
  if (area.kind === "special-ward" && key === "fiscal") {
    return "出典（統計ダッシュボード）に特別区の値が収録されていません。";
  }
  return `出典（統計ダッシュボード）に${periodOf(key, year)}の値が収録されていません。`;
}

function sourceUrl(seriesCode, areaCode) {
  return `https://dashboard.e-stat.go.jp/api/1.0/Json/getData?Lang=JP&IndicatorCode=${seriesCode}&RegionCode=${areaCode}`;
}

function areaHeader(area, manifest) {
  const daytime = manifest.context?.daytimeRatio;
  return {
    code: area.code,
    name: localNameOf(area),
    prefCode: area.prefCode,
    prefName: area.prefName,
    kind: area.kind,
    kindLabel: KIND_LABELS[area.kind] ?? area.kind,
    kana: area.kana,
    population: area.population,
    populationPeriod: populationInfo(manifest).period,
    daytimeRatio: area.daytimeRatio,
    daytimeRatioPeriod: Number.isInteger(daytime?.latestYear) ? `${daytime.latestYear}年` : null
  };
}

function wardNote(area) {
  return area.kind === "ward"
    ? [
        `${localNameOf(area)}は政令指定都市の区です。基準集団に含まれないため順位はなく、screen の対象にもなりません。` +
          `補助スコアは基準集団に当てはめた位置です。所得と財政は市全体（${area.parentName ?? "所属する市"}）の値を見てください。`
      ]
    : [];
}

// ---------------------------------------------------------------------------
// コマンド
// ---------------------------------------------------------------------------

async function commandIndicators(context) {
  const manifest = await context.manifest();
  return {
    indicators: keyed((key) => {
      const definition = INDICATORS[key];
      const meta = manifest.indicators[key];
      const { count, min, p10, p25, p50, p75, p90, max } = meta.distribution;
      return {
        label: definition.label,
        metricLabel: definition.metricLabel,
        unit: definition.unit,
        decimals: definition.decimals,
        period: periodOf(key, meta.year),
        statName: statNameOf(manifest, key),
        summary: definition.summary,
        method: definition.method,
        scoreOrientation: definition.orientation,
        distribution: { count, min, p10, p25, median: p50, p75, p90, max },
        notes: definition.notes,
        sources: meta.sources.map((source) => ({ name: source.name, statName: source.statName, code: source.code }))
      };
    }),
    counts: { areas: manifest.counts.areas, referenceAreas: manifest.counts.referenceAreas },
    populationBands: POPULATION_BANDS.filter((band) => band.id !== "all").map(({ id, label }) => ({ id, label })),
    reading: [
      ...READING_NOTES,
      "distribution は基準集団における指標値の分布、scoreOrientation は補助スコアが高くなる向き（higher = 値が大きいほど高い）です。",
      `総合補助スコアは、補助スコアがある指標の単純平均です（${MIN_INDICATORS_FOR_OVERALL}指標以上そろう場合だけ算出）。`
    ],
    source: sourceBlock(manifest)
  };
}

function parseLimit(value) {
  if (value === undefined) return DEFAULT_LIMIT;
  if (/^\d+$/.test(value.trim())) return Number(value);
  throw new LsjError("usage", `--limit には0以上の整数を指定してください（0 はすべて）: ${value}`);
}

async function commandSearch(context, positionals, options) {
  const query = positionals.join(" ");
  if (query.trim() === "") throw new LsjError("usage", "検索語を指定してください。");

  const [manifest, index] = await Promise.all([context.manifest(), context.index()]);
  const limit = parseLimit(options.limit);
  const matches = matchAreas(index, query);
  const shown = limit === 0 ? matches : matches.slice(0, limit);
  return {
    query,
    count: matches.length,
    returned: shown.length,
    truncated: shown.length < matches.length,
    results: shown.map((match) => areaSummary(match.area)),
    source: sourceBlock(manifest)
  };
}

function describeArea(area, manifest) {
  return {
    area: areaHeader(area, manifest),
    overallScore: overallScoreOf(KEYS.map((key) => area.indicators[key].score)),
    coverage: {
      available: KEYS.filter((key) => area.indicators[key].score !== null).length,
      total: KEYS.length
    },
    indicators: keyed((key) => {
      const indicator = area.indicators[key];
      const meta = manifest.indicators[key];
      const missing = indicator.missing
        ? { reason: indicator.missing, text: missingTextOf(area, key, meta.year) }
        : null;
      return {
        metricLabel: INDICATORS[key].metricLabel,
        value: indicator.value,
        unit: INDICATORS[key].unit,
        period: periodOf(key, meta.year),
        statName: statNameOf(manifest, key),
        score: indicator.score,
        rank: indicator.rank,
        rankTotal: meta.distribution.count,
        median: meta.distribution.p50,
        ...(missing ? { missing } : {}),
        change: changeOf(key, indicator, meta.year),
        facts: factsOf(key, indicator, meta.year),
        sources: meta.sources.map((source) => ({
          name: source.name,
          statName: source.statName,
          code: source.code,
          url: sourceUrl(source.code, area.code)
        }))
      };
    })
  };
}

async function commandShow(context, positionals) {
  if (positionals.length > 1) {
    throw new LsjError("usage", "show に指定できる市区町村は1つです。複数を並べるときは compare を使ってください。");
  }
  const [manifest, area] = await Promise.all([context.manifest(), loadArea(context, positionals[0])]);
  return { ...describeArea(area, manifest), notes: wardNote(area), source: sourceBlock(manifest) };
}

async function commandCompare(context, positionals) {
  if (positionals.length < 2 || positionals.length > MAX_COMPARE) {
    throw new LsjError(
      "usage",
      `compare には2〜${MAX_COMPARE}つの市区町村を指定してください（指定は${positionals.length}つ）。`
    );
  }

  const manifest = await context.manifest();
  const areas = [];
  for (const query of positionals) {
    const area = await loadArea(context, query);
    if (areas.some((other) => other.code === area.code)) {
      throw new LsjError("usage", `同じ市区町村が2回指定されています: ${area.code} ${localNameOf(area)}`);
    }
    areas.push(area);
  }

  return {
    areas: areas.map((area) => {
      const missing = Object.fromEntries(
        KEYS.filter((key) => area.indicators[key].missing).map((key) => [
          key,
          missingTextOf(area, key, manifest.indicators[key].year)
        ])
      );
      return {
        code: area.code,
        name: localNameOf(area),
        prefName: area.prefName,
        kind: area.kind,
        population: area.population,
        overallScore: overallScoreOf(KEYS.map((key) => area.indicators[key].score)),
        values: keyed((key) => area.indicators[key].value),
        scores: keyed((key) => area.indicators[key].score),
        ranks: keyed((key) => area.indicators[key].rank),
        missing
      };
    }),
    indicators: keyed((key) => ({
      ...indicatorInfo(manifest, key),
      scoreOrientation: INDICATORS[key].orientation,
      median: manifest.indicators[key].distribution.p50,
      rankTotal: manifest.indicators[key].distribution.count
    })),
    population: populationInfo(manifest),
    notes: areas.flatMap(wardNote),
    source: sourceBlock(manifest)
  };
}

// --- screen ---------------------------------------------------------------

/** 全角の英数字・記号や、不等号の別の書き方を、半角の書き方にそろえる。 */
function normalizeExpression(expression) {
  return expression
    .normalize("NFKC")
    .replace(/[≧≥]/g, ">=")
    .replace(/[≦≤]/g, "<=")
    .replace(/\u2212/g, "-")
    .trim();
}

function parseCondition(expression) {
  const match = /^([^<>=!\s]*)\s*([<>=!]*)\s*(.*)$/.exec(normalizeExpression(expression));
  const key = (match?.[1] ?? "").toLowerCase();
  const op = match?.[2] ?? "";
  const valueText = match?.[3] ?? "";

  if (key === "" || op === "") {
    throw new LsjError(
      "usage",
      `条件は「<指標キー><演算子><数値>」の形で指定してください（例: "aging>=30"）: ${expression}`
    );
  }
  if (!KEYS.includes(key)) {
    throw new LsjError("usage", `条件の指標キーが不明です: ${key}（使える指標キー: ${KEYS.join(", ")}）`);
  }
  if (op !== ">=" && op !== "<=") {
    throw new LsjError("usage", `条件の演算子は >=（以上）と <=（以下）だけ使えます: ${expression}`);
  }
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(valueText)) {
    throw new LsjError(
      "usage",
      `条件の値が数値ではありません（単位や桁区切りを付けずに指定してください）: ${expression}`
    );
  }
  return { key, op, value: Number(valueText) };
}

/** 条件を指標ごとの範囲にまとめる。同じ向きの条件が重なったら厳しいほうを残す。指標の定義順に返す。 */
function buildFilters(conditions) {
  const ranges = new Map();
  for (const { key, op, value } of conditions) {
    const range = ranges.get(key) ?? {};
    if (op === ">=") range.min = range.min === undefined ? value : Math.max(range.min, value);
    else range.max = range.max === undefined ? value : Math.min(range.max, value);
    ranges.set(key, range);
  }

  const filters = KEYS.filter((key) => ranges.has(key)).map((key) => [key, ranges.get(key)]);
  for (const [key, range] of filters) {
    if (range.min !== undefined && range.max !== undefined && range.min > range.max) {
      throw new LsjError(
        "usage",
        `条件が両立しません: ${INDICATORS[key].columnLabel}が ${range.min}以上 かつ ${range.max}以下 になっています。`
      );
    }
  }
  return filters;
}

function parseSort(value) {
  const metric = (value ?? "residents").trim().toLowerCase();
  if (SORT_METRICS.includes(metric)) return metric;
  throw new LsjError(
    "usage",
    `--sort には residents（人口）、overall（総合補助スコア）、指標キー（${KEYS.join(", ")}）のどれかを指定してください: ${value}`
  );
}

function parseOrder(value) {
  const order = (value ?? "desc").trim().toLowerCase();
  if (order === "desc" || order === "asc") return order;
  throw new LsjError("usage", `--order には desc（大きい順）か asc（小さい順）を指定してください: ${value}`);
}

function parseSize(value) {
  const size = (value ?? "all").trim().toLowerCase();
  const band = POPULATION_BANDS.find((candidate) => candidate.id === size);
  if (band) return band;
  throw new LsjError(
    "usage",
    `--size には ${POPULATION_BANDS.map((candidate) => candidate.id).join(" | ")} のどれかを指定してください: ${value}`
  );
}

function resolvePrefecture(prefectures, value) {
  const text = value.normalize("NFKC").trim();
  const code = /^\d{1,2}$/.test(text) ? text.padStart(2, "0") : null;
  const found = prefectures.find((pref) =>
    code === null ? pref.name === text || pref.name.replace(/[都府県]$/, "") === text : pref.code === code
  );
  if (found) return { code: found.code, name: found.name };
  throw new LsjError(
    "usage",
    `都道府県が見つかりません（都道府県名か2桁コードで指定してください。例: 東京都、13）: ${value}`
  );
}

function sortLabel(metric) {
  if (metric === "residents") return RESIDENTS_LABEL;
  return metric === "overall" ? OVERALL_LABEL : INDICATORS[metric].columnLabel;
}

function describeConditions(query) {
  // 条件の数値は、指定されたとおりの桁で書く（負の数は表と同じ負号にする）。
  const bound = (value, unit) => `${String(value).replace("-", "\u2212")}${unit}`;
  const parts = query.filters.map(([key, range]) => {
    const { columnLabel, unit } = INDICATORS[key];
    const min = range.min === undefined ? "" : `${bound(range.min, unit)}以上`;
    const max = range.max === undefined ? "" : `${bound(range.max, unit)}以下`;
    return `${columnLabel} ${min}${max}`;
  });
  if (query.pref) parts.push(`都道府県 ${query.pref.name}`);
  if (query.band.id !== "all") parts.push(`人口規模 ${query.band.label}`);
  if (parts.length === 0) parts.push("指定なし（全国）");

  parts.push(`並び順 ${sortLabel(query.metric)}の${query.order === "desc" ? "大きい順" : "小さい順"}`);
  return parts.join(" / ");
}

/** 並べ替えに使う値。人口は住民基本台帳人口、総合は補助スコアの平均、指標は指標値そのもの。 */
function metricOf(row, metric) {
  if (metric === "residents") return row.population ?? null;
  return metric === "overall" ? overallScoreOf(row.scores) : (row.values[KEYS.indexOf(metric)] ?? null);
}

/** 条件の対象になる市区町村か。政令指定都市の区は市全体と重複するため外す。 */
function inScope(row, query) {
  if (row.kind === "ward") return false;
  if (query.pref && row.prefCode !== query.pref.code) return false;
  if (query.band.id !== "all") {
    if (row.population === null || row.population < query.band.min || row.population >= query.band.max) return false;
  }
  // 人口も指標値も1つもない市区町村は、どの並び順でも順位を付けられないので数えない。
  return SORT_METRICS.some((metric) => metricOf(row, metric) !== null);
}

/** すべての条件を満たすか（両端を含む）。条件を付けた指標が欠損なら満たさない。 */
function matchesFilters(row, filters) {
  return filters.every(([key, range]) => {
    const value = row.values[KEYS.indexOf(key)] ?? null;
    if (value === null) return false;
    return (range.min === undefined || value >= range.min) && (range.max === undefined || value <= range.max);
  });
}

function toScreenRow(row, prefNames, rank, sortValue) {
  return {
    rank,
    sortValue,
    code: row.code,
    name: localNameOf(row),
    prefCode: row.prefCode,
    prefName: prefNames.get(row.prefCode) ?? "",
    kind: row.kind,
    population: row.population,
    overallScore: overallScoreOf(row.scores),
    values: keyed((key) => row.values[KEYS.indexOf(key)] ?? null),
    scores: keyed((key) => row.scores[KEYS.indexOf(key)] ?? null)
  };
}

async function commandScreen(context, positionals, options) {
  if (positionals.length > 0) {
    throw new LsjError(
      "usage",
      `screen に渡せない引数です（条件は --where "aging>=30" の形で指定してください）: ${positionals.join(" ")}`
    );
  }

  // データを読む前に、指定の誤りを先に確かめる。
  const parsed = {
    filters: buildFilters(options.where.map(parseCondition)),
    metric: parseSort(options.sort),
    order: parseOrder(options.order),
    band: parseSize(options.size),
    limit: parseLimit(options.limit)
  };
  const [manifest, index, rows] = await Promise.all([context.manifest(), context.index(), context.national()]);
  const query = {
    ...parsed,
    pref: options.pref === undefined ? null : resolvePrefecture(index.prefectures, options.pref)
  };

  const prefNames = new Map(index.prefectures.map((pref) => [pref.code, pref.name]));
  const scope = rows.filter((row) => inScope(row, query));
  const matching = scope.filter((row) => matchesFilters(row, query.filters));
  const direction = query.order === "desc" ? -1 : 1;

  // 並べ替えに使う値がある市区町村に順位を付ける（同じ値は同順位、同順位の中はコード順）。
  const ranked = matching
    .map((row) => ({ row, value: metricOf(row, query.metric) }))
    .filter((entry) => entry.value !== null)
    .sort((a, b) => (a.value - b.value) * direction || a.row.code.localeCompare(b.row.code));
  let rank = 0;
  const rankedRows = ranked.map((entry, position) => {
    if (position === 0 || entry.value !== ranked[position - 1].value) rank = position + 1;
    return toScreenRow(entry.row, prefNames, rank, entry.value);
  });

  // 並べ替えに使う値が欠損でも、条件に合う市区町村は落とさず、順位なしで末尾に置く。
  const unrankedRows = matching
    .filter((row) => metricOf(row, query.metric) === null)
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((row) => toScreenRow(row, prefNames, null, null));

  const matched = [...rankedRows, ...unrankedRows];
  const shown = query.limit === 0 ? matched : matched.slice(0, query.limit);

  return {
    conditions: {
      where: query.filters.flatMap(([key, range]) => [
        ...(range.min === undefined ? [] : [`${key}>=${range.min}`]),
        ...(range.max === undefined ? [] : [`${key}<=${range.max}`])
      ]),
      filters: Object.fromEntries(query.filters),
      sort: query.metric,
      order: query.order,
      pref: query.pref,
      size: query.band.id,
      limit: query.limit,
      text: describeConditions(query)
    },
    total: scope.length,
    matched: matched.length,
    ranked: rankedRows.length,
    returned: shown.length,
    truncated: shown.length < matched.length,
    rows: shown,
    indicators: keyed((key) => indicatorInfo(manifest, key)),
    population: populationInfo(manifest),
    source: sourceBlock(manifest)
  };
}

// ---------------------------------------------------------------------------
// 出力
// ---------------------------------------------------------------------------

/** 上の階層だけ改行し、それより深いデータは1行に収めたJSON。 */
function toReadableJson(value, expandDepth = 2, depth = 0) {
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

function isWide(codePoint) {
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
function displayWidth(text) {
  let width = 0;
  for (const char of text) {
    width += isWide(char.codePointAt(0) ?? 0) ? 2 : 1;
  }
  return width;
}

/** columns: [{ header, align }]、rows: 文字列の配列の配列。 */
function renderTable(columns, rows) {
  const widths = columns.map((column, index) =>
    Math.max(displayWidth(column.header), ...rows.map((row) => displayWidth(row[index])))
  );
  const line = (cells) =>
    cells
      .map((cell, index) => {
        const space = " ".repeat(Math.max(0, widths[index] - displayWidth(cell)));
        return columns[index].align === "right" ? `${space}${cell}` : `${cell}${space}`;
      })
      .join("  ")
      .trimEnd();

  return [
    line(columns.map((column) => column.header)),
    widths.map((width) => "-".repeat(width)).join("  "),
    ...rows.map(line)
  ];
}

function sourceLines(source) {
  return [`出典: ${source.attribution}（取得日 ${source.fetchedDate}）`, source.credit];
}

function populationText(population) {
  return population === null ? MISSING_TEXT : `${formatNumber(population)}人`;
}

function textIndicators(result) {
  const columns = [
    { header: "指標キー", align: "left" },
    { header: "指標値", align: "left" },
    { header: "基準時点", align: "left" },
    { header: "中央値", align: "right" },
    { header: "最小", align: "right" },
    { header: "最大", align: "right" },
    { header: "市区町村数", align: "right" },
    { header: "補助スコアが高い向き", align: "left" },
    { header: "統計名", align: "left" }
  ];
  const rows = KEYS.map((key) => {
    const indicator = result.indicators[key];
    return [
      key,
      indicator.metricLabel,
      indicator.period,
      formatMetric(key, indicator.distribution.median),
      formatMetric(key, indicator.distribution.min),
      formatMetric(key, indicator.distribution.max),
      formatNumber(indicator.distribution.count),
      indicator.scoreOrientation === "higher" ? "値が大きいほど高い" : "値が小さいほど高い",
      [...new Set(indicator.sources.map((source) => source.statName))].join("・")
    ];
  });

  return [
    `収録: ${formatNumber(result.counts.areas)}市区町村（うち順位と補助スコアの基準集団は、政令指定都市の区を除く${formatNumber(result.counts.referenceAreas)}市区町村）`,
    "",
    ...renderTable(columns, rows),
    "",
    ...KEYS.flatMap((key) => [
      `${key}: ${result.indicators[key].summary}`,
      `  算出方法: ${result.indicators[key].method}`,
      ...result.indicators[key].notes.map((note) => `  注意: ${note}`)
    ]),
    "",
    ...result.reading.map((note) => `- ${note}`),
    "",
    ...sourceLines(result.source)
  ];
}

function candidateLine(area) {
  return `${area.code}  ${area.prefName} ${area.name}（${area.kindLabel}）`;
}

function textSearch(result) {
  return [
    `「${result.query}」に一致: ${formatNumber(result.count)}件` +
      (result.truncated ? `（先頭の${formatNumber(result.returned)}件を出力。すべて出すには --limit 0）` : ""),
    ...result.results.map(candidateLine)
  ];
}

function changeText(key, change) {
  if (change === null) return "-";
  const unit = change.unit === "pt" ? "ポイント" : change.unit;
  return `${formatNumber(change.value, INDICATORS[key].change.decimals, true)}${unit}`;
}

function textShow(result) {
  const { area } = result;
  const columns = [
    { header: "指標値", align: "left" },
    { header: "値", align: "right" },
    { header: "基準時点", align: "left" },
    { header: "補助スコア", align: "right" },
    { header: "全国順位", align: "right" },
    { header: "5年前比", align: "right" },
    { header: "全国の中央値", align: "right" }
  ];
  const rows = KEYS.map((key) => {
    const indicator = result.indicators[key];
    return [
      indicator.metricLabel,
      formatMetric(key, indicator.value),
      indicator.period,
      indicator.score === null ? MISSING_TEXT : String(indicator.score),
      indicator.rank === null ? "-" : `${formatNumber(indicator.rank)}位/${formatNumber(indicator.rankTotal)}`,
      changeText(key, indicator.change),
      formatMetric(key, indicator.median)
    ];
  });
  const daytime =
    area.daytimeRatio === null
      ? []
      : [
          `昼夜間人口比率: ${formatNumber(area.daytimeRatio, 1)}%${area.daytimeRatioPeriod ? `（${area.daytimeRatioPeriod}）` : ""}`
        ];
  const missing = KEYS.filter((key) => result.indicators[key].missing).map(
    (key) => `欠損: ${result.indicators[key].metricLabel} … ${result.indicators[key].missing.text}`
  );

  return [
    `${area.prefName} ${area.name}（${area.code}、${area.kindLabel}）`,
    `人口: ${populationText(area.population)}（${area.populationPeriod}、住民基本台帳人口）`,
    ...daytime,
    `${OVERALL_LABEL}: ${result.overallScore ?? MISSING_TEXT}（${result.coverage.total}指標中${result.coverage.available}指標）`,
    "",
    ...renderTable(columns, rows),
    ...(missing.length > 0 ? ["", ...missing] : []),
    "",
    "関連する値:",
    ...KEYS.flatMap((key) =>
      result.indicators[key].facts.map((fact) => {
        const { decimals, signed } = INDICATORS[key].facts.find((spec) => spec.label === fact.label) ?? {};
        return `- ${fact.label}: ${formatNumber(fact.value, decimals ?? 0, signed ?? false)}${fact.unit}（${fact.period}）`;
      })
    ),
    "",
    "出典の系列（統計ダッシュボードの系列コード）:",
    ...KEYS.flatMap((key) =>
      result.indicators[key].sources.map((source) => `- ${source.statName}「${source.name}」 ${source.code}`)
    ),
    ...(result.notes.length > 0 ? ["", ...result.notes] : []),
    "",
    "全国順位は値が大きい順で、良し悪しの順ではありません。補助スコアは全国の中での位置（0〜100、50が中央）です。",
    ...sourceLines(result.source)
  ];
}

function textCompare(result) {
  const columns = [
    { header: "指標値（基準時点）", align: "left" },
    ...result.areas.map((area) => ({ header: `${area.name}（${area.prefName}）`, align: "right" }))
  ];
  const cell = (area, key) => {
    if (area.values[key] === null) return MISSING_TEXT;
    const rank = area.ranks[key] === null ? "順位なし" : `${formatNumber(area.ranks[key])}位`;
    return `${formatMetric(key, area.values[key])}（スコア${area.scores[key]}・${rank}）`;
  };
  const rows = [
    ["市区町村コード", ...result.areas.map((area) => area.code)],
    [`人口（${result.population.period}）`, ...result.areas.map((area) => populationText(area.population))],
    [OVERALL_LABEL, ...result.areas.map((area) => String(area.overallScore ?? MISSING_TEXT))],
    ...KEYS.map((key) => [
      `${result.indicators[key].metricLabel}（${result.indicators[key].period}）`,
      ...result.areas.map((area) => cell(area, key))
    ])
  ];
  const missing = result.areas.flatMap((area) =>
    Object.entries(area.missing).map(([key, text]) => `欠損: ${area.name}の${INDICATORS[key].metricLabel} … ${text}`)
  );

  return [
    ...renderTable(columns, rows),
    ...(missing.length > 0 ? ["", ...missing] : []),
    ...(result.notes.length > 0 ? ["", ...result.notes] : []),
    "",
    "スコアは補助スコア（全国の中での位置、0〜100、50が中央）。順位は値が大きい順で、良し悪しの順ではありません。",
    ...sourceLines(result.source)
  ];
}

function screenHeaderLines(result) {
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

function screenFooterLines(result) {
  return [
    "対象は政令指定都市の区を除く市区町村です。順位は条件で絞り込んだ中で付けたもので（同じ値は同順位）、良し悪しの順ではありません。",
    "",
    "基準時点（出典の統計名）:",
    ...(result.conditions.sort === "overall"
      ? [
          `- ${OVERALL_LABEL}: 下の7指標の補助スコア（全国の市区町村の中での位置、0〜100）の平均。` +
            `${MIN_INDICATORS_FOR_OVERALL}指標以上そろう市区町村だけ算出`
        ]
      : []),
    ...KEYS.map((key) => {
      const info = result.indicators[key];
      return `- ${info.metricLabel}: ${info.period}（${info.statName}）`;
    }),
    `- 人口: ${result.population.period}現在（${result.population.label}）`,
    "",
    ...sourceLines(result.source)
  ];
}

function textScreen(result) {
  const metric = result.conditions.sort;
  const mark = (label, isSortColumn) => (isSortColumn ? `【${label}】` : label);
  const indicatorColumn = (key) => ({
    header: mark(INDICATORS[key].columnLabel, key === metric),
    align: "right",
    cell: (row) => formatMetric(key, row.values[key])
  });
  const residentsColumn = {
    header: mark(RESIDENTS_LABEL, metric === "residents"),
    align: "right",
    cell: (row) => populationText(row.population)
  };
  const overallColumn = {
    header: mark(OVERALL_LABEL, true),
    align: "right",
    cell: (row) => String(row.sortValue ?? MISSING_TEXT)
  };
  const sortColumn =
    metric === "residents" ? residentsColumn : metric === "overall" ? overallColumn : indicatorColumn(metric);
  // 並べ替えに使った値の列を【】付きで先頭に置き、続けて残りの指標を定義順に、最後に人口を並べる。
  const columns = [
    { header: "順位", align: "right", cell: (row) => String(row.rank ?? "-") },
    { header: "コード", align: "left", cell: (row) => row.code },
    { header: "市区町村", align: "left", cell: (row) => row.name },
    { header: "都道府県", align: "left", cell: (row) => row.prefName },
    sortColumn,
    ...KEYS.filter((key) => key !== metric).map(indicatorColumn),
    ...(metric === "residents" ? [] : [residentsColumn])
  ];

  return [
    ...screenHeaderLines(result),
    "",
    ...(result.rows.length === 0
      ? ["条件に合う市区町村はありません。"]
      : renderTable(
          columns,
          result.rows.map((row) => columns.map((column) => column.cell(row)))
        )),
    ...(result.truncated ? [`（ほか ${formatNumber(result.matched - result.returned)}市区町村）`] : []),
    "",
    ...screenFooterLines(result)
  ];
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** 表計算ソフトでそのまま開けるCSV（BOM付きUTF-8、CRLF）。数値は単位を付けず、欠損は空欄にする。 */
function csvScreen(result) {
  const header = [
    "順位",
    "市区町村コード",
    "都道府県",
    "市区町村",
    "区分",
    `人口（${result.population.unit}、${result.population.period}）`,
    OVERALL_LABEL,
    ...KEYS.map((key) => {
      const { unit, period } = result.indicators[key];
      return `${INDICATORS[key].columnLabel}（${unit ? `${unit}、` : ""}${period}）`;
    })
  ];
  const lines = result.rows.map((row) => [
    row.rank,
    row.code,
    row.prefName,
    row.name,
    KIND_LABELS[row.kind] ?? row.kind,
    row.population,
    row.overallScore,
    ...KEYS.map((key) => row.values[key])
  ]);
  return `\uFEFF${[header, ...lines].map((line) => line.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

const COMMANDS = {
  indicators: { run: commandIndicators, text: textIndicators, jsonDepth: 3 },
  search: { run: commandSearch, text: textSearch, jsonDepth: 2 },
  show: { run: commandShow, text: textShow, jsonDepth: 2 },
  screen: { run: commandScreen, text: textScreen, jsonDepth: 2 },
  compare: { run: commandCompare, text: textCompare, jsonDepth: 2 }
};

function outputFormat(options, command) {
  const chosen = ["json", "text", "csv"].filter((format) => options[format]);
  if (chosen.length > 1) {
    throw new LsjError("usage", `--${chosen.join(" と --")} は同時に指定できません。`);
  }
  const format = chosen[0] ?? "json";
  if (format === "csv" && command !== "screen") {
    throw new LsjError("usage", "--csv は screen でだけ使えます。");
  }
  return format;
}

async function main(argv) {
  const { options, positionals } = parseArgv(argv);
  const [command, ...rest] = positionals;

  if (options.help || command === undefined || command === "help") {
    console.log(USAGE);
    return;
  }
  if (!Object.hasOwn(COMMANDS, command)) {
    throw new LsjError(
      "usage",
      `不明なコマンドです: ${command}（使えるコマンド: ${Object.keys(COMMANDS).join(", ")}）`
    );
  }

  const format = outputFormat(options, command);
  const location = options.data ?? (process.env.LSJ_DATA || DEFAULT_DATA);
  const context = createContext(location);
  // ほかのファイルを読む前に、データセットの形式バージョンを確かめる。
  await context.manifest();
  const result = await COMMANDS[command].run(context, rest, options);

  if (format === "text") {
    console.log(COMMANDS[command].text(result).join("\n"));
  } else if (format === "csv") {
    process.stdout.write(csvScreen(result));
    // CSVには注記を入れられないので、条件・基準時点・出典は標準エラー出力に示す。
    console.error([...screenHeaderLines(result), ...screenFooterLines(result)].join("\n"));
  } else {
    console.log(toReadableJson(result, COMMANDS[command].jsonDepth));
  }
}

/** 失敗は標準エラー出力に書く。JSON出力のときは error を1つ持つJSONにして、候補などの追加情報も入れる。 */
function reportError(error, wantsText) {
  const known = error instanceof LsjError;
  const code = known ? error.code : "internal";
  const message = known ? error.message : `予期しないエラーです: ${error?.message ?? String(error)}`;
  const extra = known ? error.extra : {};

  if (wantsText) {
    const candidates = Array.isArray(extra.candidates) ? extra.candidates.map(candidateLine) : [];
    console.error([message, ...candidates].join("\n"));
  } else {
    console.error(toReadableJson({ error: { code, message, ...extra } }, 3));
  }
  process.exitCode = 1;
}

const argv = process.argv.slice(2);
try {
  await main(argv);
} catch (error) {
  reportError(error, argv.includes("--text"));
}

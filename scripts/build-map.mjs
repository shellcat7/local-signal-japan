#!/usr/bin/env node
// 国土数値情報「行政区域データ」(N03) から、地図ライブラリなしの素の SVG で
// コロプレス図を描くための境界データ apps/web/public/data/map.json を生成する。
//
//   node scripts/build-map.mjs                # 都道府県別 zip を1件ずつダウンロードして処理する(ディスクには保存しない)
//   node scripts/build-map.mjs --src <dir>    # 取得済みの N03-YYYYMMDD_PP_GML.zip(または展開した .shp 一式)を使う
//
// オプション: --year 2026(データ基準年) / --out <path> / --areas <path> / --interval <m>(簡略化の間隔)
//
// 何度実行しても同じ入力からは同じ map.json ができる(冪等)。処理の流れ:
//   1. 都道府県ごとに shapefile を読み、政令市の行政区を areas.json の親(政令市)コードへ寄せて dissolve する。
//      所属未定地・北方領土の6村など areas.json にない区域はここで除く。
//   2. 47都道府県を共有トポロジーで結合し、weighted Visvalingam(keep-shapes)で簡略化する。
//      都道府県をまたぐ境界も同じ弧として簡略化されるので、隙間や重なりは生じない。
//   3. アルベルス正積円錐図法で投影し、沖縄県・奄美群島・大東諸島・小笠原村を枠(インセット)へ移す。
//      孤立した小島は面積しきい値で除く(市区町村がまるごと消える場合は最大の島を残す)。
//   4. 0.1 単位に丸めて相対座標の SVG パスにし、都道府県の外形は丸めた後の形から dissolve して作る。
//
// プロキシ経由でしか外へ出られない環境では、Node の fetch がプロキシの環境変数を読まないので
// NODE_USE_ENV_PROXY=1 を付けて実行する(Node 22.21 以降)。
//
// 出典: 国土数値情報(行政区域データ)(国土交通省) CC BY 4.0
import { Buffer } from "node:buffer";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { TextDecoder } from "node:util";
import { gzipSync, inflateRawSync } from "node:zlib";
import mapshaper from "mapshaper";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---- 設定 -------------------------------------------------------------------

const DEFAULT_YEAR = 2026;
const DATASET_PAGE = (year) => `https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-${year}.html`;
const ZIP_URL = (year, pref) => `https://nlftp.mlit.go.jp/ksj/gml/data/N03/N03-${year}/N03-${year}0101_${pref}_GML.zip`;

/** viewBox の幅。高さは本土の縦横比から決まる */
const WIDTH = 1000;
/** viewBox の外周の余白 */
const PADDING = 8;
/** 簡略化の間隔(m)。viewBox の 1 単位 ≒ 1.7km なので約 0.2 単位。東京23区も4倍に拡大すれば区の形が見分けられる */
const DEFAULT_INTERVAL_M = 350;
/** これより小さい孤立した島(viewBox 単位の面積)は除く。0.1 ≒ 0.3km²(多くの小島は簡略化の段階で消える) */
const MIN_ISLAND_AREA = 0.1;
/** これより小さい孤立した穴は埋める */
const MIN_HOLE_AREA = 0.1;

/** アルベルス正積円錐図法(球面)。標準緯線は日本の南北の範囲から選ぶ */
const PROJECTION = { lat1: 32, lat2: 44, lat0: 37, lon0: 137 };

/** 北方領土の6村(色丹村・泊村・留夜別村・留別村・紗那村・蘂取村)。areas.json に含まれないので除く */
const NORTHERN_TERRITORIES = new Set(["01695", "01696", "01697", "01698", "01699", "01700"]);

/**
 * 本土から離れていて、そのまま描くと viewBox を大きく広げてしまう地域を枠(インセット)へ移す。
 *   match:  対象の市区町村コード
 *   window: 枠に描く経緯度の範囲。外れる島(硫黄鳥島・沖大東島・小笠原の硫黄島など)は描かない
 *   lon0:   その地域だけ投影し直す中央経線(枠の中で北が真上になる)
 *   scale:  本土に対する縮尺。小さな島だけの枠は2倍にして見えるようにする
 *   place:  置き場所。top-left / bottom-right は viewBox の角、right-of / below は前の枠の隣
 * 新聞の全国地図の慣例どおり、沖縄県(と奄美群島・大東諸島)は左上の日本海側、小笠原村は右下に置く。
 */
const AMAMI = "46222 46523 46524 46525 46527 46529 46530 46531 46532 46533 46534 46535".split(" ");
const DAITO = ["47357", "47358"];
const INSETS = [
  {
    key: "okinawa",
    label: "沖縄県",
    match: (code) => code.startsWith("47") && !DAITO.includes(code),
    window: { minLon: 122, maxLon: 129, minLat: 23.5, maxLat: 27.4 },
    lon0: 125.6,
    scale: 1,
    place: { at: "top-left" }
  },
  {
    key: "amami",
    label: "奄美群島",
    match: (code) => AMAMI.includes(code),
    window: { minLon: 128, maxLon: 130.5, minLat: 26.8, maxLat: 28.8 },
    lon0: 129.2,
    scale: 1,
    place: { at: "right-of", of: "okinawa" }
  },
  {
    key: "daito",
    label: "大東諸島",
    match: (code) => DAITO.includes(code),
    window: { minLon: 131, maxLon: 131.5, minLat: 25.6, maxLat: 26.2 },
    lon0: 131.25,
    scale: 2,
    place: { at: "below", of: "amami" }
  },
  {
    key: "ogasawara",
    label: "小笠原村",
    match: (code) => code === "13421",
    window: { minLon: 141.9, maxLon: 142.5, minLat: 26.4, maxLat: 27.3 },
    lon0: 142.2,
    scale: 2,
    place: { at: "bottom-right" }
  }
];
/** 枠の内側の余白と、枠どうしの間隔(viewBox 単位) */
const INSET_MARGIN = 5;
const INSET_GAP = 6;

const SOURCE = (year) => ({
  name: "国土数値情報（行政区域データ）",
  edition: `${year}年（令和${year - 2018}年）1月1日時点`,
  publisher: "国土交通省",
  url: DATASET_PAGE(year),
  license: "CC BY 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/deed.ja",
  attribution: "国土数値情報（行政区域データ）（国土交通省）を加工して作成"
});

// ---- 引数 -------------------------------------------------------------------

function parseArgs(argv) {
  const options = {
    year: DEFAULT_YEAR,
    src: null,
    out: path.join(rootDir, "apps/web/public/data/map.json"),
    areas: path.join(rootDir, "apps/web/public/data/areas.json"),
    interval: DEFAULT_INTERVAL_M
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) fail(`${arg} に値がありません`);
      return value;
    };
    if (arg === "--year") options.year = Number(next());
    else if (arg === "--src") options.src = path.resolve(next());
    else if (arg === "--out") options.out = path.resolve(next());
    else if (arg === "--areas") options.areas = path.resolve(next());
    else if (arg === "--interval") options.interval = Number(next());
    else fail(`不明な引数です: ${arg}`);
  }
  if (!Number.isInteger(options.year) || options.year < 2020) fail("--year には 2020 以降の西暦を指定してください");
  if (!(options.interval > 0)) fail("--interval には正の数(m)を指定してください");
  return options;
}

function fail(message) {
  throw new Error(message);
}

// ---- 市区町村マスタ(areas.json) -------------------------------------------

/**
 * N03_007(全国地方公共団体コード)→ 地図に描くコード の対応表を作る。
 * 地図に描くのは行政区以外(市・政令市・特別区・町・村)で、行政区は親の政令市へ寄せる。
 */
function buildReference(areasJson) {
  const prefectures = areasJson.prefectures.map((p) => p.code);
  if (prefectures.length !== 47) fail(`areas.json の都道府県が47件ではありません(${prefectures.length}件)`);
  const shapes = areasJson.areas.filter((a) => a.kind !== "ward");
  const designated = new Map(
    areasJson.areas.filter((a) => a.kind === "designated-city").map((a) => [`${a.prefCode}:${a.name}`, a.code])
  );
  const lookup = new Map(shapes.map((a) => [a.code, a.code]));
  for (const ward of areasJson.areas.filter((a) => a.kind === "ward")) {
    const parent = designated.get(`${ward.prefCode}:${ward.parentName}`);
    if (!parent) fail(`行政区 ${ward.code} ${ward.name} の親の政令市「${ward.parentName}」が areas.json にありません`);
    lookup.set(ward.code, parent);
  }
  const prefectureNames = new Set(areasJson.prefectures.map((p) => p.name));
  return { prefectures, prefectureNames, shapes, lookup, designated };
}

/** N03 の1レコードを地図のコードへ。除く場合は reason を返す */
function classify(record, ref, pref) {
  const code = record.N03_007;
  const mapped = ref.lookup.get(code);
  if (mapped) return { code: mapped };
  // 行政区のコードが areas.json と食い違っても、市名が政令市と一致すればその政令市へ寄せる
  if (record.N03_005) {
    const parent = ref.designated.get(`${pref}:${record.N03_004}`);
    if (parent) return { code: parent, note: `行政区コード ${code} を名前で ${parent} に対応づけ` };
  }
  if (!code || code.endsWith("000") || record.N03_004 === "所属未定地") return { reason: "所属未定地" };
  if (NORTHERN_TERRITORIES.has(code)) return { reason: "北方領土" };
  return { reason: "areas.json にない区域" };
}

// ---- 入力(zip / shapefile) -------------------------------------------------

/** zip(ZIP64 以外)から必要なエントリだけを取り出す */
function readZipEntries(buf, wanted) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) fail("zip の終端レコードが見つかりません(ダウンロードが壊れている可能性があります)");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let k = 0; k < count; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) fail("zip の中央ディレクトリが壊れています");
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLength = buf.readUInt16LE(p + 28);
    const extraLength = buf.readUInt16LE(p + 30);
    const commentLength = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    const name =
      buf
        .toString("utf8", p + 46, p + 46 + nameLength)
        .split("/")
        .pop() ?? "";
    p += 46 + nameLength + extraLength + commentLength;
    if (!wanted(name)) continue;
    if (compressedSize === 0xffffffff || offset === 0xffffffff) fail(`ZIP64 形式には対応していません: ${name}`);
    const start = offset + 30 + buf.readUInt16LE(offset + 26) + buf.readUInt16LE(offset + 28);
    const raw = buf.subarray(start, start + compressedSize);
    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = inflateRawSync(raw);
    else fail(`zip の圧縮方式 ${method} には対応していません: ${name}`);
    if (data.length !== size) fail(`zip の展開サイズが一致しません: ${name}`);
    entries.set(name, data);
  }
  return entries;
}

async function download(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await globalThis.fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.readUInt32LE(0) !== 0x04034b50) throw new Error("zip ではない応答です");
      return buf;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(2000 * attempt);
    }
  }
  const hint =
    process.env.HTTPS_PROXY && process.env.NODE_USE_ENV_PROXY !== "1"
      ? "(プロキシ環境では NODE_USE_ENV_PROXY=1 を付けて実行してください)"
      : "";
  throw new Error(`ダウンロードに失敗しました: ${url} — ${String(lastError?.cause ?? lastError)}${hint}`);
}

/** 都道府県1件分の shapefile 一式(.shp .shx .dbf .prj .cpg)を Buffer で返す */
async function loadPrefectureFiles(options, pref, srcListing) {
  const base = `N03-${options.year}0101_${pref}`;
  const parts = [".shp", ".shx", ".dbf", ".prj", ".cpg"];
  const wanted = (name) => parts.some((ext) => name === base + ext);
  if (options.src) {
    const zipPath = srcListing.get(`${base}_GML.zip`);
    if (zipPath) return { base, files: readZipEntries(await readFile(zipPath), wanted), from: zipPath };
    const files = new Map();
    for (const ext of parts) {
      const file = srcListing.get(base + ext);
      if (file) files.set(base + ext, await readFile(file));
    }
    if (files.size === 0) fail(`--src に ${base}_GML.zip も ${base}.shp も見つかりません: ${options.src}`);
    return { base, files, from: options.src };
  }
  const url = ZIP_URL(options.year, pref);
  return { base, files: readZipEntries(await download(url), wanted), from: url };
}

/** --src のディレクトリ(1階層下まで)にあるファイルを名前で引けるようにする */
async function listSource(dir) {
  const listing = new Map();
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => fail(`--src を読めません: ${dir}`));
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile()) listing.set(entry.name, full);
    else if (entry.isDirectory()) {
      for (const child of await readdir(full, { withFileTypes: true })) {
        if (child.isFile() && !listing.has(child.name)) listing.set(child.name, path.join(full, child.name));
      }
    }
  }
  return listing;
}

/** dBASE(.dbf)の属性だけを読む(N03 は文字列の列だけ) */
function readDbf(buf, encoding) {
  const count = buf.readUInt32LE(4);
  const headerLength = buf.readUInt16LE(8);
  const recordLength = buf.readUInt16LE(10);
  const fields = [];
  for (let o = 32; buf[o] !== 0x0d; o += 32) {
    fields.push({ name: buf.toString("latin1", o, o + 11).replace(/\0.*$/s, ""), length: buf[o + 16] ?? 0 });
  }
  const decoder = new TextDecoder(encoding);
  const records = [];
  for (let i = 0; i < count; i++) {
    let p = headerLength + i * recordLength + 1;
    const record = {};
    for (const field of fields) {
      record[field.name] = decoder
        .decode(buf.subarray(p, p + field.length))
        .replace(/\0/g, "")
        .trim();
      p += field.length;
    }
    records.push(record);
  }
  return records;
}

// ---- 手順1: 都道府県ごとの dissolve ------------------------------------------

async function processPrefecture(options, ref, pref, srcListing, report) {
  const { base, files, from } = await loadPrefectureFiles(options, pref, srcListing);
  for (const ext of [".shp", ".shx", ".dbf"]) {
    if (!files.has(base + ext)) fail(`${from} に ${base}${ext} がありません`);
  }
  const encoding = (files.get(`${base}.cpg`)?.toString("latin1").trim() || "UTF-8").toLowerCase();
  const records = readDbf(files.get(`${base}.dbf`), encoding === "utf-8" ? "utf-8" : encoding);
  const codeMap = {};
  for (const record of records) {
    if (record.N03_001 && !ref.prefectureNames.has(record.N03_001)) {
      fail(`${base}: 想定外の都道府県名「${record.N03_001}」があります`);
    }
    const result = classify(record, ref, pref);
    if (result.code) {
      if (!result.code.startsWith(pref))
        fail(`${base}: ${record.N03_007} が別の都道府県のコード ${result.code} になりました`);
      codeMap[record.N03_007] = result.code;
      if (result.note) report.notes.add(result.note);
    } else {
      const key = `${result.reason}: ${record.N03_007 || "(コードなし)"} ${record.N03_004}`;
      report.dropped.set(key, (report.dropped.get(key) ?? 0) + 1);
    }
  }
  const input = Object.fromEntries([...files].map(([name, data]) => [name, data]));
  const out = await mapshaper.applyCommands(
    [
      "-quiet",
      "-i",
      `${base}.shp`,
      `encoding=${encoding}`,
      "-each",
      `code = (${JSON.stringify(codeMap)})[N03_007] || ''`,
      "-filter",
      "code !== ''",
      "-dissolve",
      "code",
      "-o",
      `p${pref}.shp`,
      "format=shapefile"
    ],
    input
  );
  return out;
}

// ---- 手順2: 全国の結合と簡略化 -----------------------------------------------

async function simplifyAll(prefOutputs, prefs, intervalM) {
  const input = {};
  for (const out of prefOutputs) Object.assign(input, out);
  const result = await mapshaper.applyCommands(
    [
      "-quiet",
      "-i",
      ...prefs.map((p) => `p${p}.shp`),
      "combine-files",
      "-merge-layers",
      "force",
      "name=areas",
      "-simplify",
      "weighted",
      `interval=${intervalM}m`,
      "keep-shapes",
      "-o",
      "areas.json",
      "format=geojson",
      "precision=0.0000001"
    ],
    input
  );
  return JSON.parse(String(result["areas.json"]));
}

// ---- 手順3: 投影・インセット・小島の除去 -------------------------------------

const DEG = Math.PI / 180;
const EARTH_RADIUS = 6_371_008.8;

/** アルベルス正積円錐図法(球面)。y は画面座標に合わせて下向き(m) */
function albers({ lat1, lat2, lat0, lon0 }) {
  const n = (Math.sin(lat1 * DEG) + Math.sin(lat2 * DEG)) / 2;
  const c = Math.cos(lat1 * DEG) ** 2 + 2 * n * Math.sin(lat1 * DEG);
  const rho0 = Math.sqrt(c - 2 * n * Math.sin(lat0 * DEG)) / n;
  return ([lon, lat]) => {
    const rho = Math.sqrt(c - 2 * n * Math.sin(lat * DEG)) / n;
    const theta = n * (lon - lon0) * DEG;
    return [EARTH_RADIUS * rho * Math.sin(theta), -EARTH_RADIUS * (rho0 - rho * Math.cos(theta))];
  };
}

/** GeoJSON の Polygon / MultiPolygon を [[outer, ...holes], ...] にそろえる(閉じ点は除く) */
function toParts(geometry) {
  if (!geometry) return [];
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.map((rings) => rings.map((ring) => ring.slice(0, -1)));
}

function ringArea(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return Math.abs(sum / 2);
}

function edgeKey(a, b) {
  const ka = `${a[0]},${a[1]}`;
  const kb = `${b[0]},${b[1]}`;
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

function* ringEdges(ring) {
  for (let i = 0; i < ring.length; i++) yield edgeKey(ring[i], ring[(i + 1) % ring.length]);
}

function bboxOf(points) {
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of points) {
    if (x < box[0]) box[0] = x;
    if (y < box[1]) box[1] = y;
    if (x > box[2]) box[2] = x;
    if (y > box[3]) box[3] = y;
  }
  return box;
}

function inWindow([lon, lat], w) {
  return lon >= w.minLon && lon <= w.maxLon && lat >= w.minLat && lat <= w.maxLat;
}

function layout(geojson, report) {
  const byCode = new Map();
  for (const feature of geojson.features) {
    const code = String(feature.properties?.code ?? "");
    if (byCode.has(code)) fail(`簡略化後に ${code} が重複しています`);
    byCode.set(code, toParts(feature.geometry));
  }

  const groupOf = (code) => INSETS.find((inset) => inset.match(code))?.key ?? "main";
  for (const inset of INSETS) {
    // 枠に描く範囲から外れる島は描かない
    for (const [code, parts] of byCode) {
      if (groupOf(code) !== inset.key) continue;
      const kept = parts.filter((part) => part[0].every((pt) => inWindow(pt, inset.window)));
      if (kept.length < parts.length) {
        report.notes.add(`${inset.label}の枠の範囲外の島を除外: ${code}(${parts.length - kept.length}島)`);
      }
      byCode.set(code, kept);
    }
  }

  // 他の多角形と辺を共有しない輪(孤立した島や穴)を見分けるため、全辺の出現回数を数える
  const edgeCount = new Map();
  for (const parts of byCode.values()) {
    for (const part of parts) {
      for (const ring of part) for (const key of ringEdges(ring)) edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
    }
  }
  const isDetached = (ring) => {
    for (const key of ringEdges(ring)) if ((edgeCount.get(key) ?? 0) > 1) return false;
    return true;
  };

  const projections = {
    main: albers(PROJECTION),
    ...Object.fromEntries(INSETS.map((inset) => [inset.key, albers({ ...PROJECTION, lon0: inset.lon0 })]))
  };
  const projected = new Map();
  for (const [code, parts] of byCode) {
    const project = projections[groupOf(code)];
    projected.set(
      code,
      parts.map((part) => part.map((ring) => ({ ring: ring.map(project), detached: isDetached(ring) })))
    );
  }
  const outerPoints = (key) => {
    const points = [];
    for (const [code, parts] of projected) {
      if (groupOf(code) === key) for (const part of parts) for (const pt of part[0].ring) points.push(pt);
    }
    return points;
  };

  // 本土の範囲から縮尺と viewBox の高さを決める
  const [minX, minY, maxX, maxY] = bboxOf(outerPoints("main"));
  const scale = (WIDTH - 2 * PADDING) / (maxX - minX);
  const height = Math.ceil((maxY - minY) * scale + 2 * PADDING);
  const transforms = { main: (p) => [PADDING + (p[0] - minX) * scale, PADDING + (p[1] - minY) * scale] };

  // インセットを置く(座標は 0.1 単位に丸めた枠に合わせる)
  const insets = [];
  const round1 = (v) => Math.round(v * 10) / 10;
  for (const inset of INSETS) {
    const points = outerPoints(inset.key);
    if (points.length === 0) fail(`インセット「${inset.label}」に描く形がありません`);
    const [ix0, iy0, ix1, iy1] = bboxOf(points);
    const k = scale * inset.scale;
    const w = round1((ix1 - ix0) * k + 2 * INSET_MARGIN);
    const h = round1((iy1 - iy0) * k + 2 * INSET_MARGIN);
    const ref = insets.find((placed) => placed.key === inset.place.of)?.box;
    let x;
    let y;
    if (inset.place.at === "top-left") [x, y] = [PADDING, PADDING];
    else if (inset.place.at === "bottom-right") [x, y] = [WIDTH - PADDING - w, height - PADDING - h];
    else if (ref && inset.place.at === "right-of") [x, y] = [ref[0] + ref[2] + INSET_GAP, ref[1]];
    else if (ref && inset.place.at === "below") [x, y] = [ref[0], ref[1] + ref[3] + INSET_GAP];
    else fail(`インセット「${inset.label}」の置き場所の指定が不正です`);
    const box = [round1(x), round1(y), w, h];
    transforms[inset.key] = (p) => [box[0] + INSET_MARGIN + (p[0] - ix0) * k, box[1] + INSET_MARGIN + (p[1] - iy0) * k];
    insets.push({ label: inset.label, box, key: inset.key });
  }

  // 小島を除き、viewBox 座標へ変換して 0.1 単位(整数の 1/10)に丸める
  const areaShapes = new Map();
  for (const [code, parts] of projected) {
    const transform = transforms[groupOf(code)];
    const local = parts.map((part) =>
      part.map(({ ring, detached }) => {
        const pts = ring.map(transform);
        return { pts, detached, area: ringArea(pts) };
      })
    );
    const largest = local.reduce((best, part, i) => (part[0].area > (local[best]?.[0].area ?? -1) ? i : best), 0);
    const kept = [];
    local.forEach((part, i) => {
      const [outer, ...holes] = part;
      if (i !== largest && outer.detached && outer.area < MIN_ISLAND_AREA) {
        report.droppedIslands++;
        return;
      }
      const rings = [quantize(outer.pts)];
      for (const hole of holes) if (!(hole.detached && hole.area < MIN_HOLE_AREA)) rings.push(quantize(hole.pts));
      if (rings[0].length >= 3) kept.push(rings.filter((ring) => ring.length >= 3));
    });
    if (kept.length === 0) fail(`${code} の形が丸めの結果なくなりました`);
    areaShapes.set(code, kept);
  }

  // インセットの枠どうし、また枠と本土の形が重なっていないか確かめる
  const inBox = ([x, y, w, h], px, py) => px >= x && px <= x + w && py >= y && py <= y + h;
  for (const [i, inset] of insets.entries()) {
    const [left, top, width, boxHeight] = inset.box;
    if (left < 0 || top < 0 || left + width > WIDTH || top + boxHeight > height) {
      fail(`インセット「${inset.label}」の枠が viewBox からはみ出しています`);
    }
    for (const other of insets.slice(i + 1)) {
      const [ax, ay, aw, ah] = inset.box;
      const [bx, by, bw, bh] = other.box;
      if (ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah) {
        fail(`インセット「${inset.label}」と「${other.label}」の枠が重なっています`);
      }
    }
    for (const [code, parts] of areaShapes) {
      if (groupOf(code) === inset.key) continue;
      for (const part of parts) {
        if (part[0].some(([tx, ty]) => inBox(inset.box, tx / 10, ty / 10))) {
          fail(`インセット「${inset.label}」の枠が ${code} に重なっています。INSETS の配置を見直してください`);
        }
      }
    }
  }

  return { areaShapes, viewBox: [0, 0, WIDTH, height], insets: insets.map(({ label, box }) => ({ label, box })) };
}

/** 0.1 単位の整数座標にし、連続する重複点を除く */
function quantize(points) {
  const out = [];
  for (const [x, y] of points) {
    const q = [Math.round(x * 10), Math.round(y * 10)];
    const last = out[out.length - 1];
    if (!last || last[0] !== q[0] || last[1] !== q[1]) out.push(q);
  }
  while (out.length > 1 && out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1]) out.pop();
  return out;
}

// ---- 手順4: SVG パスと都道府県の外形 -----------------------------------------

/** 0.1 単位の整数を最短の10進表記に("-.5" "12" "3.4") */
function formatTenths(t) {
  const abs = Math.abs(t);
  const int = Math.floor(abs / 10);
  const frac = abs % 10;
  const body = frac === 0 ? String(int) : int === 0 ? `.${frac}` : `${int}.${frac}`;
  return t < 0 ? `-${body}` : body;
}

function joinNumbers(values) {
  let s = "";
  for (const v of values) {
    const token = formatTenths(v);
    s += s === "" || token.startsWith("-") ? token : ` ${token}`;
  }
  return s;
}

/** [[外周, ...穴], ...] を相対座標の SVG パスにする(最初だけ絶対座標の M、以降は m / l / z) */
function encodePath(parts) {
  let d = "";
  let cx = 0;
  let cy = 0;
  for (const ring of parts.flat()) {
    const [x0, y0] = ring[0];
    d += d === "" ? `M${joinNumbers([x0, y0])}` : `m${joinNumbers([x0 - cx, y0 - cy])}`;
    const deltas = [];
    for (let j = 1; j < ring.length; j++) deltas.push(ring[j][0] - ring[j - 1][0], ring[j][1] - ring[j - 1][1]);
    if (deltas.length > 0) d += `l${joinNumbers(deltas)}`;
    d += "z";
    cx = x0;
    cy = y0;
  }
  return d;
}

/** 丸めた後の市区町村の形を都道府県ごとに dissolve する(境界は市区町村の線と完全に一致する) */
async function dissolvePrefectures(areaShapes) {
  const closed = (ring) => [...ring, ring[0]].map(([x, y]) => [x / 10, y / 10]);
  const features = [...areaShapes].map(([code, parts]) => ({
    type: "Feature",
    properties: { pref: code.slice(0, 2) },
    geometry: { type: "MultiPolygon", coordinates: parts.map((rings) => rings.map(closed)) }
  }));
  const out = await mapshaper.applyCommands(
    ["-quiet", "-i", "areas.json", "-dissolve", "pref", "-o", "prefs.json", "format=geojson", "precision=0.1"],
    { "areas.json": JSON.stringify({ type: "FeatureCollection", features }) }
  );
  const result = JSON.parse(String(out["prefs.json"]));
  return result.features
    .map((f) => ({
      code: String(f.properties.pref),
      parts: toParts(f.geometry)
        .map((rings) => rings.map((ring) => quantize(ring)).filter((ring) => ring.length >= 3))
        .filter((rings) => rings.length > 0)
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

// ---- 本体 -------------------------------------------------------------------

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const started = Date.now();
  const areasJson = JSON.parse(await readFile(options.areas, "utf8"));
  const ref = buildReference(areasJson);
  for (const code of [...AMAMI, ...DAITO]) {
    if (ref.lookup.get(code) !== code) fail(`インセットに指定した ${code} が areas.json の市町村にありません`);
  }
  const srcListing = options.src ? await listSource(options.src) : new Map();
  const report = { dropped: new Map(), notes: new Set(), droppedIslands: 0 };

  console.log(`国土数値情報 行政区域データ ${options.year}年版 から地図を作成します(${options.src ?? "ダウンロード"})`);
  const prefOutputs = [];
  for (const pref of ref.prefectures) {
    prefOutputs.push(await processPrefecture(options, ref, pref, srcListing, report));
  }
  console.log(
    `  47都道府県の読み込みと行政区の dissolve を終えました(${((Date.now() - started) / 1000).toFixed(1)} 秒)`
  );

  const geojson = await simplifyAll(prefOutputs, ref.prefectures, options.interval);
  prefOutputs.length = 0;

  const { areaShapes, viewBox, insets } = layout(geojson, report);

  const expected = ref.shapes.map((a) => a.code).sort();
  const missing = expected.filter((code) => !areaShapes.has(code));
  if (missing.length > 0) {
    const names = new Map(ref.shapes.map((a) => [a.code, a.name]));
    fail(`境界のない市区町村があります(${missing.length}件): ${missing.map((c) => `${c} ${names.get(c)}`).join(", ")}`);
  }
  const extra = [...areaShapes.keys()].filter((code) => !ref.lookup.has(code) || ref.lookup.get(code) !== code);
  if (extra.length > 0) fail(`areas.json にないコードが残りました: ${extra.join(", ")}`);

  const prefectures = await dissolvePrefectures(areaShapes);
  if (prefectures.length !== 47) fail(`都道府県の外形が47件になりません(${prefectures.length}件)`);

  const map = {
    version: 1,
    source: SOURCE(options.year),
    viewBox,
    areas: expected.map((code) => ({ code, d: encodePath(areaShapes.get(code)) })),
    prefectures: prefectures.map((p) => ({ code: p.code, d: encodePath(p.parts) })),
    insets
  };

  // 差分を追いやすいよう、市区町村・都道府県は1件1行で書く
  const lines = (items) => items.map((item) => JSON.stringify(item)).join(",\n");
  const text =
    `{"version":${map.version},"source":${JSON.stringify(map.source)},"viewBox":${JSON.stringify(map.viewBox)},\n` +
    `"areas":[\n${lines(map.areas)}\n],\n"prefectures":[\n${lines(map.prefectures)}\n],\n` +
    `"insets":${JSON.stringify(map.insets)}}\n`;
  JSON.parse(text);
  await writeFile(options.out, text);

  const points = map.areas.reduce((n, a) => n + (a.d.match(/-?\d*\.?\d+/g)?.length ?? 0) / 2, 0);
  for (const [key, count] of [...report.dropped].sort()) console.log(`  除外 ${key}(${count}ポリゴン)`);
  for (const note of report.notes) console.log(`  注記 ${note}`);
  console.log(`  面積しきい値で除いた小島: ${report.droppedIslands}`);
  console.log(
    `  市区町村 ${map.areas.length} / 都道府県 ${map.prefectures.length} / インセット ${insets.length} / 頂点 約${Math.round(points)}`
  );
  const bytes = Buffer.byteLength(text);
  console.log(
    `  ${path.relative(rootDir, options.out)}: ${(bytes / 1024).toFixed(0)} KB(gzip ${(gzipSync(text).length / 1024).toFixed(0)} KB)` +
      ` viewBox ${viewBox.join(" ")} / ${((Date.now() - started) / 1000).toFixed(1)} 秒`
  );
}

main().catch((error) => {
  console.error(`\n地図データの作成に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

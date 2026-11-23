/**
 * サイト共通の OGP 画像（apps/web/public/og.png、1200×630）を作る。
 * X のリンクカードは画像だけが出るので、名前と「何ができるか」を画像の中に書く。
 * 使い方: node scripts/build-og.mjs（Playwright の Chromium を使う）
 */
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const web = path.join(root, "apps/web");
const font = path.join(web, "node_modules/@fontsource/zen-maru-gothic/files/zen-maru-gothic-japanese-700-normal.woff2");
const map = JSON.parse(await readFile(path.join(web, "public/data/map.json"), "utf8"));

// 塗る都道府県（図鑑で集めたような見た目にする。値の意味はない）。
const colors = {
  "01": "#d3ebe8",
  "04": "#f5dbe1",
  13: "#e3ebcd",
  15: "#e2ddf2",
  20: "#f5dbe1",
  23: "#d3ebe8",
  26: "#e2ddf2",
  27: "#f5dbe1",
  34: "#e3ebcd",
  40: "#d3ebe8",
  46: "#e2ddf2",
  47: "#f5dbe1"
};
const [vx, vy, vw, vh] = map.viewBox;
const prefectures = map.prefectures
  .map((pref) => `<path d="${pref.d}" fill="${colors[pref.code] ?? "#fcfcfa"}"/>`)
  .join("");
const japan = `<svg viewBox="${vx} ${vy} ${vw} ${vh}" xmlns="http://www.w3.org/2000/svg"><g stroke="#2e3033" stroke-width="2" stroke-linejoin="round">${prefectures}</g></svg>`;

const ticks = Array.from({ length: 84 }, (_, index) => {
  const height = index % 5 === 0 ? 16 : 9;
  return `<span style="left:${index * 8}px;height:${height}px"></span>`;
}).join("");

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "Pop"; src: url("file://${font}") format("woff2"); font-weight: 700; }
* { margin: 0; box-sizing: border-box; }
body { width: 1200px; height: 630px; overflow: hidden; background: #f4f3ef; font-family: "Pop", sans-serif; color: #2e3033; }
.wrap { position: relative; width: 100%; height: 100%; padding: 70px 72px;  }
h1 { font-size: 92px; letter-spacing: 0.06em; line-height: 1.1; }
.rule { position: relative; width: 666px; height: 18px; margin-top: 10px; border-bottom: 3px solid #2e3033; }
.rule span { position: absolute; bottom: 0; width: 2.5px; background: #2e3033; }
p { margin-top: 34px; font-size: 38px; line-height: 1.4; }
.pills { display: flex; flex-wrap: wrap; gap: 16px; width: 640px; margin-top: 36px; }
.pill { padding: 12px 28px; font-size: 32px; color: #2e3033; border: 3px solid; border-radius: 14px; }
.map { position: absolute; right: 40px; top: 30px; width: 480px; }
</style></head><body><div class="wrap">
<h1>まちのものさし</h1><div class="rule">${ticks}</div>
<p>全国1,741のまちをさがそう</p>
<div class="pills">
<span class="pill" style="background:#f5dbe1;border-color:#e0a3b2;box-shadow:0 6px 0 #e0a3b2">まちくじ</span>
<span class="pill" style="background:#e3ebcd;border-color:#b0c486;box-shadow:0 6px 0 #b0c486">まちクイズ</span>
<span class="pill" style="background:#d3ebe8;border-color:#86c2bd;box-shadow:0 6px 0 #86c2bd">まち図鑑</span>
<span class="pill" style="background:#e2ddf2;border-color:#b3a8d9;box-shadow:0 6px 0 #b3a8d9">条件でさがす</span>
</div>
<div class="map">${japan}</div>
</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
const file = path.join(root, "node_modules/.og.html");
await writeFile(file, html);
await page.goto(`file://${file}`);
// 書体を読み終えてから撮る（ブラウザの中で評価する式）。
await page.evaluate("document.fonts.ready");
await page.screenshot({ path: path.join(web, "public/og.png") });
await browser.close();
await rm(file, { force: true });
console.log("書き出しました: apps/web/public/og.png");

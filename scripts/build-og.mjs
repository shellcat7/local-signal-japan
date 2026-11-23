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
  "01": "#fde39c",
  "04": "#f4a385",
  13: "#9fdcb5",
  15: "#aad7ee",
  20: "#f4a385",
  23: "#fde39c",
  26: "#aad7ee",
  27: "#f4a385",
  34: "#9fdcb5",
  40: "#fde39c",
  46: "#aad7ee",
  47: "#f4a385"
};
const [vx, vy, vw, vh] = map.viewBox;
const prefectures = map.prefectures
  .map((pref) => `<path d="${pref.d}" fill="${colors[pref.code] ?? "#fffdf8"}"/>`)
  .join("");
const japan = `<svg viewBox="${vx} ${vy} ${vw} ${vh}" xmlns="http://www.w3.org/2000/svg"><g stroke="#2b2724" stroke-width="2" stroke-linejoin="round">${prefectures}</g></svg>`;

const ticks = Array.from({ length: 84 }, (_, index) => {
  const height = index % 5 === 0 ? 16 : 9;
  return `<span style="left:${index * 8}px;height:${height}px"></span>`;
}).join("");

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "Pop"; src: url("file://${font}") format("woff2"); font-weight: 700; }
* { margin: 0; box-sizing: border-box; }
body { width: 1200px; height: 630px; overflow: hidden; background: #fbf5ea; font-family: "Pop", sans-serif; color: #2b2724; }
.wrap { position: relative; width: 100%; height: 100%; padding: 70px 72px; }
h1 { font-size: 92px; letter-spacing: 0.06em; line-height: 1.1; }
.rule { position: relative; width: 666px; height: 18px; margin-top: 10px; border-bottom: 3px solid #2b2724; }
.rule span { position: absolute; bottom: 0; width: 2.5px; background: #2b2724; }
p { margin-top: 34px; font-size: 38px; line-height: 1.4; }
.pills { display: flex; flex-wrap: wrap; gap: 16px; width: 640px; margin-top: 36px; }
.pill { padding: 12px 28px; font-size: 32px; border: 4px solid #2b2724; border-radius: 999px; box-shadow: 0 6px 0 #2b2724; }
.map { position: absolute; right: 40px; top: 30px; width: 480px; }
</style></head><body><div class="wrap">
<h1>まちのものさし</h1><div class="rule">${ticks}</div>
<p>全国1,741のまちを、公的統計で<br>くらべて、あそぶ。</p>
<div class="pills">
<span class="pill" style="background:#f4a385">まちくじ</span>
<span class="pill" style="background:#9fdcb5">まちクイズ</span>
<span class="pill" style="background:#fde39c">まち図鑑</span>
<span class="pill" style="background:#aad7ee">条件でさがす</span>
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

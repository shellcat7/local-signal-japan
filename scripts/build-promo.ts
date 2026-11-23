/**
 * X に投稿するための素材を promo/ に作る。
 * - launch/: 告知用の動画（まちくじ）と画像4枚
 * - quiz/: 日替わりの「まちクイズ」の問題画像・答えの画像・投稿文（指定した日から何日分か）
 * - topics/: 特集ランキングの画像
 * - profile/: X のプロフィール用のヘッダー画像とアイコン
 *
 * 公開中のサイト（既定は本番）を Playwright で開き、サイトの「画像で保存」と同じ画像を保存する。
 * 使い方: pnpm exec tsx scripts/build-promo.ts [--from 2026-11-24] [--days 7] [--only quiz]
 *   PROMO_BASE_URL で開くサイトを変えられる（例: http://127.0.0.1:4173/）。
 */
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { chromium, type Browser, type Page } from "@playwright/test";
import {
  areaIndexSchema,
  buildQuiz,
  findTopic,
  FEATURED_TOPIC_IDS,
  manifestSchema,
  nationalFileSchema,
  type QuizQuestion
} from "../packages/core/src/index";
import { formatHash, topicRoute } from "../apps/web/src/lib/route";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "promo");
const data = path.join(root, "apps/web/public/data");
const SITE = "https://local-signal-japan.pages.dev/";
const BASE = (process.env.PROMO_BASE_URL ?? SITE).replace(/\/?$/, "/");
const LETTERS = ["A", "B", "C", "D"];
const font = path.join(
  root,
  "apps/web/node_modules/@fontsource/zen-maru-gothic/files/zen-maru-gothic-japanese-700-normal.woff2"
);

const { values } = parseArgs({
  options: {
    from: { type: "string" },
    days: { type: "string", default: "7" },
    only: { type: "string" }
  }
});

/** 日本時間の明日（YYYY-MM-DD）。 */
function tomorrowInJapan(): string {
  const japan = new Date(Date.now() + 9 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000);
  return japan.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

const label = (date: string) => {
  const [, month, day] = date.split("-").map(Number);
  return `${month}月${day}日`;
};

/** 「画像で保存」を押して、ダウンロードされた画像を保存する。 */
async function saveDownload(page: Page, buttonName: string | RegExp, file: string, scope?: string) {
  const area = scope ? page.locator(scope) : page;
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    area.getByRole("button", { name: buttonName }).first().click()
  ]);
  await download.saveAs(file);
}

/** 動画の大きさ。4:5 は X のタイムラインで大きく出て、上下が切れない縦横比。 */
const VIDEO = { width: 1080, height: 1350, scale: 2.25 };
/** 動画で引くまち。県で1位（草津町）→ 全国1位（泉佐野市）→ 全国1位（軽井沢町）の順に出す。 */
const VIDEO_DRAWS = ["10426", "27213", "20321"];

type ScreencastFrame = { data: string; sessionId: number; metadata: { timestamp?: number } };

/** トップページからまちくじを引く動画を撮る。 */
async function recordKujiVideo(browser: Browser, pool: ReadonlyArray<{ code: string }>, file: string) {
  const context = await browser.newContext({
    viewport: { width: VIDEO.width / VIDEO.scale, height: VIDEO.height / VIDEO.scale },
    deviceScaleFactor: VIDEO.scale,
    isMobile: true,
    hasTouch: true
  });
  // 次の1回の抽選だけ、決めた値を返す（名前が切り替わる演出の乱数はそのまま）。
  await context.addInitScript(`(() => {
    const original = Math.random;
    window.__drawNext = null;
    Math.random = () => {
      if (window.__drawNext === null) return original();
      const value = window.__drawNext;
      window.__drawNext = null;
      return value;
    };
  })();`);
  const page = await context.newPage();
  await page.goto(BASE);
  await page.waitForSelector(".home-start");
  await page.evaluate("document.activeElement?.blur()");
  await page.waitForTimeout(800);

  // Playwright の録画は画面の倍率を反映せず粗くなるので、Chrome の画面転送（screencast）のこまを集める。
  // 動画は、トップページが出そろったところから始まる（読み込み中の画面を最初のこまにしない）。
  const cdp = await context.newCDPSession(page);
  const frames: Array<{ data: Buffer; time: number }> = [];
  cdp.on("Page.screencastFrame", (event: ScreencastFrame) => {
    frames.push({ data: Buffer.from(event.data, "base64"), time: event.metadata.timestamp ?? Date.now() / 1000 });
    void cdp.send("Page.screencastFrameAck", { sessionId: event.sessionId }).catch(() => undefined);
  });
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 95,
    maxWidth: VIDEO.width,
    maxHeight: VIDEO.height
  });

  const arm = (code: string) => {
    const at = pool.findIndex((area) => area.code === code);
    if (at < 0) throw new Error(`くじの対象にないまちです: ${code}`);
    return page.evaluate(`window.__drawNext = ${(at + 0.5) / pool.length}`);
  };
  const revealed = (code: string) =>
    page.locator(".ticket.is-revealed .ticket__no", { hasText: `No.${code}` }).waitFor();

  await page.waitForTimeout(1300);
  const [first, ...rest] = VIDEO_DRAWS;
  if (!first) return;
  await arm(first);
  await page.getByRole("button", { name: /^まちくじを引く/ }).tap();
  await page.waitForSelector(".kuji__controls");
  await page.waitForTimeout(150);
  // 引くボタンと札の上半分（まちの名前と1つ目の特徴）が画面に入るところまで送る。
  await page.evaluate(
    `window.scrollTo({ top: document.querySelector(".kuji__controls").getBoundingClientRect().top + window.scrollY - 12, behavior: "smooth" })`
  );
  await revealed(first);
  await page.waitForTimeout(1500);
  for (const code of rest) {
    await arm(code);
    await page.getByRole("button", { name: "もう一回引く" }).tap();
    await revealed(code);
    await page.waitForTimeout(1500);
  }
  // 最後に引いたまちは、札の下のほうまで見せる。
  await page.waitForTimeout(400);
  await page.evaluate(`window.scrollBy({ top: 250, behavior: "smooth" })`);
  await page.waitForTimeout(2600);
  const end = Date.now() / 1000;
  await cdp.send("Page.stopScreencast");
  await context.close();

  // こまを、届いた時刻の間隔のまま並べて動画にする。
  const work = await mkdtemp(path.join(tmpdir(), "promo-video-"));
  const list: string[] = [];
  for (const [index, frame] of frames.entries()) {
    const name = `f${String(index).padStart(5, "0")}.jpg`;
    await writeFile(path.join(work, name), frame.data);
    const next = frames[index + 1]?.time ?? end;
    list.push(`file '${name}'`, `duration ${Math.max(next - frame.time, 1 / 60).toFixed(4)}`);
  }
  // concat の決まりで、最後のこまはもう一度書く（書かないと最後の長さが無視される）。
  list.push(`file 'f${String(frames.length - 1).padStart(5, "0")}.jpg'`);
  await writeFile(path.join(work, "frames.txt"), `${list.join("\n")}\n`);
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    path.join(work, "frames.txt"),
    "-vf",
    `fps=30,scale=${VIDEO.width}:${VIDEO.height}:flags=lanczos,format=yuv420p`,
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "18",
    "-movflags",
    "+faststart",
    file
  ]);
  await rm(work, { recursive: true, force: true });
}

async function launchAssets(browser: Browser, featured: { quizDate: string }) {
  const dir = path.join(out, "launch");
  await mkdir(dir, { recursive: true });
  const index = areaIndexSchema.parse(JSON.parse(await readFile(path.join(data, "areas.json"), "utf8")));
  const pool = index.areas.filter((area) => area.kind !== "ward");

  // 1. 動画: トップページからまちくじを3回引くところ。引く結果は乱数を決めて固定する。
  await recordKujiVideo(browser, pool, path.join(dir, "kuji.mp4"));

  // 2. トップページ（横長。4枚まとめて投稿したときに切れにくい16:9）
  const wide = await browser.newContext({ viewport: { width: 1200, height: 675 }, deviceScaleFactor: 2 });
  const home = await wide.newPage();
  await home.goto(BASE);
  await home.waitForSelector(".home-start");
  await home.evaluate("document.activeElement?.blur()");
  await home.waitForTimeout(800);
  await home.screenshot({ path: path.join(dir, "01-home.png") });
  await wide.close();

  // 3〜5. くじの札・クイズの問題・図鑑の画像（サイトの「画像で保存」と同じもの）
  const desk = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const tab = await desk.newPage();
  await tab.goto(`${BASE}#view=kuji&area=20321`);
  await tab.waitForSelector(".ticket__map svg");
  await saveDownload(tab, "画像で保存", path.join(dir, "02-kuji-karuizawa.png"));
  await tab.goto(`${BASE}#view=quiz&seed=${featured.quizDate}&q=1`);
  await tab.waitForSelector(".quiz-choice");
  await saveDownload(tab, "問題を画像で保存", path.join(dir, "03-quiz.png"));

  // 図鑑: 富山県を制覇し、ほかに全国から60のまちを集めた見本。
  const toyama = pool.filter((area) => area.prefCode === "16").map((area) => area.code);
  const others = pool
    .filter((_, at) => at % 29 === 7)
    .map((area) => area.code)
    .slice(0, 60);
  await tab.goto(BASE);
  await tab.evaluate(
    (codes) => localStorage.setItem("machinomonosashi:zukan:v1", JSON.stringify({ version: 1, codes })),
    [...toyama, ...others]
  );
  // 図鑑の記録はページを開いたときに読むので、書き込んだあとに読み直す。
  await tab.goto(`${BASE}#view=zukan`);
  await tab.reload();
  await tab.waitForSelector(".zukan-japan svg");
  await saveDownload(tab, "画像で保存", path.join(dir, "04-zukan.png"));
  await tab.evaluate(() => localStorage.clear());
  await desk.close();
  console.log("launch/: 動画と画像4枚");
}

/** その日の5問のうち、X で出題する1問（「全国で最も◯◯」の問題を優先する）。 */
function pickQuestion(quiz: QuizQuestion[]): number {
  const top = quiz.findIndex((question) => question.kind === "top");
  return top >= 0 ? top : 0;
}

async function quizAssets(browser: Browser, from: string, days: number) {
  const [manifest, national, index] = await Promise.all([
    readFile(path.join(data, "manifest.json"), "utf8").then((text) => manifestSchema.parse(JSON.parse(text))),
    readFile(path.join(data, "national.json"), "utf8").then((text) => nationalFileSchema.parse(JSON.parse(text))),
    readFile(path.join(data, "areas.json"), "utf8").then((text) => areaIndexSchema.parse(JSON.parse(text)))
  ]);
  const prefNames = new Map(index.prefectures.map((pref) => [pref.code, pref.name]));
  const desk = await browser.newContext({
    viewport: { width: 980, height: 900 },
    deviceScaleFactor: 2,
    acceptDownloads: true
  });
  const page = await desk.newPage();
  const lines = [
    "# まちクイズ 出題カレンダー",
    "",
    "毎日1問を X に出題し、リンクは返信に貼る。答えは翌日、前日の出題を引用して投稿する。",
    "サイトの「今日の5問」と同じ問題（日本時間の0時に変わる）なので、リンクからそのまま残りの4問を解ける。",
    ""
  ];

  for (let day = 0; day < days; day += 1) {
    const date = addDays(from, day);
    const quiz = buildQuiz(national.areas, manifest, prefNames, date);
    const at = pickQuestion(quiz);
    const question = quiz[at];
    if (!question) continue;
    const number = at + 1;
    const dir = path.join(out, "quiz", date);
    await mkdir(dir, { recursive: true });

    await page.goto(`${BASE}#view=quiz&seed=${date}&q=${number}`);
    await page.waitForSelector(".quiz-choice");
    await saveDownload(page, "問題を画像で保存", path.join(dir, "question.png"));
    await page.locator(".quiz-choice").nth(question.answer).click();
    await page.waitForSelector(".quiz-verdict");
    await page.waitForTimeout(400);
    await page.locator(".quiz-card").screenshot({ path: path.join(dir, "answer.png") });

    const choices = question.choices.map((_, index) =>
      question.kind === "top" ? question.choices[index]?.name : question.choices[index]?.label
    );
    const correct = choices[question.answer] ?? "";
    // X では短く。「◯◯が全国で最も高いのは？」（選択肢がまちなので「市区町村」は省く）
    const prompt = question.kind === "top" ? `${question.label}が${question.phrase}のは？` : question.prompt;
    const explanation =
      question.kind === "top"
        ? `${question.label} ${question.choices[question.answer]?.valueText}（${question.period}）`
        : `${question.choices[question.answer]?.label}が${question.highlight.phrase}（${question.choices[question.answer]?.valueText}、${question.highlight.period}）`;
    const link = `${SITE}#view=quiz&seed=${date}`;
    lines.push(
      `## ${label(date)}`,
      "",
      "出題（画像 `question.png` を添える）:",
      "",
      "```text",
      `Q. ${prompt}`,
      "",
      ...choices.map((choice, index) => `${LETTERS[index]} ${choice}`),
      "",
      "#まちクイズ",
      "```",
      "",
      "返信:",
      "",
      "```text",
      "答えと残り4問はこちら",
      link,
      "```",
      "",
      "投票で出すとき（画像は付けられない。選択肢は X の投票の欄に1つずつ入れる）:",
      "",
      "```text",
      `${prompt} #まちクイズ`,
      "```",
      "",
      ...choices.map((choice) => `- ${choice}`),
      "",
      "翌日の答え（画像 `answer.png` を添えて、前日の出題を引用する）:",
      "",
      "```text",
      `答え：${LETTERS[question.answer]} ${correct}`,
      explanation,
      "#まちクイズ",
      "```",
      ""
    );
  }
  await writeFile(path.join(out, "quiz", "README.md"), `${lines.join("\n")}\n`);
  await desk.close();
  console.log(`quiz/: ${from} から ${days}日分`);
}

async function topicAssets(browser: Browser) {
  const dir = path.join(out, "topics");
  await mkdir(dir, { recursive: true });
  const desk = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await desk.newPage();
  const ids = [...FEATURED_TOPIC_IDS, "vacant-houses", "foreign-residents"];
  for (const id of [...new Set(ids)]) {
    const topic = findTopic(id);
    if (!topic) continue;
    await page.goto(`${BASE}${formatHash(topicRoute(topic))}`);
    await page.waitForSelector(".results__share");
    await saveDownload(page, "画像で保存", path.join(dir, `${id}.png`), ".results__share");
  }
  await desk.close();
  console.log("topics/: 特集ランキングの画像");
}

async function profileAssets(browser: Browser) {
  const dir = path.join(out, "profile");
  await mkdir(dir, { recursive: true });
  const map = JSON.parse(await readFile(path.join(data, "map.json"), "utf8")) as {
    viewBox: number[];
    prefectures: Array<{ code: string; d: string }>;
  };
  const colors: Record<string, string> = {
    "01": "#d3ebe8",
    "03": "#f5dbe1",
    "13": "#e3ebcd",
    "16": "#e3ebcd",
    "20": "#f5dbe1",
    "23": "#e2ddf2",
    "27": "#d3ebe8",
    "34": "#f5dbe1",
    "40": "#e2ddf2",
    "47": "#d3ebe8"
  };
  const japan = `<svg viewBox="${map.viewBox.join(" ")}" xmlns="http://www.w3.org/2000/svg"><g stroke="#2e3033" stroke-width="2" stroke-linejoin="round">${map.prefectures
    .map((pref) => `<path d="${pref.d}" fill="${colors[pref.code] ?? "#fcfcfa"}"/>`)
    .join("")}</g></svg>`;
  const ticks = (count: number, gap: number, tall: number) =>
    Array.from(
      { length: count },
      (_, index) =>
        `<span style="left:${index * gap}px;height:${index % 5 === 0 ? tall : Math.round(tall * 0.55)}px"></span>`
    ).join("");
  const base = `@font-face { font-family: "Pop"; src: url("file://${font}") format("woff2"); font-weight: 700; }
* { margin: 0; box-sizing: border-box; }
body { overflow: hidden; background: #f4f3ef; font-family: "Pop", sans-serif; color: #2e3033; }
.rule { position: relative; border-bottom: 3px solid #2e3033; }
.rule span { position: absolute; bottom: 0; width: 2.5px; background: #2e3033; }`;

  const pages: Array<[string, number, number, string]> = [
    [
      "header.png",
      1500,
      500,
      `<style>${base}
.wrap { position: relative; width: 1500px; height: 500px; padding: 120px 0 0 440px; }
h1 { font-size: 96px; letter-spacing: 0.06em; }
.rule { width: 700px; height: 20px; margin-top: 8px; }
p { margin-top: 26px; font-size: 40px; color: #4b4e52; }
.map { position: absolute; right: 70px; top: 20px; width: 390px; }
</style><div class="wrap"><h1>まちのものさし</h1><div class="rule">${ticks(88, 8, 18)}</div><p>全国1,741のまちをさがそう</p><div class="map">${japan}</div></div>`
    ],
    [
      "icon.png",
      400,
      400,
      `<style>${base}
body { background: #f5dbe1; }
.wrap { display: grid; place-items: center; width: 400px; height: 400px; }
.inner { display: grid; justify-items: center; }
h1 { font-size: 150px; line-height: 1; letter-spacing: 0.02em; }
.rule { width: 250px; height: 22px; margin-top: 10px; }
</style><div class="wrap"><div class="inner"><h1>まち</h1><div class="rule">${ticks(32, 8, 22)}</div></div></div>`
    ]
  ];
  const context = await browser.newContext({ deviceScaleFactor: 1 });
  for (const [file, width, height, html] of pages) {
    const page = await context.newPage();
    await page.setViewportSize({ width, height });
    const temp = path.join(dir, `.${file}.html`);
    await writeFile(temp, `<!doctype html><meta charset="utf-8">${html}`);
    await page.goto(`file://${temp}`);
    await page.evaluate("document.fonts.ready");
    await page.screenshot({ path: path.join(dir, file) });
    await rm(temp);
    await page.close();
  }
  await context.close();
  console.log("profile/: ヘッダーとアイコン");
}

const from = values.from ?? tomorrowInJapan();
const days = Number(values.days);
const browser = await chromium.launch();
try {
  const only = values.only;
  if (!only || only === "launch") await launchAssets(browser, { quizDate: from });
  if (!only || only === "quiz") await quizAssets(browser, from, days);
  if (!only || only === "topics") await topicAssets(browser);
  if (!only || only === "profile") await profileAssets(browser);
} finally {
  await browser.close();
}

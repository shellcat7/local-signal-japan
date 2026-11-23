/**
 * まちくじを X などに投稿したとき、リンクカードにそのまちの札が出るようにする。
 * ビルドのあとに、まちごとの小さなページ（/m/<市区町村コード>/index.html）と、札の画像（/m/<市区町村コード>.png）を作る。
 *
 * - 表示状態は URL のハッシュ（#view=kuji&area=…）に持つので、リンクカード用には別に静的なページが要る。
 *   ページは、リンクカード用の情報（og:title・og:image など）を持ち、開くとすぐにまちくじの画面へ移る。
 * - 画像は satori（レイアウト）と resvg（PNG にする）で作る。サーバーで作る仕組みは持たない（配信は静的ファイルだけ）。
 * - Cloudflare Pages でのビルド（CF_PAGES）か SHARE_PAGES=all のときは全市区町村、それ以外は見本の数件だけを作る。
 *
 * 使い方: pnpm exec tsx scripts/build-share-pages.ts
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import {
  AREA_KIND_LABELS,
  areaIndexSchema,
  areaLocalName,
  findTraits,
  formatNumber,
  manifestSchema,
  nationalFileSchema,
  type Trait
} from "../packages/core/src/index";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const web = path.join(root, "apps/web");
const dist = path.join(web, "dist");
const fonts = path.join(web, "node_modules/@fontsource/zen-maru-gothic/files");

const WIDTH = 1200;
const HEIGHT = 630;
const SAMPLE_CODES = ["10524", "01668", "20321", "03507"];

/** 本番（main）のビルドでは本番のアドレス、それ以外はそのデプロイのアドレスを使う。 */
export function siteUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.SITE_URL) return env.SITE_URL.replace(/\/$/, "");
  if (env.CF_PAGES_BRANCH === "main" || !env.CF_PAGES_URL) return "https://local-signal-japan.pages.dev";
  return env.CF_PAGES_URL.replace(/\/$/, "");
}

const COLORS = {
  paper: "#f4f3ef",
  card: "#fcfcfa",
  ink: "#2e3033",
  ink2: "#4b4e52",
  ink3: "#5f6368",
  rule: "#dfddd6",
  line: "#d6d4cc",
  tint: "#f5dbe1",
  edge: "#e0a3b2",
  deep: "#9a4a5e",
  shu: "#c0442b"
};

type Node = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, ...children: Array<Node | string | null>): Node => ({
  type,
  props: { style: { display: "flex", ...style }, children: children.filter((child) => child !== null) }
});

const escapeHtml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/** ものさしの目盛り（8px ごと、40px ごとに長い）。 */
function ruler(width: number, color: string, tall = 10, short = 5): Node {
  const ticks: Node[] = [];
  for (let x = 0; x <= width; x += 8) {
    ticks.push(
      h("div", {
        position: "absolute",
        left: x,
        bottom: 0,
        width: 1.5,
        height: x % 40 === 0 ? tall : short,
        backgroundColor: color
      })
    );
  }
  return h("div", { position: "relative", width, height: tall }, ...ticks);
}

type Card = {
  code: string;
  prefName: string;
  name: string;
  profile: string;
  traits: Trait[];
  sources: string[];
};

function cardTree(card: Card): Node {
  const stamp = card.traits.some((trait) => trait.scope === "national" && trait.rank === 1);
  const rows = card.traits.map((trait, index) => {
    const first = index === 0 && stamp;
    return h(
      "div",
      {
        alignItems: "center",
        borderTop: `2px solid ${COLORS.rule}`,
        padding: "12px 0",
        gap: 22
      },
      h(
        "div",
        {
          padding: "6px 16px",
          borderRadius: 10,
          backgroundColor: first ? COLORS.shu : COLORS.tint,
          color: first ? "#ffffff" : COLORS.ink,
          fontSize: 22,
          flexShrink: 0
        },
        trait.phrase
      ),
      h(
        "div",
        { flexDirection: "column", flexGrow: 1, minWidth: 0 },
        h("div", { fontSize: 21, color: COLORS.ink }, trait.label),
        h("div", { fontSize: 15, color: COLORS.ink3 }, trait.period)
      ),
      h("div", { fontSize: 36, color: COLORS.ink, flexShrink: 0 }, trait.valueText)
    );
  });

  return h(
    "div",
    {
      width: WIDTH,
      height: HEIGHT,
      flexDirection: "column",
      backgroundColor: COLORS.paper,
      fontFamily: "Zen Maru Gothic",
      color: COLORS.ink
    },
    h("div", { height: 12, backgroundColor: COLORS.tint, alignItems: "flex-end" }, ruler(WIDTH, COLORS.deep, 10, 5)),
    h(
      "div",
      { justifyContent: "space-between", alignItems: "center", padding: "16px 56px 0" },
      h(
        "div",
        { flexDirection: "column" },
        h("div", { fontSize: 28, letterSpacing: 4 }, "まちのものさし"),
        h("div", { borderBottom: `2px solid ${COLORS.ink}` }, ruler(222, COLORS.ink, 9, 5))
      ),
      h(
        "div",
        {
          padding: "6px 20px",
          fontSize: 24,
          backgroundColor: COLORS.tint,
          border: `2px solid ${COLORS.edge}`,
          borderRadius: 12,
          boxShadow: `0 4px 0 ${COLORS.edge}`
        },
        `まちくじ  No.${card.code}`
      )
    ),
    h(
      "div",
      {
        position: "relative",
        flexDirection: "column",
        flexGrow: 1,
        margin: "18px 56px 0",
        padding: "22px 40px 8px",
        backgroundColor: COLORS.card,
        border: `3px solid ${COLORS.line}`,
        borderRadius: 22
      },
      h("div", { fontSize: 22, color: COLORS.ink2 }, card.prefName),
      h("div", { fontSize: 64, lineHeight: 1.15 }, card.name),
      h("div", { fontSize: 18, color: COLORS.ink2, marginBottom: 12, fontFamily: "Zen Maru Gothic" }, card.profile),
      ...rows,
      stamp
        ? h(
            "div",
            {
              position: "absolute",
              top: 22,
              right: 40,
              width: 128,
              height: 128,
              borderRadius: 64,
              border: `6px solid ${COLORS.shu}`,
              color: COLORS.shu,
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              transform: "rotate(-12deg)"
            },
            h("div", { fontSize: 24 }, "全国"),
            h("div", { fontSize: 42, lineHeight: 1 }, "1位")
          )
        : null
    ),
    h(
      "div",
      {
        flexDirection: "column",
        margin: "14px 56px 16px",
        paddingTop: 8,
        borderTop: `2px solid ${COLORS.ink}`,
        fontSize: 13,
        color: COLORS.ink2
      },
      ...card.sources.map((line) => h("div", {}, line)),
      h("div", { position: "absolute", right: 0, bottom: 0, fontSize: 15 }, "local-signal-japan.pages.dev")
    )
  );
}

function pageHtml(card: Card, url: string): string {
  const title = `まちくじ：${card.prefName} ${card.name}`;
  const description =
    card.traits.map((trait) => `${trait.label}が${trait.phrase}（${trait.valueText}）。`).join("") ||
    `${card.prefName} ${card.name}の公的統計`;
  const target = `../../#view=kuji&area=${card.code}`;
  const page = `${url}/m/${card.code}/`;
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} | まちのものさし</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="noindex">
<meta property="og:type" content="website">
<meta property="og:site_name" content="まちのものさし">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${page}">
<meta property="og:image" content="${url}/m/${card.code}.png">
<meta property="og:image:width" content="${WIDTH}">
<meta property="og:image:height" content="${HEIGHT}">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="${page}">
<meta http-equiv="refresh" content="0; url=${target}">
</head>
<body>
<p><a href="${target}">${escapeHtml(title)}（まちのものさし）を開く</a></p>
</body>
</html>
`;
}

async function main() {
  const data = path.join(web, "public/data");
  const [manifest, national, index] = await Promise.all([
    readFile(path.join(data, "manifest.json"), "utf8").then((text) => manifestSchema.parse(JSON.parse(text))),
    readFile(path.join(data, "national.json"), "utf8").then((text) => nationalFileSchema.parse(JSON.parse(text))),
    readFile(path.join(data, "areas.json"), "utf8").then((text) => areaIndexSchema.parse(JSON.parse(text)))
  ]);
  const prefNames = new Map(index.prefectures.map((pref) => [pref.code, pref.name]));
  const all = process.env.CF_PAGES === "1" || process.env.SHARE_PAGES === "all";
  const reference = national.areas.filter((row) => row.kind !== "ward");
  const targets = all ? reference : reference.filter((row) => SAMPLE_CODES.includes(row.code));
  const total = reference.length;
  const url = siteUrl();

  // 和文の書体を先に渡す（satori は先に渡した書体から字を探す。和文の書体は数字と欧文も持っている）。
  // 和文の書体に入っていない「→」「㎡」は、文字の範囲ごとに分かれたファイルから足す。
  // satori は、同じ名前の書体は1つしか使わないので、足す書体には別の名前を付ける（字が見つからないときに順に探す）。
  const fontList = await Promise.all(
    [
      ["Zen Maru Gothic", "zen-maru-gothic-japanese-700-normal.woff"],
      ["Zen Maru Gothic Arrows", "zen-maru-gothic-107-700-normal.woff"],
      ["Zen Maru Gothic Units", "zen-maru-gothic-71-700-normal.woff"]
    ].map(async ([name, file]) => ({
      name: name as string,
      data: await readFile(path.join(fonts, file as string)),
      weight: 700 as const
    }))
  );
  const furusato = manifest.additionalSources.find((source) => source.id === "furusato");
  await mkdir(path.join(dist, "m"), { recursive: true });

  const started = Date.now();
  for (const [count, row] of targets.entries()) {
    const prefName = prefNames.get(row.prefCode) ?? "";
    const traits = findTraits(row, national.areas, manifest, prefName, 3, { friendly: true });
    const populationRank =
      row.population === null
        ? null
        : 1 + reference.filter((other) => other.population !== null && other.population > (row.population ?? 0)).length;
    const card: Card = {
      code: row.code,
      prefName,
      name: areaLocalName(row),
      profile: `${AREA_KIND_LABELS[row.kind]}${
        row.population === null ? "" : `・人口 ${formatNumber(row.population)}人`
      }${populationRank === null ? "" : `（全国${formatNumber(total)}のうち多いほうから${formatNumber(populationRank)}番目）`}`,
      traits,
      sources: [
        `出典：${manifest.source.attribution}`,
        ...(traits.some((trait) => trait.key.startsWith("furusato")) && furusato
          ? [`出典：${furusato.attribution}`]
          : []),
        manifest.source.credit
      ]
    };
    const svg = await satori(cardTree(card) as unknown as Parameters<typeof satori>[0], {
      width: WIDTH,
      height: HEIGHT,
      fonts: fontList
    });
    const png = new Resvg(svg, { fitTo: { mode: "width", value: WIDTH } }).render().asPng();
    await mkdir(path.join(dist, "m", row.code), { recursive: true });
    await Promise.all([
      writeFile(path.join(dist, "m", `${row.code}.png`), png),
      writeFile(path.join(dist, "m", row.code, "index.html"), pageHtml(card, url))
    ]);
    if ((count + 1) % 200 === 0) console.log(`  ${count + 1} / ${targets.length}`);
  }
  console.log(
    `まちごとの共有ページと画像を作りました: ${targets.length}件（${((Date.now() - started) / 1000).toFixed(1)}秒、${url}）`
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}

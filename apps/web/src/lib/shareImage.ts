/**
 * 共有用の画像（PNG）をブラウザの中で描く。サーバーには何も送らない。
 * 画像には必ず出典を描き込む（公共データ利用規約・CC BY 4.0 の出典表示）。
 * 大きさは X などで切り取られにくい 16:9。
 */

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 675;
const SCALE = 2;
const PADDING = 56;

const INK = "#14171a";
const INK_2 = "#454b52";
const INK_3 = "#676d75";
const RULE = "#dcdfe3";
const MARK = "#ffe14a";
const MARK_WASH = "#fff6c4";

const SANS =
  '"IBM Plex Sans Variable", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "BIZ UDPGothic", "Yu Gothic UI", "Noto Sans JP", Meiryo, sans-serif';
const WORDMARK = `"Machi Wordmark", ${SANS}`;

export type CardSources = {
  /** 出典の行（1行ずつ描く）。 */
  lines: string[];
  /** サイトのアドレス（右下に描く）。 */
  site: string;
};

export type RankingCardRow = { rank: number | null; name: string; sub: string; value: string; current?: boolean };

export type RankingCard = {
  kind: "ranking";
  title: string;
  subtitle: string;
  rows: RankingCardRow[];
  /** 表の下に添える一言（「該当 518市区町村」など）。 */
  note: string;
  sources: CardSources;
};

export type HighlightsCard = {
  kind: "highlights";
  /** 右上に添える札の文字（「まちくじ No.10524」など）。 */
  tag?: string;
  name: string;
  sub: string;
  items: Array<{ phrase: string; label: string; value: string; period: string; top: boolean }>;
  empty: string;
  sources: CardSources;
};

export type MapCard = {
  kind: "map";
  title: string;
  subtitle: string;
  /** 地図（SVG の data: URL）。 */
  mapUrl: string;
  mapAspect: number;
  legend: Array<{ color: string; label: string; pattern?: boolean }>;
  sources: CardSources;
};

/** まちくじの札（ポップな見た目）。 */
export type KujiCard = {
  kind: "kuji";
  code: string;
  prefName: string;
  name: string;
  profile: string;
  traits: Array<{ phrase: string; label: string; value: string; period: string }>;
  /** 全国1位の項目があれば、朱のハンコを押す。 */
  stamp: boolean;
  sources: CardSources;
};

/** まちクイズの問題（答えは描かない）。 */
export type QuizCard = {
  kind: "quiz";
  number: number;
  /** 札の下に添える一言（どの回の問題か）。 */
  footnote: string;
  prompt: string;
  choices: string[];
  sources: CardSources;
};

/** まちクイズの結果。 */
export type QuizResultCard = {
  kind: "quizResult";
  heading: string;
  correct: number;
  total: number;
  title: string;
  marks: boolean[];
  sources: CardSources;
};

/** まち図鑑。 */
export type ZukanCard = {
  kind: "zukan";
  count: number;
  total: number;
  prefectures: number;
  completed: number;
  /** 都道府県ごとの ます目の位置・短い名前・集めた割合（0〜1）。 */
  tiles: Array<{ column: number; row: number; name: string; ratio: number }>;
  sources: CardSources;
};

export type Card = RankingCard | HighlightsCard | MapCard | KujiCard | QuizCard | QuizResultCard | ZukanCard;

function font(weight: number, size: number, family = SANS) {
  return `${weight} ${size}px ${family}`;
}

/** 幅に収まるよう、末尾を「…」で詰める。 */
function fit(context: CanvasRenderingContext2D, text: string, width: number): string {
  if (context.measureText(text).width <= width) return text;
  let end = text.length;
  while (end > 0 && context.measureText(`${text.slice(0, end)}…`).width > width) end -= 1;
  return `${text.slice(0, end)}…`;
}

/** 名前の下に目盛りを引いたロゴ。 */
function drawWordmark(context: CanvasRenderingContext2D, x: number, y: number) {
  context.fillStyle = INK;
  context.font = font(700, 22, WORDMARK);
  context.textBaseline = "alphabetic";
  context.fillText("まちのものさし", x, y);
  const width = context.measureText("まちのものさし").width;
  const base = y + 9;
  context.fillRect(x, base, width, 1.5);
  for (let tick = 0; tick * 6 <= width; tick += 1) {
    const height = tick % 5 === 0 ? 7 : 4;
    context.fillRect(x + tick * 6, base - height, 1, height);
  }
}

function drawSources(context: CanvasRenderingContext2D, sources: CardSources, onYellow = false) {
  const bottom = CARD_HEIGHT - 28;
  context.fillStyle = onYellow ? INK : RULE;
  context.fillRect(PADDING, bottom - sources.lines.length * 19 - 14, CARD_WIDTH - PADDING * 2, onYellow ? 2 : 1);
  context.font = font(400, 13);
  context.fillStyle = onYellow ? INK : INK_3;
  context.textBaseline = "alphabetic";
  sources.lines.forEach((line, index) => {
    const y = bottom - (sources.lines.length - 1 - index) * 19;
    context.fillText(fit(context, line, CARD_WIDTH - PADDING * 2 - 260), PADDING, y);
  });
  context.textAlign = "right";
  context.font = font(500, 14);
  context.fillStyle = INK_2;
  context.fillText(sources.site, CARD_WIDTH - PADDING, bottom);
  context.textAlign = "left";
}

function drawHeader(context: CanvasRenderingContext2D, title: string, subtitle: string) {
  drawWordmark(context, PADDING, 58);
  context.fillStyle = INK;
  context.font = font(700, 34);
  context.fillText(fit(context, title, CARD_WIDTH - PADDING * 2), PADDING, 122);
  context.font = font(400, 17);
  context.fillStyle = INK_2;
  context.fillText(fit(context, subtitle, CARD_WIDTH - PADDING * 2), PADDING, 152);
}

function drawRanking(context: CanvasRenderingContext2D, card: RankingCard) {
  drawHeader(context, card.title, card.subtitle);

  const top = 186;
  const columns = card.rows.length > 5 ? 2 : 1;
  const perColumn = Math.max(1, Math.ceil(card.rows.length / columns));
  // 件数が少なくても下に大きな余白が残らないよう、行の高さを広げる。
  const rowHeight = Math.min(72, Math.max(40, (CARD_HEIGHT - 150 - top - 40) / perColumn));
  const gap = 48;
  const columnWidth = (CARD_WIDTH - PADDING * 2 - gap * (columns - 1)) / columns;

  card.rows.forEach((row, index) => {
    const column = Math.floor(index / perColumn);
    const x = PADDING + column * (columnWidth + gap);
    const y = top + (index % perColumn) * rowHeight;
    if (row.current) {
      context.fillStyle = MARK_WASH;
      context.fillRect(x - 8, y, columnWidth + 16, rowHeight);
    }
    context.fillStyle = RULE;
    context.fillRect(x, y + rowHeight - 1, columnWidth, 1);

    context.textBaseline = "middle";
    const middle = y + rowHeight / 2;
    context.font = font(500, 17);
    context.fillStyle = INK_3;
    context.fillText(row.rank === null ? "—" : String(row.rank), x, middle);

    context.font = font(700, rowHeight >= 56 ? 24 : 20);
    context.fillStyle = INK;
    const value = row.value;
    context.textAlign = "right";
    context.fillText(value, x + columnWidth, middle);
    const valueWidth = context.measureText(value).width;
    context.textAlign = "left";

    const nameX = x + 40;
    const nameWidth = columnWidth - 40 - valueWidth - 20;
    context.font = font(700, rowHeight >= 56 ? 22 : 19);
    const name = fit(context, row.name, nameWidth);
    context.fillText(name, nameX, middle);
    const used = context.measureText(name).width;
    context.font = font(400, 14);
    context.fillStyle = INK_3;
    if (used + 12 < nameWidth)
      context.fillText(fit(context, row.sub, nameWidth - used - 12), nameX + used + 10, middle + 1);
  });

  context.textBaseline = "alphabetic";
  context.font = font(400, 15);
  context.fillStyle = INK_2;
  context.fillText(card.note, PADDING, top + perColumn * rowHeight + 30);
}

function drawHighlights(context: CanvasRenderingContext2D, card: HighlightsCard) {
  drawWordmark(context, PADDING, 58);
  if (card.tag) {
    context.textAlign = "right";
    context.font = font(500, 16);
    context.fillStyle = INK_2;
    context.fillText(card.tag, CARD_WIDTH - PADDING, 58);
    context.textAlign = "left";
  }
  context.fillStyle = INK;
  context.font = font(700, 44);
  context.fillText(card.name, PADDING, 128);
  const nameWidth = context.measureText(card.name).width;
  context.font = font(400, 18);
  context.fillStyle = INK_2;
  context.fillText(card.sub, PADDING + nameWidth + 16, 126);

  const top = 168;
  const rowHeight = Math.min(96, Math.max(62, (CARD_HEIGHT - 150 - top) / Math.max(card.items.length, 1)));
  if (card.items.length === 0) {
    context.font = font(400, 20);
    context.fillText(card.empty, PADDING, top + 40);
  }
  card.items.forEach((item, index) => {
    const y = top + index * rowHeight;
    context.fillStyle = RULE;
    context.fillRect(PADDING, y + rowHeight - 1, CARD_WIDTH - PADDING * 2, 1);
    context.textBaseline = "alphabetic";

    const baseline = y + rowHeight / 2 + 8;
    context.font = font(700, 22);
    const phraseWidth = context.measureText(item.phrase).width;
    if (item.top) {
      context.fillStyle = MARK;
      context.fillRect(PADDING - 4, baseline - 24, phraseWidth + 8, 32);
    }
    context.fillStyle = INK;
    context.fillText(item.phrase, PADDING, baseline);

    context.font = font(700, 30);
    context.textAlign = "right";
    context.fillText(item.value, CARD_WIDTH - PADDING, baseline + 2);
    const valueWidth = context.measureText(item.value).width;
    context.textAlign = "left";

    const labelX = PADDING + Math.max(phraseWidth, 300) + 24;
    const labelWidth = CARD_WIDTH - PADDING - valueWidth - 24 - labelX;
    context.font = font(500, 19);
    context.fillStyle = INK;
    context.fillText(fit(context, item.label, labelWidth), labelX, baseline - 8);
    context.font = font(400, 14);
    context.fillStyle = INK_3;
    context.fillText(fit(context, item.period, labelWidth), labelX, baseline + 14);
  });
}

/* ---------- あそぶ（まちくじ・まちクイズ・まち図鑑）のポップな札 ---------- */

const POP = '"Zen Maru Gothic", ' + SANS;
const SHU = "#d63c22";
/** 出典の線より上で、札を描ける下端。 */
const popBottom = (sources: CardSources) => CARD_HEIGHT - 28 - sources.lines.length * 19 - 14 - 22;

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

/** 墨の太い線と、右下にずらした影の札。 */
function popPanel(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius = 26) {
  context.fillStyle = INK;
  roundedRect(context, x + 8, y + 8, width, height, radius);
  context.fill();
  context.fillStyle = "#ffffff";
  roundedRect(context, x, y, width, height, radius);
  context.fill();
  context.lineWidth = 4;
  context.strokeStyle = INK;
  context.stroke();
}

/** 黄色の地に、ロゴと右上の見出し（「まちくじ No.10524」など）。 */
function popBackground(context: CanvasRenderingContext2D, tag: string) {
  context.fillStyle = MARK;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  drawWordmark(context, PADDING, 50);
  context.font = font(700, 24, POP);
  const width = context.measureText(tag).width + 36;
  const x = CARD_WIDTH - PADDING - width;
  context.fillStyle = INK;
  roundedRect(context, x, 18, width, 44, 22);
  context.fill();
  context.fillStyle = MARK;
  context.textBaseline = "middle";
  context.fillText(tag, x + 18, 41);
  context.textBaseline = "alphabetic";
}

/** 朱のハンコ（丸の中に2行）。 */
function drawStamp(context: CanvasRenderingContext2D, x: number, y: number, radius: number, lines: [string, string]) {
  context.save();
  context.translate(x, y);
  context.rotate(-0.2);
  context.strokeStyle = SHU;
  context.fillStyle = SHU;
  context.lineWidth = 6;
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.stroke();
  context.lineWidth = 2;
  context.beginPath();
  context.arc(0, 0, radius - 9, 0, Math.PI * 2);
  context.stroke();
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = font(700, radius * 0.42, POP);
  context.fillText(lines[0], 0, -radius * 0.24);
  context.font = font(700, radius * 0.6, POP);
  context.fillText(lines[1], 0, radius * 0.3);
  context.restore();
}

/** 幅に収まるように、文字単位で折り返す（最大 maxLines 行。あふれたら「…」）。 */
function wrap(context: CanvasRenderingContext2D, text: string, width: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const char of text) {
    if (context.measureText(line + char).width > width && line !== "") {
      lines.push(line);
      line = char;
      if (lines.length === maxLines) break;
    } else {
      line += char;
    }
  }
  if (lines.length < maxLines && line !== "") lines.push(line);
  const used = lines.join("").length;
  if (used < [...text].length && lines.length > 0) {
    lines[lines.length - 1] = fit(context, `${lines[lines.length - 1]}…`, width);
  }
  return lines;
}

function drawKuji(context: CanvasRenderingContext2D, card: KujiCard) {
  popBackground(context, `まちくじ  No.${card.code}`);
  const top = 86;
  const bottom = popBottom(card.sources);
  const left = PADDING;
  const width = CARD_WIDTH - PADDING * 2 - 8;
  popPanel(context, left, top, width, bottom - top);

  const inner = left + 40;
  context.fillStyle = INK_2;
  context.font = font(700, 22, POP);
  context.fillText(card.prefName, inner, top + 52);
  context.fillStyle = INK;
  context.font = font(700, 66, POP);
  context.fillText(fit(context, card.name, width - 300), inner, top + 124);
  context.font = font(400, 18);
  context.fillStyle = INK_2;
  context.fillText(card.profile, inner, top + 160);
  if (card.stamp) drawStamp(context, left + width - 110, top + 96, 64, ["全国", "1位"]);

  const rowsTop = top + 184;
  const rowHeight = Math.min(84, (bottom - rowsTop - 18) / Math.max(card.traits.length, 1));
  card.traits.forEach((trait, index) => {
    const y = rowsTop + index * rowHeight;
    context.fillStyle = RULE;
    context.fillRect(inner, y, width - 80, 2);
    const middle = y + rowHeight / 2 + 2;
    context.font = font(700, 22, POP);
    const pillWidth = Math.min(330, context.measureText(trait.phrase).width + 30);
    context.fillStyle = MARK;
    roundedRect(context, inner, middle - 22, pillWidth, 44, 22);
    context.fill();
    context.lineWidth = 2;
    context.strokeStyle = INK;
    context.stroke();
    context.fillStyle = INK;
    context.textBaseline = "middle";
    context.fillText(fit(context, trait.phrase, pillWidth - 30), inner + 15, middle + 1);

    context.font = font(700, 36, POP);
    context.textAlign = "right";
    context.fillText(trait.value, inner + width - 80, middle);
    const valueWidth = context.measureText(trait.value).width;
    context.textAlign = "left";

    const labelX = inner + pillWidth + 22;
    const labelWidth = width - 80 - pillWidth - 22 - valueWidth - 24;
    context.font = font(500, 19);
    context.fillText(fit(context, trait.label, labelWidth), labelX, middle - 11);
    context.font = font(400, 14);
    context.fillStyle = INK_3;
    context.fillText(fit(context, trait.period, labelWidth), labelX, middle + 14);
    context.textBaseline = "alphabetic";
  });
}

const LETTERS = ["A", "B", "C", "D"];

function drawQuiz(context: CanvasRenderingContext2D, card: QuizCard) {
  popBackground(context, `まちクイズ  Q${card.number}`);
  const top = 86;
  const bottom = popBottom(card.sources);
  const left = PADDING;
  const width = CARD_WIDTH - PADDING * 2 - 8;
  popPanel(context, left, top, width, bottom - top);

  context.fillStyle = INK;
  context.font = font(700, 38, POP);
  const lines = wrap(context, card.prompt, width - 80, 2);
  lines.forEach((line, index) => context.fillText(line, left + 40, top + 70 + index * 50));

  const gridTop = top + 70 + lines.length * 50 + 8;
  const gap = 20;
  const boxWidth = (width - 80 - gap) / 2;
  const boxHeight = Math.min(96, (bottom - gridTop - 28 - gap) / 2);
  card.choices.forEach((choice, index) => {
    const x = left + 40 + (index % 2) * (boxWidth + gap);
    const y = gridTop + Math.floor(index / 2) * (boxHeight + gap);
    context.fillStyle = "#ffffff";
    roundedRect(context, x, y, boxWidth, boxHeight, 18);
    context.fill();
    context.lineWidth = 3;
    context.strokeStyle = INK;
    context.stroke();
    const cx = x + 40;
    const cy = y + boxHeight / 2;
    context.fillStyle = MARK;
    context.beginPath();
    context.arc(cx, cy, 22, 0, Math.PI * 2);
    context.fill();
    context.lineWidth = 2.5;
    context.stroke();
    context.fillStyle = INK;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = font(700, 24, POP);
    context.fillText(LETTERS[index] ?? "", cx, cy + 1);
    context.textAlign = "left";
    context.font = font(700, 26, POP);
    context.fillText(fit(context, choice, boxWidth - 96), x + 76, cy + 1);
    context.textBaseline = "alphabetic";
  });
  context.fillStyle = INK_2;
  context.font = font(700, 20, POP);
  context.fillText(fit(context, card.footnote, width - 80), left + 40, bottom - 30);
}

function drawQuizResult(context: CanvasRenderingContext2D, card: QuizResultCard) {
  popBackground(context, "まちクイズ");
  const top = 86;
  const bottom = popBottom(card.sources);
  const left = PADDING;
  const width = CARD_WIDTH - PADDING * 2 - 8;
  popPanel(context, left, top, width, bottom - top);

  context.fillStyle = INK_2;
  context.font = font(700, 26, POP);
  context.fillText(card.heading, left + 40, top + 62);
  context.fillStyle = INK;
  context.font = font(700, 150, POP);
  const score = String(card.correct);
  context.fillText(score, left + 40, top + 220);
  const scoreWidth = context.measureText(score).width;
  context.font = font(700, 62, POP);
  context.fillText(`/${card.total}問正解`, left + 52 + scoreWidth, top + 216);

  drawStamp(context, left + width - 150, top + 150, 92, ["称号", card.title.replace(/^まち/, "")]);
  context.fillStyle = INK;
  context.font = font(700, 30, POP);
  context.fillText(card.title, left + 40, top + 280);

  const size = 54;
  card.marks.forEach((correct, index) => {
    const x = left + 40 + index * (size + 14);
    const y = bottom - size - 32;
    context.fillStyle = correct ? MARK : "#ffffff";
    roundedRect(context, x, y, size, size, 12);
    context.fill();
    context.lineWidth = 3;
    context.strokeStyle = INK;
    context.stroke();
    context.fillStyle = correct ? SHU : INK_3;
    context.font = font(700, 32, POP);
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(correct ? "○" : "×", x + size / 2, y + size / 2 + 2);
    context.textAlign = "left";
    context.textBaseline = "alphabetic";
  });
}

function drawZukan(context: CanvasRenderingContext2D, card: ZukanCard) {
  popBackground(context, "まち図鑑");
  const top = 86;
  const bottom = popBottom(card.sources);
  const left = PADDING;
  const width = CARD_WIDTH - PADDING * 2 - 8;
  popPanel(context, left, top, width, bottom - top);

  const inner = left + 40;
  context.fillStyle = INK;
  context.font = font(700, 26, POP);
  context.fillText("集めたまち", inner, top + 62);
  context.font = font(700, 110, POP);
  const count = card.count.toLocaleString("ja-JP");
  context.fillText(count, inner, top + 170);
  const countWidth = context.measureText(count).width;
  context.font = font(700, 30, POP);
  context.fillStyle = INK_2;
  context.fillText(`/ ${card.total.toLocaleString("ja-JP")}`, inner + countWidth + 12, top + 168);
  context.fillStyle = INK;
  context.font = font(700, 26, POP);
  context.fillText(`${card.prefectures} / 47 都道府県`, inner, top + 230);
  context.fillText(`制覇 ${card.completed}`, inner, top + 272);

  // ます目の日本地図（集めた割合で塗る）。
  const tile = Math.min(40, (bottom - top - 40) / 10 - 4);
  const mapLeft = left + width - 40 - 14 * (tile + 4);
  const mapTop = top + 20;
  for (const item of card.tiles) {
    const x = mapLeft + (item.column - 1) * (tile + 4);
    const y = mapTop + (item.row - 1) * (tile + 4);
    context.fillStyle = item.ratio >= 1 ? SHU : item.ratio > 0 ? MARK : "#ffffff";
    roundedRect(context, x, y, tile, tile, 7);
    context.fill();
    context.lineWidth = 2;
    context.strokeStyle = item.ratio > 0 ? INK : RULE;
    context.stroke();
    context.fillStyle = item.ratio >= 1 ? "#ffffff" : item.ratio > 0 ? INK : INK_3;
    context.font = font(700, 11, POP);
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(item.name.slice(0, 3), x + tile / 2, y + tile / 2 + 1);
    context.textAlign = "left";
    context.textBaseline = "alphabetic";
  }
}

function cardText(card: Card): string {
  switch (card.kind) {
    case "kuji":
      return [card.prefName, card.name, card.code, ...card.traits.flatMap((trait) => [trait.phrase, trait.value])].join(
        ""
      );
    case "quiz":
      return [card.prompt, ...card.choices, card.footnote, String(card.number)].join("");
    case "quizResult":
      return [card.heading, card.title, "称号問正解○×0123456789/"].join("");
    case "zukan":
      return [...card.tiles.map((item) => item.name), "集めたまち都道府県制覇図鑑0123456789,/ "].join("");
    default:
      return "";
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("地図の画像を作れませんでした"));
    image.src = url;
  });
}

async function drawMap(context: CanvasRenderingContext2D, card: MapCard) {
  drawHeader(context, card.title, card.subtitle);
  const top = 176;
  // 出典の行数に合わせて、地図が出典の上の線にかからない高さにする。
  const bottom = CARD_HEIGHT - 28 - card.sources.lines.length * 19 - 14 - 10;
  const height = bottom - top;
  const legendWidth = 200;
  const width = Math.min(height * card.mapAspect, CARD_WIDTH - PADDING * 2 - legendWidth - 40);
  // 地図と凡例をひとまとまりにして、左右の中央に置く。
  const mapX = PADDING + (CARD_WIDTH - PADDING * 2 - (width + 40 + legendWidth)) / 2;
  const image = await loadImage(card.mapUrl);
  context.drawImage(image, mapX, top, width, width / card.mapAspect);

  const legendX = mapX + width + 40;
  card.legend.forEach((entry, index) => {
    const y = top + 10 + index * 30;
    context.fillStyle = entry.color;
    context.fillRect(legendX, y, 22, 18);
    context.strokeStyle = INK_3;
    context.lineWidth = 0.75;
    context.strokeRect(legendX + 0.5, y + 0.5, 21, 17);
    if (entry.pattern) {
      context.beginPath();
      for (let offset = -18; offset < 22; offset += 6) {
        context.moveTo(legendX + offset, y + 18);
        context.lineTo(legendX + offset + 18, y);
      }
      context.save();
      context.rect(legendX, y, 22, 18);
      context.clip();
      context.stroke();
      context.restore();
    }
    context.fillStyle = INK;
    context.font = font(400, 14);
    context.textBaseline = "middle";
    context.fillText(fit(context, entry.label, 160), legendX + 32, y + 9);
    context.textBaseline = "alphabetic";
  });
}

async function waitForFonts(card: Card) {
  try {
    await Promise.all([
      document.fonts.load(font(700, 20)),
      document.fonts.load(font(400, 20)),
      document.fonts.load(font(700, 20, WORDMARK), "まちのものさし"),
      // 丸ゴシックは、文字ごとに分かれたファイルのうち、札に使う文字のぶんだけを読む。
      document.fonts.load(font(700, 20, POP), `まちくじクイズ図鑑全国位${cardText(card)}`)
    ]);
  } catch {
    // 書体を読めなくても、端末の書体で描ける。
  }
}

/** カードを描いて PNG にする。 */
export async function renderCard(card: Card): Promise<Blob> {
  await waitForFonts(card);
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH * SCALE;
  canvas.height = CARD_HEIGHT * SCALE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("画像を作れませんでした");
  context.scale(SCALE, SCALE);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  let onYellow = true;
  if (card.kind === "kuji") drawKuji(context, card);
  else if (card.kind === "quiz") drawQuiz(context, card);
  else if (card.kind === "quizResult") drawQuizResult(context, card);
  else if (card.kind === "zukan") drawZukan(context, card);
  else {
    onYellow = false;
    if (card.kind === "ranking") drawRanking(context, card);
    else if (card.kind === "highlights") drawHighlights(context, card);
    else await drawMap(context, card);
  }
  drawSources(context, card.sources, onYellow);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("画像を作れませんでした"))), "image/png");
  });
}

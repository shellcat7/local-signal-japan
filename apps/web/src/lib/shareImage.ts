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

export type Card = RankingCard | HighlightsCard | MapCard;

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

function drawSources(context: CanvasRenderingContext2D, sources: CardSources) {
  const bottom = CARD_HEIGHT - 28;
  context.fillStyle = RULE;
  context.fillRect(PADDING, bottom - sources.lines.length * 19 - 14, CARD_WIDTH - PADDING * 2, 1);
  context.font = font(400, 13);
  context.fillStyle = INK_3;
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
  const height = CARD_HEIGHT - top - 104;
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

async function waitForFonts() {
  try {
    await Promise.all([
      document.fonts.load(font(700, 20)),
      document.fonts.load(font(400, 20)),
      document.fonts.load(font(700, 20, WORDMARK), "まちのものさし")
    ]);
  } catch {
    // 書体を読めなくても、端末の書体で描ける。
  }
}

/** カードを描いて PNG にする。 */
export async function renderCard(card: Card): Promise<Blob> {
  await waitForFonts();
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH * SCALE;
  canvas.height = CARD_HEIGHT * SCALE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("画像を作れませんでした");
  context.scale(SCALE, SCALE);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  if (card.kind === "ranking") drawRanking(context, card);
  else if (card.kind === "highlights") drawHighlights(context, card);
  else await drawMap(context, card);
  drawSources(context, card.sources);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("画像を作れませんでした"))), "image/png");
  });
}

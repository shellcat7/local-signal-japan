import ExcelJS from "exceljs";
import type { SourceDocument } from "@local-signal-japan/core";

/**
 * 総務省「ふるさと納税に関する現況調査結果」から、市区町村ごとの受入額・費用・住民税控除額を読む。
 * 資料は毎年8月ごろに公表され、ファイルのURLは年ごとに変わるため、案内ページのリンクから探す。
 */
export const FURUSATO_ARCHIVE_URL =
  "https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/furusato/archive/";

export type FurusatoData = {
  /** 受入額の年度（西暦）。 */
  receiptsYear: number;
  /** 住民税控除額の課税年度（西暦）。 */
  deductionYear: number;
  /** 市区町村コード（5桁） → 値（円）。 */
  receipts: Map<string, number>;
  costs: Map<string, number>;
  deductions: Map<string, number>;
  documents: SourceDocument[];
};

export type FetchBinary = (url: string) => Promise<ArrayBuffer>;

/** 全角数字と「元」を含む和暦の年度を西暦にする。例: 令和７年度 → 2025 */
export function eraYearToWestern(text: string): number | null {
  const match = /(平成|令和)\s*([0-9０-９]+|元)\s*年度/.exec(text.normalize("NFKC"));
  if (!match) return null;
  const number = match[2] === "元" ? 1 : Number(match[2]);
  return (match[1] === "令和" ? 2018 : 1988) + number;
}

/** 案内ページ（Shift_JIS）から、資料の題名に合うリンクを探す。 */
export function findDocumentLinks(
  html: string,
  baseUrl = FURUSATO_ARCHIVE_URL
): { receipts: SourceDocument; deductions: SourceDocument } {
  const links = [...html.matchAll(/<a[^>]+href="([^"]+\.xlsx)"[^>]*>([\s\S]*?)<\/a>/gi)].map((match) => ({
    url: new URL(match[1] ?? "", baseUrl).toString(),
    title: (match[2] ?? "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, "")
      .normalize("NFKC")
  }));
  const find = (pattern: RegExp, label: string): SourceDocument => {
    const link = links.find((candidate) => pattern.test(candidate.title));
    if (!link) {
      throw new Error(`ふるさと納税の資料（${label}）のリンクが案内ページに見つかりません: ${baseUrl}`);
    }
    return { title: link.title, publisher: "総務省", url: link.url };
  };
  return {
    receipts: find(/各自治体の.*年度受入額等/, "各自治体の受入額等"),
    deductions: find(/住民税控除額/, "住民税控除額")
  };
}

type Cell = string | number | null;

function cellValue(value: ExcelJS.CellValue): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "object" && "result" in value) {
    const result = (value as { result?: unknown }).result;
    return typeof result === "number" || typeof result === "string" ? result : null;
  }
  if (typeof value === "object" && "richText" in value) {
    return value.richText.map((part) => part.text).join("");
  }
  return null;
}

async function readRows(buffer: ArrayBuffer, sheetName?: string): Promise<Cell[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = sheetName ? workbook.getWorksheet(sheetName) : workbook.worksheets[0];
  if (!sheet) throw new Error(`シート ${sheetName ?? "(先頭)"} が見つかりません`);
  const rows: Cell[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    rows[rowNumber - 1] = values.map((value) => cellValue(value));
  });
  return Array.from(rows, (row) => row ?? []);
}

const text = (cell: Cell | undefined) =>
  cell === null || cell === undefined ? "" : String(cell).normalize("NFKC").replace(/\s+/g, "");
const number = (cell: Cell | undefined): number | null => {
  if (typeof cell === "number") return Number.isFinite(cell) ? cell : null;
  if (typeof cell === "string" && /^-?\d+(\.\d+)?$/.test(cell.trim())) return Number(cell.trim());
  return null;
};

/** 6桁の団体コード（検査数字つき）を、5桁の市区町村コードにする。都道府県（末尾が000）は null。 */
export function municipalityCode(cell: Cell | undefined): string | null {
  const digits = text(cell);
  if (!/^\d{5,6}$/.test(digits)) return null;
  const code = digits.padStart(6, "0").slice(0, 5);
  return code.endsWith("000") ? null : code;
}

/** 見出しの行から、指定した文字を含む列の位置を探す。見つからなければ止める。 */
function columnOf(rows: Cell[][], rowIndex: number, pattern: RegExp, from = 0): number {
  const row = rows[rowIndex] ?? [];
  const index = row.findIndex((cell, column) => column >= from && pattern.test(text(cell)));
  if (index < 0)
    throw new Error(
      `ふるさと納税の資料の見出し（${pattern.source}）が見つかりません。資料の形式が変わった可能性があります`
    );
  return index;
}

/** 「各自治体の受入額等」: 受入額（円）と募集に要した費用の合計（円）。 */
export function parseReceipts(rows: Cell[][]): {
  year: number;
  receipts: Map<string, number>;
  costs: Map<string, number>;
} {
  const headerRow = rows.findIndex((row) => /団体コード/.test(text(row[0])));
  if (headerRow < 0) throw new Error("受入額の資料に団体コードの列が見つかりません");
  const yearText = rows
    .slice(headerRow, headerRow + 3)
    .flat()
    .map(text)
    .find((cell) => eraYearToWestern(cell) !== null);
  const year = yearText ? eraYearToWestern(yearText) : null;
  if (year === null) throw new Error("受入額の資料から年度を読み取れません");

  // 見出しは複数行に分かれている。「件数・金額」の行で、最初の「金額」が受入額。
  const unitRow = rows.findIndex(
    (row, index) => index > headerRow && text(row[3]) === "件数" && text(row[4]) === "金額"
  );
  if (unitRow < 0) throw new Error("受入額の資料に「件数・金額」の見出しが見つかりません");
  const receiptsColumn = 4;
  const costHeaderRow = unitRow - 1;
  const costColumn = columnOf(rows, costHeaderRow, /^合計$/, 11);
  if (!/受入額に占める費用/.test(text(rows[headerRow + 1]?.[11]))) {
    throw new Error("受入額の資料の費用の見出しが想定と異なります");
  }

  const receipts = new Map<string, number>();
  const costs = new Map<string, number>();
  for (const row of rows.slice(unitRow + 1)) {
    const code = municipalityCode(row[0]);
    if (!code) continue;
    const received = number(row[receiptsColumn]);
    const cost = number(row[costColumn]);
    if (received !== null) receipts.set(code, received);
    if (cost !== null) costs.set(code, cost);
  }
  return { year, receipts, costs };
}

/** 「住民税控除額」: 都道府県等に対する寄附金（特例控除対象）の、市町村民税の控除額（円）。 */
export function parseDeductions(rows: Cell[][]): { year: number; deductions: Map<string, number> } {
  const titleText =
    rows
      .slice(0, 5)
      .flat()
      .map(text)
      .find((cell) => /年度課税/.test(cell)) ?? "";
  const yearMatch = /(令和)([0-9]+|元)年度課税/.exec(titleText);
  const year = yearMatch ? eraYearToWestern(`${yearMatch[1]}${yearMatch[2]}年度`) : null;
  if (year === null) throw new Error("住民税控除額の資料から課税年度を読み取れません");

  const groupRow = rows.findIndex((row) => /都道府県等に対する寄附金/.test(text(row[3])));
  if (groupRow < 0) throw new Error("住民税控除額の資料に「都道府県等に対する寄附金」の見出しが見つかりません");
  if (text(rows[groupRow + 1]?.[3]) !== "市町村民税" || !/^控除額/.test(text(rows[groupRow + 2]?.[5]))) {
    throw new Error("住民税控除額の資料の見出しが想定と異なります（市町村民税の控除額の列）");
  }

  const deductions = new Map<string, number>();
  for (const row of rows.slice(groupRow + 3)) {
    const code = municipalityCode(row[0]);
    const value = number(row[5]);
    if (code && value !== null) deductions.set(code, value);
  }
  return { year, deductions };
}

export async function fetchFurusato(
  fetchText: (url: string) => Promise<string>,
  fetchBinary: FetchBinary,
  log: (message: string) => void = () => {}
): Promise<FurusatoData> {
  log(`ふるさと納税の資料を探しています: ${FURUSATO_ARCHIVE_URL}`);
  const documents = findDocumentLinks(await fetchText(FURUSATO_ARCHIVE_URL));

  log(`  ${documents.receipts.title}`);
  const receipts = parseReceipts(await readRows(await fetchBinary(documents.receipts.url)));
  log(`  ${documents.deductions.title}`);
  const deductions = parseDeductions(await readRows(await fetchBinary(documents.deductions.url), "集計表"));
  log(
    `  受入額 ${receipts.receipts.size}団体（${receipts.year}年度）／控除額 ${deductions.deductions.size}団体（${deductions.year}年度課税）`
  );

  return {
    receiptsYear: receipts.year,
    deductionYear: deductions.year,
    receipts: receipts.receipts,
    costs: receipts.costs,
    deductions: deductions.deductions,
    documents: [documents.receipts, documents.deductions]
  };
}

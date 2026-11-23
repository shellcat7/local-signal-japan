import { describe, expect, it } from "vitest";
import { eraYearToWestern, findDocumentLinks, municipalityCode, parseDeductions, parseReceipts } from "./furusato";

describe("eraYearToWestern", () => {
  it("和暦の年度（全角数字・元年を含む）を西暦にする", () => {
    expect(eraYearToWestern("令和７年度")).toBe(2025);
    expect(eraYearToWestern("令和元年度")).toBe(2019);
    expect(eraYearToWestern("平成20年度")).toBe(2008);
    expect(eraYearToWestern("2025年度")).toBeNull();
  });
});

describe("municipalityCode", () => {
  it("6桁の団体コードを5桁の市区町村コードにし、都道府県は除く", () => {
    expect(municipalityCode("272132")).toBe("27213");
    expect(municipalityCode("11002")).toBe("01100");
    expect(municipalityCode(16683)).toBe("01668");
    expect(municipalityCode("010006")).toBeNull();
    expect(municipalityCode("合計")).toBeNull();
  });
});

describe("findDocumentLinks", () => {
  it("案内ページから、受入額と住民税控除額の資料のリンクを探す", () => {
    const html = `
      <a href="/main_content/001.pdf">令和8年度調査結果（概要）</a>
      <a href="/main_content/002.xlsx">各自治体の令和7年度受入額等</a>
      <a href="/main_content/003.xlsx">各自治体のふるさと納税受入額及び受入件数（平成20年度～令和7年度）</a>
      <a href="/main_content/004.xlsx">各自治体の令和8年度課税における<br>住民税控除額等</a>`;
    const links = findDocumentLinks(html);
    expect(links.receipts.url).toBe("https://www.soumu.go.jp/main_content/002.xlsx");
    expect(links.deductions).toEqual({
      title: "各自治体の令和8年度課税における住民税控除額等",
      publisher: "総務省",
      url: "https://www.soumu.go.jp/main_content/004.xlsx"
    });
  });

  it("リンクが見つからなければ止める", () => {
    expect(() => findDocumentLinks("<p>なし</p>")).toThrow("見つかりません");
  });
});

describe("parseReceipts", () => {
  const header = (cells: Array<string | number | null>) => cells;
  const rows = [
    header(["［留意事項］"]),
    header(["市区町村\n団体コード", "都道府県", "市区町村", "＜Ⅰ.受入件数及び受入額の実績について＞"]),
    header([
      null,
      null,
      null,
      "令和７年度のふるさと納税の受入額の実績について",
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      "令和７年度のふるさと納税の受入額に占める費用"
    ]),
    header([
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      "返礼品等の調達に係る費用",
      "返礼品等の送付に係る費用",
      "その他",
      "合計"
    ]),
    header([null, null, null, "件数", "金額", "件数", "金額"]),
    header(["010006", "北海道", "0", 10, 2_000_000]),
    header([
      "016683",
      "北海道",
      "白糠町",
      100,
      22_329_453_385,
      null,
      null,
      null,
      null,
      null,
      null,
      1,
      2,
      3,
      11_088_172_596
    ]),
    header([
      "272132",
      "大阪府",
      "泉佐野市",
      100,
      23_038_604_299,
      null,
      null,
      null,
      null,
      null,
      null,
      1,
      2,
      3,
      11_000_000_000
    ])
  ];

  it("年度、受入額（円）、費用の合計（円）を市区町村コードで読む", () => {
    const result = parseReceipts(rows);
    expect(result.year).toBe(2025);
    expect([...result.receipts]).toEqual([
      ["01668", 22_329_453_385],
      ["27213", 23_038_604_299]
    ]);
    expect(result.costs.get("01668")).toBe(11_088_172_596);
  });

  it("見出しの形が変わっていたら止める", () => {
    expect(() => parseReceipts(rows.map((row, index) => (index === 4 ? ["", "", "", "件数", "寄附額"] : row)))).toThrow(
      "件数・金額"
    );
  });
});

describe("parseDeductions", () => {
  const rows = [
    [null],
    ["令和８年度課税におけるふるさと納税に係る寄附金税額控除の適用状況"],
    ["団体コード", "都道府県", "市区町村", "＜Ⅰ.寄附金税額控除額等＞"],
    [null, null, null, "都道府県等に対する寄附金（特例控除対象）"],
    [null, null, null, "市町村民税"],
    [null, null, null, "人数\n（人）", "寄附金額\n（円）", "控除額\n（円）"],
    [141003, "神奈川県", "横浜市", 300_000, 90_000_000_000, 36_090_000_000],
    [11002, "北海道", "札幌市", 186_658, 17_501_612_797, 10_685_592_677]
  ];

  it("課税年度と、市町村民税の控除額（円）を読む", () => {
    const result = parseDeductions(rows);
    expect(result.year).toBe(2026);
    expect(result.deductions.get("14100")).toBe(36_090_000_000);
    expect(result.deductions.get("01100")).toBe(10_685_592_677);
  });

  it("控除額の列が見つからなければ止める", () => {
    expect(() =>
      parseDeductions(rows.map((row, index) => (index === 4 ? [null, null, null, "道府県民税"] : row)))
    ).toThrow("想定と異なります");
  });
});

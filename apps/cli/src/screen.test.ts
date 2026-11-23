import { describe, expect, it } from "vitest";
import { INDICATOR_KEYS, metricPeriodText, rankNational, type NationalRow } from "@local-signal-japan/core";
import { readManifest } from "@local-signal-japan/dataset";
import { CliError } from "./errors";
import {
  buildFilters,
  DEFAULT_SCREEN_LIMIT,
  displayWidth,
  parseCondition,
  parseScreenArgs,
  renderScreenCsv,
  renderScreenJson,
  renderScreenText,
  resolvePrefecture,
  runScreen,
  toReadableJson,
  type ScreenArgs,
  type ScreenResult
} from "./screen";

const prefectures = [
  { code: "01", name: "北海道" },
  { code: "13", name: "東京都" },
  { code: "14", name: "神奈川県" },
  { code: "26", name: "京都府" }
];

/** 架空の市区町村。values は 人口・高齢化・転入転出・事業所・雇用・所得・財政 の順。補助スコアは一律50にする。 */
function row(
  code: string,
  population: number | null,
  values: Array<number | null>,
  extra: Partial<NationalRow> = {}
): NationalRow {
  return {
    code,
    name: `見本${code}`,
    prefCode: code.slice(0, 2),
    kind: "city",
    population,
    values,
    scores: values.map((value) => (value === null ? null : 50)),
    ...extra
  };
}

const rows = [
  row("13201", 500_000, [2.5, 22, 0.4, 60, 3.1, 520, 1.1]),
  row("13202", 80_000, [-1.2, 28, 0.1, 45, 3.6, 410, 0.9]),
  row("13101", 60_000, [4.4, 16, -0.1, 530, 1.9, 1100, null], { kind: "special-ward" }),
  row("14201", 8_000, [-6.5, 41, -0.8, 38, 4.2, 300, 0.3]),
  row("14202", 30_000, [-1.2, 35, -0.3, 41, 3.9, 330, 0.6]),
  row("14117", 300_000, [0.5, 24, 0.2, 25, 3, null, null], { kind: "ward", parentName: "横浜市" }),
  row("26201", 20_000, [-9.9, 44, -1.1, 50, null, 280, 0.2])
];

describe("parseCondition", () => {
  it("指標キー・演算子・数値を読み取る", () => {
    expect(parseCondition("aging>=30")).toEqual({ key: "aging", op: ">=", value: 30 });
    expect(parseCondition(" income <= 350.5 ")).toEqual({ key: "income", op: "<=", value: 350.5 });
    expect(parseCondition("population>=-1.5")).toEqual({ key: "population", op: ">=", value: -1.5 });
    expect(parseCondition("FISCAL<=.8")).toEqual({ key: "fiscal", op: "<=", value: 0.8 });
  });

  it("全角の文字や、不等号・負号の別の書き方も受け付ける", () => {
    expect(parseCondition("ａｇｉｎｇ＞＝３０")).toEqual({ key: "aging", op: ">=", value: 30 });
    expect(parseCondition("aging≧30")).toEqual({ key: "aging", op: ">=", value: 30 });
    expect(parseCondition("population≦\u22122")).toEqual({ key: "population", op: "<=", value: -2 });
  });

  it("知らない指標キーは、使えるキーを添えて断る", () => {
    expect(() => parseCondition("density>=1")).toThrow(CliError);
    expect(() => parseCondition("density>=1")).toThrow(/指標キーが不明です: density[\s\S]*aging（高齢化率/);
    expect(() => parseCondition("高齢化率>=30")).toThrow(/指標キーが不明です/);
  });

  it(">= と <= 以外の演算子は断る", () => {
    for (const expression of ["aging>30", "aging<30", "aging=30", "aging==30", "aging=>30", "aging!=30"]) {
      expect(() => parseCondition(expression), expression).toThrow(/演算子は >=（以上）と <=（以下）だけ/);
    }
  });

  it("数値でない値は断る", () => {
    for (const expression of ["aging>=high", "aging>=30%", "aging>=", "income>=1,000", "aging>=30 40", "aging>=1e2"]) {
      expect(() => parseCondition(expression), expression).toThrow(/数値ではありません/);
    }
  });

  it("形になっていない条件は断る", () => {
    for (const expression of ["aging", ">=30", "", "30"]) {
      expect(() => parseCondition(expression), expression).toThrow(/の形で指定してください/);
    }
  });
});

describe("buildFilters", () => {
  it("同じ指標の条件を1つの範囲にまとめる", () => {
    expect(buildFilters(["aging>=30", "income>=400", "aging<=40"].map(parseCondition))).toEqual({
      aging: { min: 30, max: 40 },
      income: { min: 400 }
    });
  });

  it("同じ向きの条件が重なったら、厳しいほうを残す", () => {
    expect(buildFilters(["aging>=30", "aging>=35", "aging<=50", "aging<=45"].map(parseCondition))).toEqual({
      aging: { min: 35, max: 45 }
    });
  });

  it("下限が上限を超える条件は断る", () => {
    expect(() => buildFilters(["aging>=40", "aging<=30"].map(parseCondition))).toThrow(/条件が両立しません: 高齢化率/);
    expect(buildFilters(["aging>=30", "aging<=30"].map(parseCondition))).toEqual({ aging: { min: 30, max: 30 } });
  });
});

describe("resolvePrefecture", () => {
  it("都道府県名・「都府県」を省いた名前・コードのどれでも決まる", () => {
    expect(resolvePrefecture(prefectures, "東京都")).toEqual({ code: "13", name: "東京都" });
    expect(resolvePrefecture(prefectures, "東京")).toEqual({ code: "13", name: "東京都" });
    expect(resolvePrefecture(prefectures, "京都")).toEqual({ code: "26", name: "京都府" });
    expect(resolvePrefecture(prefectures, "北海道")).toEqual({ code: "01", name: "北海道" });
    expect(resolvePrefecture(prefectures, "13")).toEqual({ code: "13", name: "東京都" });
    expect(resolvePrefecture(prefectures, "１")).toEqual({ code: "01", name: "北海道" });
  });

  it("見つからなければ断る", () => {
    expect(() => resolvePrefecture(prefectures, "江戸")).toThrow(/都道府県が見つかりません/);
    expect(() => resolvePrefecture(prefectures, "99")).toThrow(CliError);
  });
});

describe("parseScreenArgs", () => {
  it("何も指定しなければ、全国を人口の大きい順に20件", () => {
    expect(parseScreenArgs({}, prefectures)).toEqual({
      filters: {},
      metric: "residents",
      order: "desc",
      pref: null,
      size: "all",
      limit: DEFAULT_SCREEN_LIMIT
    });
  });

  it("指定をまとめて読み取る", () => {
    const args: ScreenArgs = {
      where: ["aging<=25", "income>=400"],
      sort: "income",
      order: "asc",
      pref: "神奈川県",
      size: "50k-200k",
      limit: "0"
    };
    expect(parseScreenArgs(args, prefectures)).toEqual({
      filters: { aging: { max: 25 }, income: { min: 400 } },
      metric: "income",
      order: "asc",
      pref: { code: "14", name: "神奈川県" },
      size: "50k-200k",
      limit: 0
    });
    expect(parseScreenArgs({ sort: "overall" }, prefectures).metric).toBe("overall");
  });

  it("並べ替え・並び順・人口規模・件数の誤りを断る", () => {
    expect(() => parseScreenArgs({ sort: "score" }, prefectures)).toThrow(/--sort には residents（人口）、overall/);
    expect(() => parseScreenArgs({ order: "up" }, prefectures)).toThrow(/--order には desc/);
    expect(() => parseScreenArgs({ size: "big" }, prefectures)).toThrow(/--size には all \| under-10k/);
    expect(() => parseScreenArgs({ limit: "-1" }, prefectures)).toThrow(/--limit には0以上の整数/);
    expect(() => parseScreenArgs({ limit: "ten" }, prefectures)).toThrow(CliError);
  });
});

describe("runScreen", async () => {
  const manifest = await readManifest();
  const screen = (args: ScreenArgs) => runScreen(rows, manifest, prefectures, parseScreenArgs(args, prefectures));
  const ranks = (result: ScreenResult) => result.rows.map((entry) => [entry.code, entry.rank, entry.sortValue]);

  it("条件に合う市区町村を core の rankNational と同じ順・同じ順位で返す", () => {
    const result = screen({ where: ["population>=-2", "aging<=35"], sort: "population" });
    const ranked = rankNational(rows, {
      metric: "population",
      order: "desc",
      filters: { population: { min: -2 }, aging: { max: 35 } }
    });

    expect(ranks(result)).toEqual(ranked.map((entry) => [entry.row.code, entry.rank, entry.value]));
    // 同じ値（-1.2）は同順位になる。
    expect(ranks(result)).toEqual([
      ["13101", 1, 4.4],
      ["13201", 2, 2.5],
      ["13202", 3, -1.2],
      ["14202", 3, -1.2]
    ]);
    expect(result).toMatchObject({ total: 6, matched: 4, ranked: 4, returned: 4, truncated: false });
  });

  it("対象は政令指定都市の区を除き、都道府県と人口規模で絞ったあとの数になる", () => {
    expect(screen({}).total).toBe(6);
    expect(screen({ pref: "神奈川" })).toMatchObject({ total: 2, matched: 2 });
    expect(screen({ pref: "14", size: "10k-50k", where: ["aging>=40"] })).toMatchObject({ total: 1, matched: 0 });
    expect(screen({}).rows.map((entry) => entry.code)).not.toContain("14117");
  });

  it("並べ替えに使う値が欠損でも、条件に合う市区町村は順位なしで末尾に残す", () => {
    const result = screen({ where: ["income>=500"], sort: "fiscal" });
    expect(ranks(result)).toEqual([
      ["13201", 1, 1.1],
      ["13101", null, null]
    ]);
    expect(result).toMatchObject({ matched: 2, ranked: 1 });
    expect(renderScreenText(result)).toContain(
      "該当 2市区町村／対象 6市区町村（うち1件は財政力指数が欠損のため順位なし）"
    );
  });

  it("条件を付けた指標が欠損の市区町村は該当にしない", () => {
    expect(screen({ where: ["employment>=0"] }).rows.map((entry) => entry.code)).not.toContain("26201");
    expect(screen({ where: ["employment>=0"] }).matched).toBe(5);
  });

  it("--limit は出力する件数だけを減らし、該当数は変えない", () => {
    const result = screen({ limit: "2" });
    expect(result).toMatchObject({ matched: 6, returned: 2, truncated: true });
    expect(result.rows.map((entry) => entry.code)).toEqual(["13201", "13202"]);
    expect(renderScreenText(result)).toContain("先頭の2件を出力。すべて出すには --limit 0");
    expect(screen({ limit: "0" })).toMatchObject({ returned: 6, truncated: false });
  });

  it("JSONには条件・該当数・各行・指標の基準時点・出典が入る", () => {
    const result = screen({ where: ["aging>=20", "aging<=30"], pref: "東京", sort: "overall", order: "asc" });
    const parsed = JSON.parse(renderScreenJson(result)) as ScreenResult;

    expect(parsed).toEqual(result);
    expect(parsed.conditions).toEqual({
      where: ["aging>=20", "aging<=30"],
      filters: { aging: { min: 20, max: 30 } },
      sort: "overall",
      order: "asc",
      pref: { code: "13", name: "東京都" },
      size: "all",
      limit: DEFAULT_SCREEN_LIMIT,
      text: "高齢化率 20%以上30%以下 / 都道府県 東京都 / 並び順 総合補助スコアの小さい順"
    });
    expect(parsed.rows[0]).toEqual({
      rank: 1,
      sortValue: 50,
      code: "13201",
      name: "見本13201",
      prefCode: "13",
      prefName: "東京都",
      kind: "city",
      population: 500_000,
      overallScore: 50,
      values: { population: 2.5, aging: 22, migration: 0.4, business: 60, employment: 3.1, income: 520, fiscal: 1.1 },
      scores: { population: 50, aging: 50, migration: 50, business: 50, employment: 50, income: 50, fiscal: 50 }
    });
    for (const key of INDICATOR_KEYS) {
      expect(parsed.indicators[key].period).toBe(metricPeriodText(key, manifest.indicators[key].year));
      expect(parsed.indicators[key].statName).not.toBe("");
    }
    expect(parsed.source).toEqual({ ...manifest.source, fetchedAt: manifest.generatedAt });
    // 全件を出しても読める長さになるよう、1市区町村を1行に収める。
    expect(
      renderScreenJson(result)
        .split("\n")
        .filter((line) => line.includes('"rank"'))
    ).toHaveLength(2);
  });

  it("表には条件・該当数・単位つきの値・基準時点・出典を出す", () => {
    const text = renderScreenText(screen({ where: ["population<=-1"], sort: "population", order: "asc" }));
    const lines = text.split("\n");

    expect(lines[0]).toBe("条件: 人口増減率 \u22121%以下 / 並び順 人口増減率の小さい順");
    expect(lines[1]).toBe("該当 4市区町村／対象 6市区町村");
    // 並べ替えに使った値の列が【】付きで先頭に来る。負の数は負号（U+2212）で書く。
    expect(lines[3]).toMatch(/^順位 +コード +市区町村 +都道府県 +【人口増減率】 +高齢化率 .* 財政力指数 +人口$/);
    expect(lines[5]).toMatch(
      /^ +1 +26201 +見本26201 +京都府 +\u22129\.9% +44\.0% +\u22121\.10% +50\.0事業所 +欠損 +280\.0万円 +0\.20 +20,000人$/
    );
    // 全角文字を2桁ぶんに数えて、列の右端をそろえる。
    expect(new Set(lines.slice(3, 9).map(displayWidth)).size).toBe(1);

    for (const key of INDICATOR_KEYS) {
      expect(text).toContain(`: ${metricPeriodText(key, manifest.indicators[key].year)}（`);
    }
    expect(text).toContain(`出典: ${manifest.source.attribution}（取得日 `);
    expect(text).toContain(manifest.source.credit);
    expect(renderScreenText(screen({ where: ["aging>=90"] }))).toContain("条件に合う市区町村はありません。");
  });

  it("CSVはBOM付きで、見出しに単位と基準時点が入り、値は単位なしの数値になる", () => {
    const csv = renderScreenCsv(screen({ where: ["population<=-5"], sort: "population", order: "asc" }));
    const lines = csv.split("\r\n");

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain("順位,市区町村コード,都道府県,市区町村,区分,人口（人、");
    expect(lines[0]).toContain(`高齢化率（%、${metricPeriodText("aging", manifest.indicators.aging.year)}）`);
    expect(lines[0]).toContain(`財政力指数（${metricPeriodText("fiscal", manifest.indicators.fiscal.year)}）`);
    // 欠損（完全失業率）は空欄にする。0 や「欠損」の文字は入れない。
    expect(lines[1]).toBe("1,26201,京都府,見本26201,市,20000,50,-9.9,44,-1.1,50,,280,0.2");
    expect(lines[2]).toBe("2,14201,神奈川県,見本14201,市,8000,50,-6.5,41,-0.8,38,4.2,300,0.3");
  });
});

describe("toReadableJson", () => {
  it("指定した深さまでを改行し、それより深い値は1行に収める", () => {
    const value = { a: 1, list: [{ x: 1, y: [1, 2] }, { x: 2 }], empty: [], none: null, skipped: undefined };
    expect(toReadableJson(value)).toBe(
      [
        "{",
        '  "a": 1,',
        '  "list": [',
        '    {"x":1,"y":[1,2]},',
        '    {"x":2}',
        "  ],",
        '  "empty": [],',
        '  "none": null',
        "}"
      ].join("\n")
    );
    expect(JSON.parse(toReadableJson(value, 5))).toEqual({
      a: 1,
      list: [{ x: 1, y: [1, 2] }, { x: 2 }],
      empty: [],
      none: null
    });
  });
});

describe("displayWidth", () => {
  it("全角文字を2桁ぶん、半角文字と負号を1桁ぶんに数える", () => {
    expect(displayWidth("abc-1.5%")).toBe(8);
    expect(displayWidth("千代田区")).toBe(8);
    expect(displayWidth("【高齢化率】")).toBe(12);
    expect(displayWidth("\u22126.4%")).toBe(5);
  });
});

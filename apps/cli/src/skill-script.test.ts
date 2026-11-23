import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  areaLocalName,
  areaSeries,
  buildAreaView,
  computeChange,
  FACT_GROUPS,
  FACT_KEYS,
  FACTS,
  findHighlights,
  formatFact,
  formatNumber,
  INDICATOR_KEYS,
  INDICATORS,
  metricPeriodText,
  rankNational,
  rowMetricValue,
  rowValue,
  searchAreas,
  TOPICS,
  unrankedNational,
  type FactKey,
  type Highlight,
  type IndicatorKey,
  type RankingOptions,
  type Topic
} from "@local-signal-japan/core";
import { DATASET_DIR, readArea, readAreaIndex, readManifest, readNational } from "@local-signal-japan/dataset";
import {
  parseScreenArgs,
  renderScreenCsv,
  renderScreenText,
  runScreen,
  type ScreenArgs,
  type ScreenResult
} from "./screen";
import { renderTopicCsv, renderTopicText, resolveTopic, runTopic } from "./topics";

/**
 * エージェント向けスキルに同梱している単体スクリプト（skills/local-signal-japan/scripts/lsj.mjs）の検査。
 * スクリプトは持ち出して使えるよう core を import していないので、指標とくらしの指標の定義・並べ替え・
 * 全国で目立つところ・特集・検索の規則が core と食い違っていないことを、同梱データセットに対する実行結果で確かめる。
 */
const SCRIPT = fileURLToPath(new URL("../../../skills/local-signal-japan/scripts/lsj.mjs", import.meta.url));

// 1つのテストでスクリプトを何度か起動するので、遅い環境でも時間切れにならないようにする。
vi.setConfig({ testTimeout: 30_000 });

type Run = { code: number; stdout: string; stderr: string };

function lsj(args: readonly string[], data: string | null = DATASET_DIR): Promise<Run> {
  const env = { ...process.env, ...(data === null ? {} : { LSJ_DATA: data }) };
  return new Promise((resolve) => {
    execFile(process.execPath, [SCRIPT, ...args], { env, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ code: error === null ? 0 : typeof error.code === "number" ? error.code : 1, stdout, stderr });
    });
  });
}

/** 成功した実行のJSON出力。 */
async function lsjJson<T>(args: readonly string[], data?: string): Promise<T> {
  const run = await lsj(args, data);
  expect(run.stderr).toBe("");
  expect(run.code).toBe(0);
  return JSON.parse(run.stdout) as T;
}

type ScriptError = {
  error: { code: string; message: string; candidates?: Array<{ code: string; name: string; prefName: string }> };
};

/** 失敗した実行が標準エラー出力に書いたJSON。標準出力には何も書かない。 */
async function lsjError(args: readonly string[], data?: string): Promise<ScriptError["error"]> {
  const run = await lsj(args, data);
  expect(run.code).toBe(1);
  expect(run.stdout).toBe("");
  return (JSON.parse(run.stderr) as ScriptError).error;
}

type Source = {
  attribution: string;
  credit: string;
  license: string;
  fetchedAt: string;
  fetchedDate: string;
  attributions: string[];
  citation: string[];
  additionalSources: Array<{ id: string; attribution: string }>;
  periods: Record<IndicatorKey | FactKey, string>;
};
type ScreenJson = Omit<ScreenResult, "source" | "additionalSources"> & { source: Source };
type TopicJson = ScreenJson & { topic: Topic };
type ShownFact = {
  label: string;
  group: string;
  value: number | null;
  unit: string;
  valueText: string | null;
  period: string;
  statName: string;
  provider: string;
  rank: number | null;
  rankTotal: number;
  median: number;
  medianText: string;
  smallAreaCaution: boolean;
  basis: Record<string, { label: string; unit: string; value: number; valueText: string }>;
  missing?: { text: string };
  notes: string[];
};
type SearchJson = { count: number; results: Array<{ code: string; name: string; prefName: string }>; source: Source };
type ShownIndicator = {
  metricLabel: string;
  value: number | null;
  unit: string;
  period: string;
  statName: string;
  score: number | null;
  rank: number | null;
  rankTotal: number;
  median: number;
  missing?: { reason: string; text: string };
  change: { label: string; value: number; unit: string } | null;
  facts: Array<{ label: string; value: number; unit: string; period: string }>;
  sources: Array<{ name: string; statName: string; code: string; url: string }>;
};
type ShowJson = {
  area: { code: string; name: string; prefName: string; kind: string; population: number | null };
  overallScore: number | null;
  coverage: { available: number; total: number };
  indicators: Record<IndicatorKey, ShownIndicator>;
  facts: Record<FactKey, ShownFact>;
  highlights: Highlight[];
  notes: string[];
  source: Source;
};
type CompareJson = {
  areas: Array<{
    code: string;
    name: string;
    population: number | null;
    overallScore: number | null;
    values: Record<IndicatorKey, number | null>;
    scores: Record<IndicatorKey, number | null>;
    ranks: Record<IndicatorKey, number | null>;
    missing: Partial<Record<IndicatorKey, string>>;
    facts: Record<FactKey, number | null>;
    factRanks: Record<FactKey, number | null>;
    moneyTexts: Partial<Record<FactKey, string | null>>;
  }>;
  indicators: Record<IndicatorKey, { metricLabel: string; unit: string; period: string }>;
  facts: Record<FactKey, { label: string; unit: string; period: string; rankTotal: number; median: number }>;
  source: Source;
};
type IndicatorsJson = {
  indicators: Record<IndicatorKey, unknown>;
  facts: Record<FactKey, Record<string, unknown>>;
  factGroups: unknown;
  counts: unknown;
  source: Source;
};

/** 「68,835人」「\u22120.14%」のような表示用の文字列から数値を取り出す。 */
function numberIn(text: string): number {
  return Number(text.replace(/[^\d.+\u2212-]/g, "").replace("\u2212", "-"));
}

describe("スキル同梱スクリプト lsj.mjs", async () => {
  const [manifest, index, national] = await Promise.all([readManifest(), readAreaIndex(), readNational()]);
  const cliScreen = (args: ScreenArgs) =>
    runScreen(national.areas, manifest, index.prefectures, parseScreenArgs(args, index.prefectures));
  const furusato = manifest.additionalSources.find((source) => source.id === "furusato");
  if (!furusato) throw new Error("データセットにふるさと納税の出典がありません");

  /** 出典には、統計ダッシュボードの出典とクレジットを常に、ふるさと納税の値があれば総務省の出典も入れる。 */
  function expectSource(source: Source, { furusato: withFurusato = true } = {}) {
    expect(source).toMatchObject({
      attribution: manifest.source.attribution,
      credit: manifest.source.credit,
      license: manifest.source.license,
      fetchedAt: manifest.generatedAt
    });
    expect(source.attributions).toEqual([
      manifest.source.attribution,
      ...(withFurusato ? [furusato?.attribution] : [])
    ]);
    expect(source.citation).toEqual([
      `出典: ${manifest.source.attribution}（データ取得日: ${source.fetchedDate}）`,
      ...(withFurusato ? [`出典: ${furusato?.attribution}`] : []),
      manifest.source.credit
    ]);
    expect(source.additionalSources.map((item) => item.id)).toEqual(withFurusato ? ["furusato"] : []);
    for (const key of INDICATOR_KEYS) {
      expect(source.periods[key]).toBe(metricPeriodText(key, manifest.indicators[key].year));
    }
    for (const key of FACT_KEYS) {
      expect(source.periods[key]).toBe(manifest.facts[key].period);
    }
  }

  describe("screen", () => {
    const cases: Array<{ name: string; args: string[]; cli: ScreenArgs; options: RankingOptions }> = [
      {
        name: "条件なし（既定は人口の大きい順）",
        args: [],
        cli: {},
        options: { metric: "residents", order: "desc" }
      },
      {
        name: "両端のある範囲と下限を組み合わせる",
        args: ["--where", "aging>=30", "--where", "aging<=35", "--where", "income>=350", "--sort", "overall"],
        cli: { where: ["aging>=30", "aging<=35", "income>=350"], sort: "overall" },
        options: { metric: "overall", order: "desc", filters: { aging: { min: 30, max: 35 }, income: { min: 350 } } }
      },
      {
        name: "都道府県で絞り、小さい順に並べる",
        args: ["--pref", "東京都", "--sort", "income", "--order", "asc"],
        cli: { pref: "東京都", sort: "income", order: "asc" },
        options: { metric: "income", order: "asc", prefCode: "13" }
      },
      {
        name: "人口規模で絞り、負の下限を付ける",
        args: ["--size", "under-10k", "--where", "population>=-3", "--sort", "population"],
        cli: { size: "under-10k", where: ["population>=-3"], sort: "population" },
        options: {
          metric: "population",
          order: "desc",
          populationBand: "under-10k",
          filters: { population: { min: -3 } }
        }
      },
      {
        name: "都道府県コード・人口規模・範囲・小さい順をすべて組み合わせる",
        args: [
          "--pref=23",
          "--size=50k-200k",
          "--where=fiscal>=0.9",
          "--where=fiscal<=1.3",
          "--sort=fiscal",
          "--order=asc"
        ],
        cli: { pref: "23", size: "50k-200k", where: ["fiscal>=0.9", "fiscal<=1.3"], sort: "fiscal", order: "asc" },
        options: {
          metric: "fiscal",
          order: "asc",
          prefCode: "23",
          populationBand: "50k-200k",
          filters: { fiscal: { min: 0.9, max: 1.3 } }
        }
      },
      {
        name: "くらしの指標（金額）で並べ替え、くらしの指標の範囲で絞り、人口1万人以上に限る",
        args: [
          "--sort",
          "furusatoReceipts",
          "--where",
          "vacancy<=20",
          "--where",
          "furusatoCostShare>=40",
          "--size",
          "over-10k"
        ],
        cli: { sort: "furusatoReceipts", where: ["vacancy<=20", "furusatoCostShare>=40"], size: "over-10k" },
        options: {
          metric: "furusatoReceipts",
          order: "desc",
          populationBand: "over-10k",
          filters: { vacancy: { max: 20 }, furusatoCostShare: { min: 40 } }
        }
      },
      {
        name: "7指標の条件と、くらしの指標の負の値の条件を組み合わせ、小さい順に並べる",
        args: ["--where", "aging>=35", "--where", "projection2050<=-40", "--sort", "lifeMale", "--order", "asc"],
        cli: { where: ["aging>=35", "projection2050<=-40"], sort: "lifeMale", order: "asc" },
        options: {
          metric: "lifeMale",
          order: "asc",
          filters: { aging: { min: 35 }, projection2050: { max: -40 } }
        }
      }
    ];

    it.each(cases)(
      "$name: core の rankNational と同じ市区町村・順・順位・該当数になる",
      async ({ args, cli, options }) => {
        const result = await lsjJson<ScreenJson>(["screen", ...args, "--limit", "0"]);
        const ranked = rankNational(national.areas, options);
        // 並べ替えに使う値が欠損の市区町村は、順位なしで末尾に並ぶ。
        const unranked = unrankedNational(national.areas, options);
        const matched = ranked.length + unranked.length;

        // 条件が空振りして、比べるものがないまま通ることを防ぐ。
        expect(ranked.length).toBeGreaterThan(1);
        expect(result.rows.map((row) => [row.code, row.rank, row.sortValue])).toEqual([
          ...ranked.map((entry) => [entry.row.code, entry.rank, entry.value]),
          ...unranked.map((row) => [row.code, null, null])
        ]);
        expect(result).toMatchObject({ matched, ranked: ranked.length, returned: matched });
        expect(result.truncated).toBe(false);

        // CLI の screen とも、行の中身まで一致する。
        const expected = cliScreen({ ...cli, limit: "0" });
        expect(result.rows).toEqual(expected.rows);
        expect(result.total).toBe(expected.total);
        expect(result.conditions).toEqual(expected.conditions);
        expect(result.indicators).toEqual(expected.indicators);
        expect(result.facts).toEqual(expected.facts);
        expectSource(result.source);
      }
    );

    it("くらしの指標の値（金額は円の数値と読みやすい書き方）が、データセットと一致する", async () => {
      const result = await lsjJson<ScreenJson>(["screen", "--sort", "furusatoNet", "--order", "asc", "--limit", "30"]);
      for (const row of result.rows) {
        const stored = national.areas.find((area) => area.code === row.code);
        expect(Object.values(row.facts)).toEqual(stored?.facts);
        const net = row.facts.furusatoNet;
        expect(row.moneyTexts.furusatoNet).toBe(net === null ? null : formatFact(FACTS.furusatoNet, net));
      }
      // 受入額より控除額が大きい市区町村は負の値になり、読みやすい書き方では負号（U+2212）を使う。
      expect(result.rows[0]?.moneyTexts.furusatoNet).toMatch(/^\u2212/);
    });

    it("並べ替えに使う値が欠損でも、条件に合う市区町村は順位なしで末尾に残す", async () => {
      const result = await lsjJson<ScreenJson>([
        "screen",
        "--where",
        "income>=450",
        "--sort",
        "fiscal",
        "--limit",
        "0"
      ]);
      const ranked = rankNational(national.areas, {
        metric: "fiscal",
        order: "desc",
        filters: { income: { min: 450 } }
      });
      const meeting = national.areas.filter((row) => row.kind !== "ward" && (rowValue(row, "income") ?? 0) >= 450);
      const unranked = meeting.filter((row) => rowValue(row, "fiscal") === null).map((row) => row.code);

      // 財政力指数は特別区が欠損なので、所得の高い特別区がここに入る。
      expect(unranked.length).toBeGreaterThan(0);
      expect(result.matched).toBe(meeting.length);
      expect(result.ranked).toBe(ranked.length);
      expect(result.rows.slice(0, ranked.length).map((row) => [row.code, row.rank])).toEqual(
        ranked.map((entry) => [entry.row.code, entry.rank])
      );
      expect(result.rows.slice(ranked.length).map((row) => [row.code, row.rank, row.sortValue])).toEqual(
        unranked.sort().map((code) => [code, null, null])
      );
      expect(result.rows).toEqual(cliScreen({ where: ["income>=450"], sort: "fiscal", limit: "0" }).rows);
    });

    it("--limit は出力する件数だけを減らし、該当数と打ち切りの有無を示す", async () => {
      const result = await lsjJson<ScreenJson>(["screen", "--pref", "大阪", "--limit", "3"]);
      const ranked = rankNational(national.areas, { metric: "residents", order: "desc", prefCode: "27" });

      expect(result).toMatchObject({ matched: ranked.length, returned: 3, truncated: true });
      expect(result.rows.map((row) => row.code)).toEqual(ranked.slice(0, 3).map((entry) => entry.row.code));
      // 件数を指定しなければ20件。
      expect((await lsjJson<ScreenJson>(["screen"])).returned).toBe(20);
    });

    it("--text の表と --csv は、CLI の screen と同じ内容になる", async () => {
      const args = ["screen", "--where", "population<=-15", "--sort", "population", "--order", "asc", "--limit", "8"];
      const expected = cliScreen({ where: ["population<=-15"], sort: "population", order: "asc", limit: "8" });

      const text = await lsj([...args, "--text"]);
      expect(text.stdout).toBe(renderScreenText(expected));
      // 負の数は、表では負号（U+2212）で書く。
      expect(text.stdout).toContain("\u2212");
      expect(text.stdout).toContain(manifest.source.attribution);
      expect(text.stdout).toContain(manifest.source.credit);

      const csv = await lsj([...args, "--csv"]);
      expect(csv.stdout).toBe(renderScreenCsv(expected));
      expect(csv.stdout.startsWith("\uFEFF")).toBe(true);
      // CSVの数値は、表計算ソフトが数値として読めるASCIIの負号のままにする。
      expect(csv.stdout).not.toContain("\u2212");
      // CSVに入れられない条件・基準時点・出典は、標準エラー出力に示す。
      expect(csv.stderr).toContain(
        `該当 ${formatNumber(expected.matched)}市区町村／対象 ${formatNumber(expected.total)}市区町村`
      );
      expect(csv.stderr).toContain(manifest.source.attribution);
      // CSVにはふるさと納税の値の列も入るので、総務省の出典も示す。表は、ふるさと納税を使っていなければ示さない。
      expect(csv.stderr).toContain(furusato.attribution);
      expect(text.stdout).not.toContain(furusato.attribution);
    });

    it("くらしの指標で並べ替え・絞り込んだ --text の表と --csv も、CLI の screen と同じ内容になる", async () => {
      const cli: ScreenArgs = {
        where: ["furusatoPerCapita>=100000", "vacancy<=25"],
        sort: "furusatoOutflow",
        size: "over-10k",
        limit: "12"
      };
      const args = [
        "screen",
        "--where",
        "furusatoPerCapita>=100000",
        "--where",
        "vacancy<=25",
        "--sort",
        "furusatoOutflow",
        "--size",
        "over-10k",
        "--limit",
        "12"
      ];
      const expected = cliScreen(cli);
      expect(expected.matched).toBeGreaterThan(1);

      const text = await lsj([...args, "--text"]);
      expect(text.stdout).toBe(renderScreenText(expected));
      expect(text.stdout).toContain("【住民税の控除額】");
      expect(text.stdout).toContain(`出典: ${furusato.attribution}`);

      const csv = await lsj([...args, "--csv"]);
      expect(csv.stdout).toBe(renderScreenCsv(expected));
    });

    it("条件の誤りは、理由を示して終了コード1で断る", async () => {
      expect(await lsjError(["screen", "--where", "density>=1"])).toMatchObject({
        code: "usage",
        message: expect.stringContaining("条件の指標キーが不明です: density") as string
      });
      expect((await lsjError(["screen", "--where", "aging>30"])).message).toContain(
        "演算子は >=（以上）と <=（以下）だけ"
      );
      expect((await lsjError(["screen", "--where", "aging>=高い"])).message).toContain("数値ではありません");
      expect((await lsjError(["screen", "--where", "aging>=40", "--where", "aging<=30"])).message).toContain(
        "条件が両立しません"
      );
      expect((await lsjError(["screen", "--sort", "score"])).message).toContain("--sort には residents");
      expect((await lsjError(["screen", "--pref", "江戸"])).message).toContain("都道府県が見つかりません");
      expect((await lsjError(["screen", "--size", "big"])).message).toContain("--size には all | over-10k | under-10k");
      expect((await lsjError(["screen", "--limit", "-1"])).message).toContain("--limit には0以上の整数");

      const text = await lsj(["screen", "--where", "aging=30", "--text"]);
      expect(text).toMatchObject({ code: 1, stdout: "" });
      expect(text.stderr).toContain("演算子は >=（以上）と <=（以下）だけ");
    });
  });

  describe("show", () => {
    it("13101（千代田区）の値・補助スコア・順位が、データセットと一致する", async () => {
      const result = await lsjJson<ShowJson>(["show", "13101"]);
      const file = JSON.parse(await readFile(path.join(DATASET_DIR, "pref", "13.json"), "utf8")) as {
        areas: Array<{
          code: string;
          name: string;
          population: number;
          indicators: Record<IndicatorKey, { value: number | null; score: number | null; rank: number | null }>;
        }>;
      };
      const stored = file.areas.find((area) => area.code === "13101");
      if (!stored) throw new Error("データセットに 13101 がありません");

      expect(result.area).toMatchObject({ code: "13101", name: stored.name, prefName: "東京都", kind: "special-ward" });
      expect(result.area.population).toBe(stored.population);
      for (const key of INDICATOR_KEYS) {
        const { value, score, rank } = result.indicators[key];
        expect({ key, value, score, rank }).toEqual({
          key,
          value: stored.indicators[key].value,
          score: stored.indicators[key].score,
          rank: stored.indicators[key].rank
        });
        expect(result.indicators[key].rankTotal).toBe(manifest.indicators[key].distribution.count);
        expect(result.indicators[key].median).toBe(manifest.indicators[key].distribution.p50);
      }
      // 特別区の財政力指数は欠損。低い値としてではなく、理由つきの欠損として返す。
      expect(result.indicators.fiscal).toMatchObject({ value: null, score: null, rank: null });
      expect(result.indicators.fiscal.missing?.reason).toBe("not-published");
      expectSource(result.source);
    });

    it("13101（千代田区）のくらしの指標の値・基準時点・順位・もとの数が、データセットと core の定義に一致する", async () => {
      const result = await lsjJson<ShowJson>(["show", "13101"]);
      const area = await readArea("13101");
      if (!area) throw new Error("データセットに 13101 がありません");

      expect(Object.keys(result.facts)).toEqual([...FACT_KEYS]);
      for (const key of FACT_KEYS) {
        const definition = FACTS[key];
        const stored = area.facts[key];
        const meta = manifest.facts[key];
        expect(result.facts[key]).toMatchObject({
          label: definition.label,
          group: definition.group,
          unit: definition.unit,
          value: stored.value,
          valueText: stored.value === null ? null : formatFact(definition, stored.value),
          period: meta.period,
          provider: definition.provider,
          rank: stored.rank,
          rankTotal: meta.distribution.count,
          median: meta.distribution.p50,
          medianText: formatFact(definition, meta.distribution.p50),
          smallAreaCaution: definition.smallAreaCaution,
          notes: definition.notes
        });
        const basis = result.facts[key].basis;
        expect(Object.fromEntries(Object.entries(basis).map(([name, item]) => [name, item.value]))).toEqual(
          stored.basis
        );
        for (const [name, item] of Object.entries(basis)) {
          expect(item).toMatchObject(definition.basis[name] ?? {});
        }
        expect(result.facts[key].missing ?? null).toEqual(
          stored.value === null ? { text: "値が公表されていません" } : null
        );
      }
      // 金額は円の数値と、読みやすく書いた文字列の両方を返す。
      expect(result.facts.furusatoReceipts.value).toBe(area.facts.furusatoReceipts.value);
      expect(result.facts.furusatoReceipts.valueText).toMatch(/億円$/);
      expect(result.facts.furusatoNet.valueText).toMatch(/^\u2212/);
      expect(result.facts.furusatoReceipts.statName).toBe(furusato.name);
      expectSource(result.source);
    });

    // 門真市（自転車の割合が全国1位）、千代田区（特別区）、白糠町（人口1万人未満、ふるさと納税が上位）、
    // 歌志内市（人口が全国で最も少ない市の1つ）、政令指定都市、政令指定都市の区、
    // 七飯町（図書館の数が0で、同じ値の市区町村が多い）、羽幌町（鉄道・電車だけの割合が0%で、同じ値が多い）。
    it.each(["27223", "13101", "01668", "01227", "14100", "14117", "01337", "01484"])(
      "%s: 全国で目立つところが core の findHighlights と一致する",
      async (code) => {
        const result = await lsjJson<ShowJson>(["show", code]);
        const row = national.areas.find((candidate) => candidate.code === code);
        if (!row) throw new Error(`national.json に ${code} がありません`);

        expect(result.highlights).toEqual(findHighlights(row, national.areas, manifest));
        if (row.kind !== "ward" && !["01337", "01484"].includes(code)) {
          expect(result.highlights.length).toBeGreaterThan(0);
        }
      }
    );

    it("同じ値の市区町村も数に入れて、端から10以内に収まる指標だけを全国で目立つところにする", async () => {
      // 図書館の数が0の七飯町は、同じ0の市区町村が10を超えるので「最も少ない」とは言わない。
      const nanae = await lsjJson<ShowJson>(["show", "01337"]);
      expect(nanae.facts.libraries.value).toBe(0);
      expect(nanae.highlights.map((item) => item.key)).not.toContain("libraries");

      for (const code of ["27223", "01668", "01227", "01337", "01484"]) {
        const result = await lsjJson<ShowJson>(["show", code]);
        const target = national.areas.find((candidate) => candidate.code === code);
        if (!target) throw new Error(`national.json に ${code} がありません`);
        for (const item of result.highlights) {
          const values = national.areas
            .filter((row) => row.kind !== "ward" && (!item.limited || (row.population ?? 0) >= 10_000))
            .map((row) => rowMetricValue(row, item.key))
            .filter((value) => value !== null);
          const own = rowMetricValue(target, item.key) as number;
          const tiedOrBeyond = values.filter((value) => (item.side === "high" ? value >= own : value <= own));
          expect(tiedOrBeyond.length, `${code} ${item.key}`).toBeLessThanOrEqual(10);
          expect(item.total).toBe(values.length);
        }
      }
    });

    it("人口1万人未満の町では、人口の少ない市区町村で大きく動く指標を全国で目立つところに入れない", async () => {
      const result = await lsjJson<ShowJson>(["show", "01668"]);
      expect(result.area.population).toBeLessThan(10_000);
      for (const item of result.highlights) {
        expect(item.limited).toBe(false);
        expect(item.key).not.toBe("furusatoNet");
      }
      expect(result.highlights[0]).toMatchObject({ key: "furusatoPerCapita", rank: 1, phrase: "全国で最も多い" });

      const text = await lsj(["show", "01668", "--text"]);
      expect(text.stdout).toContain("全国で目立つところ");
      expect(text.stdout).toContain(`出典: ${furusato.attribution}`);
    });

    // 特別区、政令指定都市の区、政令指定都市、欠損のある町、一般の市。
    it.each(["13101", "01101", "14100", "07546", "34208"])(
      "%s: 基準時点・5年前比・関連する値・欠損理由・出典の系列が core の表示用データと一致する",
      async (code) => {
        const area = await readArea(code);
        if (!area) throw new Error(`データセットに ${code} がありません`);
        const view = buildAreaView(area, manifest);
        const result = await lsjJson<ShowJson>(["show", code]);

        expect(result.area.name).toBe(view.localName);
        expect(result.overallScore).toBe(view.overallScore);
        expect(result.coverage).toEqual(view.coverage);
        expect(result.notes).toHaveLength(area.kind === "ward" ? 1 : 0);

        for (const indicator of view.indicators) {
          const { key } = indicator;
          const shown = result.indicators[key];
          const change =
            indicator.value === null ? null : computeChange(key, areaSeries(area), manifest.indicators[key].year);

          expect(shown).toMatchObject({
            metricLabel: indicator.definition.metricLabel,
            value: indicator.value,
            unit: indicator.definition.unit,
            period: indicator.periodText,
            statName: [...new Set(indicator.sources.map((source) => source.statName))].join("・"),
            score: indicator.score,
            rank: indicator.rank,
            rankTotal: indicator.rankTotal
          });
          expect(shown.missing ?? null).toEqual(
            indicator.missingText === null
              ? null
              : { reason: area.indicators[key].missing, text: indicator.missingText }
          );
          expect(shown.change).toEqual(
            change === null ? null : { label: change.label, value: change.value, unit: change.unit }
          );
          expect(shown.facts.map((fact) => [fact.label, fact.value, fact.period])).toEqual(
            indicator.facts.map((fact) => [fact.label, numberIn(fact.value), fact.period])
          );
          expect(shown.sources).toEqual(
            indicator.sources.map(({ name, statName, code: seriesCode, url }) => ({
              name,
              statName,
              code: seriesCode,
              url
            }))
          );
        }
      }
    );

    it("同じ名前の市区町村が複数あるときは、推測せずに候補を返す", async () => {
      const error = await lsjError(["show", "府中市"]);
      expect(error.code).toBe("ambiguous");
      expect(error.candidates?.map((candidate) => [candidate.code, candidate.prefName, candidate.name])).toEqual([
        ["13206", "東京都", "府中市"],
        ["34208", "広島県", "府中市"]
      ]);

      // 都道府県名を付けるか、コードで指定すれば1つに決まる。
      expect((await lsjJson<ShowJson>(["show", "東京都府中市"])).area.code).toBe("13206");
      expect((await lsjJson<ShowJson>(["show", "広島県府中市"])).area.code).toBe("34208");
      expect((await lsjJson<ShowJson>(["show", "横浜市青葉区"])).area.code).toBe("14117");
      expect((await lsjJson<ShowJson>(["show", "鎌ヶ谷市"])).area.name).toBe("鎌ケ谷市");

      // 表で出力するときも、候補を並べて終了コード1で終わる。
      const text = await lsj(["show", "府中市", "--text"]);
      expect(text).toMatchObject({ code: 1, stdout: "" });
      expect(text.stderr).toContain("13206  東京都 府中市（市）");
      expect(text.stderr).toContain("34208  広島県 府中市（市）");
    });

    it("見つからない名前やコードは断る", async () => {
      expect((await lsjError(["show", "存在しない市"])).code).toBe("not-found");
      expect((await lsjError(["show", "99999"])).code).toBe("not-found");
      expect((await lsjError(["show"])).code).toBe("usage");
    });
  });

  describe("search", () => {
    it.each([
      "府中",
      "ふちゅう",
      "カマガヤ",
      "鎌ヶ谷",
      "ｻｯﾎﾟﾛ",
      "131",
      "13101",
      "東京都府中市",
      "神奈川県青葉区",
      "ちよだ"
    ])("「%s」の検索結果が core の searchAreas と同じ順になる", async (query) => {
      const result = await lsjJson<SearchJson>(["search", query, "--limit", "0"]);
      const expected = searchAreas(index, query, index.areas.length);

      expect(expected.length).toBeGreaterThan(0);
      expect(result.count).toBe(expected.length);
      expect(result.results.map((area) => [area.code, area.prefName, area.name])).toEqual(
        expected.map((area) => [area.code, area.prefName, areaLocalName(area)])
      );
      expectSource(result.source, { furusato: false });
    });
  });

  describe("compare", () => {
    it("2〜5つの市区町村の値・補助スコア・順位を、データセットどおりに並べる", async () => {
      const codes = ["13101", "14117", "07546"];
      const result = await lsjJson<CompareJson>(["compare", "千代田区", "横浜市青葉区", "07546"]);

      expect(result.areas.map((area) => area.code)).toEqual(codes);
      for (const shown of result.areas) {
        const area = await readArea(shown.code);
        if (!area) throw new Error(`データセットに ${shown.code} がありません`);
        const view = buildAreaView(area, manifest);

        expect(shown.population).toBe(area.population);
        expect(shown.overallScore).toBe(view.overallScore);
        for (const key of INDICATOR_KEYS) {
          expect([key, shown.values[key], shown.scores[key], shown.ranks[key]]).toEqual([
            key,
            area.indicators[key].value,
            area.indicators[key].score,
            area.indicators[key].rank
          ]);
        }
        expect(shown.missing).toEqual(
          Object.fromEntries(
            view.indicators.filter((item) => item.missingText !== null).map((item) => [item.key, item.missingText])
          )
        );
        for (const key of FACT_KEYS) {
          expect([key, shown.facts[key], shown.factRanks[key]]).toEqual([
            key,
            area.facts[key].value,
            area.facts[key].rank
          ]);
        }
      }
      for (const key of INDICATOR_KEYS) {
        expect(result.indicators[key]).toMatchObject({
          metricLabel: INDICATORS[key].metricLabel,
          unit: INDICATORS[key].unit,
          period: metricPeriodText(key, manifest.indicators[key].year)
        });
      }
      for (const key of FACT_KEYS) {
        expect(result.facts[key]).toMatchObject({
          label: FACTS[key].label,
          unit: FACTS[key].unit,
          period: manifest.facts[key].period,
          rankTotal: manifest.facts[key].distribution.count,
          median: manifest.facts[key].distribution.p50
        });
      }
      expectSource(result.source);
    });

    it("数が合わない指定、重複、あいまいな名前を断る", async () => {
      expect((await lsjError(["compare", "13101"])).code).toBe("usage");
      expect((await lsjError(["compare", "13101", "13102", "13103", "13104", "13105", "13106"])).code).toBe("usage");
      expect((await lsjError(["compare", "13101", "千代田区"])).message).toContain("同じ市区町村が2回");
      expect((await lsjError(["compare", "13101", "府中市"])).code).toBe("ambiguous");
    });
  });

  describe("indicators", () => {
    it("指標の定義・基準時点・全国の分布が、core の定義とデータセットに一致する", async () => {
      const result = await lsjJson<IndicatorsJson>(["indicators"]);

      expect(Object.keys(result.indicators)).toEqual([...INDICATOR_KEYS]);
      for (const key of INDICATOR_KEYS) {
        const definition = INDICATORS[key];
        const meta = manifest.indicators[key];
        const { count, min, p10, p25, p50, p75, p90, max } = meta.distribution;

        expect(result.indicators[key]).toEqual({
          label: definition.label,
          metricLabel: definition.metricLabel,
          unit: definition.unit,
          decimals: definition.decimals,
          period: metricPeriodText(key, meta.year),
          statName: [...new Set(meta.sources.map((source) => source.statName))].join("・"),
          summary: definition.summary,
          method: definition.method,
          scoreOrientation: definition.orientation,
          distribution: { count, min, p10, p25, median: p50, p75, p90, max },
          notes: definition.notes,
          sources: meta.sources.map(({ name, statName, code }) => ({ name, statName, code }))
        });
      }
      expect(result.counts).toEqual(manifest.counts);
      expectSource(result.source);
    });

    it("くらしの指標の定義が core の FACTS と、基準時点・分布・資料がデータセットと一致する", async () => {
      const result = await lsjJson<IndicatorsJson>(["indicators"]);

      expect(Object.keys(result.facts)).toEqual([...FACT_KEYS]);
      expect(result.factGroups).toEqual(FACT_GROUPS);
      for (const key of FACT_KEYS) {
        const definition = FACTS[key];
        const meta = manifest.facts[key];
        const { count, min, p10, p25, p50, p75, p90, max } = meta.distribution;

        expect(result.facts[key]).toMatchObject({
          group: definition.group,
          label: definition.label,
          columnLabel: definition.columnLabel,
          unit: definition.unit,
          decimals: definition.decimals,
          signed: definition.signed,
          words: definition.words,
          summary: definition.summary,
          method: definition.method,
          notes: definition.notes,
          smallAreaCaution: definition.smallAreaCaution,
          provider: definition.provider,
          basis: definition.basis,
          period: meta.period,
          distribution: { count, min, p10, p25, median: p50, p75, p90, max },
          medianText: formatFact(definition, p50),
          sources: meta.sources.map(({ name, statName, code }) => ({ name, statName, code })),
          documents: meta.documents
        });
      }
    });
  });

  describe("topics", () => {
    it("特集の定義が core の TOPICS と一致する", async () => {
      const result = await lsjJson<{ topics: Topic[]; source: Source }>(["topics"]);
      expect(result.topics).toEqual(TOPICS);
      // 一覧には値が入らないので、ふるさと納税の出典は入れない。
      expectSource(result.source, { furusato: false });
    });

    it.each(["half-by-2050", "marriage", "no-library", "furusato-receipts"])(
      "%s: core の rankNational と同じ市区町村・順・順位になり、CLI の topics と同じ内容になる",
      async (id) => {
        const topic = resolveTopic(id);
        const result = await lsjJson<TopicJson>(["topics", id, "--limit", "0"]);
        const options = {
          metric: topic.metric,
          order: topic.order,
          populationBand: topic.size,
          filters: topic.filters
        };
        const ranked = rankNational(national.areas, options);
        const unranked = unrankedNational(national.areas, options);

        expect(ranked.length).toBeGreaterThan(1);
        expect(result.topic).toEqual(topic);
        expect(result.rows.map((row) => [row.code, row.rank, row.sortValue])).toEqual([
          ...ranked.map((entry) => [entry.row.code, entry.rank, entry.value]),
          ...unranked.map((row) => [row.code, null, null])
        ]);

        const expected = runTopic(national.areas, manifest, index.prefectures, topic, { limit: "0" });
        expect(result.rows).toEqual(expected.rows);
        expect(result.conditions).toEqual(expected.conditions);
        expect(result.total).toBe(expected.total);
        expect(result.facts).toEqual(expected.facts);
        expectSource(result.source);
      }
    );

    it("--text と --csv は CLI の topics と同じ内容になり、件数の既定は20件", async () => {
      const topic = resolveTopic("furusato-outflow");
      const expected = runTopic(national.areas, manifest, index.prefectures, topic, { pref: "東京都" });
      expect(expected.returned).toBe(20);

      const text = await lsj(["topics", "furusato-outflow", "--pref", "東京都", "--text"]);
      expect(text.stdout).toBe(renderTopicText(expected));
      expect(text.stdout.startsWith(`${topic.title}\n${topic.lead}\n`)).toBe(true);
      expect(text.stdout).toContain(`出典: ${furusato.attribution}`);

      const csv = await lsj(["topics", "furusato-outflow", "--pref", "東京都", "--csv"]);
      expect(csv.stdout).toBe(renderTopicCsv(expected));
      expect(csv.stderr).toContain(topic.title);
      expect(csv.stderr).toContain(furusato.attribution);
    });

    it("知らない特集や、並べ方を変えるオプションは断る", async () => {
      const error = await lsjError(["topics", "best-towns"]);
      expect(error.code).toBe("not-found");
      expect(error.message).toContain("half-by-2050");
      expect((await lsjError(["topics", "bicycle", "--sort", "aging"])).message).toContain("--sort を使えません");
      expect((await lsjError(["topics", "--csv"])).message).toContain("--csv は screen と topics <特集id>");
    });
  });

  describe("データセットの場所", () => {
    let workDir = "";
    let baseUrl = "";
    const server = createServer((request, response) => {
      const file = /^\/data\/((?:pref\/)?[\w-]+\.json)$/.exec(request.url ?? "")?.[1];
      if (!file) {
        // 公開前のサイトのように、存在しないパスにHTMLを返す。
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end("<!doctype html><title>x</title>");
        return;
      }
      readFile(path.join(DATASET_DIR, file)).then(
        (body) => response.writeHead(200, { "content-type": "application/json" }).end(body),
        () => response.writeHead(404).end()
      );
    });

    beforeAll(async () => {
      workDir = await mkdtemp(path.join(tmpdir(), "lsj-test-"));
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    afterAll(async () => {
      await new Promise((resolve) => server.close(resolve));
      await rm(workDir, { recursive: true, force: true });
    });

    it("--data はフォルダでもURLでも指定でき、環境変数 LSJ_DATA より優先する", async () => {
      const viaUrl = await lsjJson<ShowJson>(["show", "千代田区", "--data", `${baseUrl}/data`], "/nonexistent");
      const viaFolder = await lsjJson<ShowJson>(["show", "千代田区", "--data", DATASET_DIR], "/nonexistent");
      const viaEnv = await lsjJson<ShowJson>(["show", "千代田区"], `${baseUrl}/data/`);

      expect(viaUrl.area.code).toBe("13101");
      expect(viaFolder).toEqual(viaUrl);
      expect(viaEnv).toEqual(viaUrl);

      const screened = await lsjJson<ScreenJson>(["screen", "--limit", "5", "--data", `${baseUrl}/data/`]);
      expect(screened.rows).toEqual(cliScreen({ limit: "5" }).rows);
    });

    it("形式バージョンが 3 でないデータセットは、理由を示して読まない", async () => {
      await writeFile(path.join(workDir, "manifest.json"), JSON.stringify({ ...manifest, schemaVersion: 2 }));
      const error = await lsjError(["indicators", "--data", workDir]);

      expect(error.code).toBe("unsupported-schema");
      expect(error.message).toContain("形式バージョン（schemaVersion）が 2 です");
      expect(error.message).toContain("形式バージョン 3 だけを読めます");
    });

    it("データセットがない場所は、場所の指定方法を添えて断る", async () => {
      const missing = await lsjError(["indicators", "--data", path.join(workDir, "nowhere")]);
      expect(missing.code).toBe("data-unavailable");
      expect(missing.message).toContain("LSJ_DATA");

      // JSONの代わりにHTMLが返る場所（データを公開していないサイト）。
      const html = await lsjError(["indicators", "--data", `${baseUrl}/elsewhere/`]);
      expect(html.code).toBe("invalid-data");
      expect(html.message).toContain("JSONではありません");
    });
  });

  it("--help は使い方を表示し、知らないコマンドやオプションは断る", async () => {
    const help = await lsj(["--help"], null);
    expect(help.code).toBe(0);
    for (const word of [
      "indicators",
      "search",
      "show",
      "screen",
      "compare",
      "topics",
      "over-10k",
      "--data",
      "LSJ_DATA",
      ...INDICATOR_KEYS,
      ...FACT_KEYS,
      ...TOPICS.map((topic) => topic.id)
    ]) {
      expect(help.stdout).toContain(word);
    }
    expect((await lsjError(["rank"])).code).toBe("usage");
    expect((await lsjError(["screen", "--verbose"])).code).toBe("usage");
    expect((await lsjError(["show", "13101", "--csv"])).message).toContain("--csv は screen と topics");
  });
});

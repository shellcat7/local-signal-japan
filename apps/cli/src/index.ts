import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  AREA_KIND_LABELS,
  areaLocalName,
  buildAreaView,
  buildSummary,
  CONFIDENCE_LABELS,
  formatDate,
  formatNumber,
  formatScore,
  renderMarkdownReport,
  SCORE_BAND_LABELS,
  searchAreas,
  SUMMARY_SECTIONS,
  type AreaSearchResult
} from "@local-signal-japan/core";
import { readArea, readAreaIndex, readManifest, readNational } from "@local-signal-japan/dataset";
import { CliError } from "./errors";
import {
  DEFAULT_SCREEN_LIMIT,
  describeIndicatorKeys,
  parseScreenArgs,
  renderScreenCsv,
  renderScreenJson,
  renderScreenText,
  runScreen,
  screenFooterLines,
  screenHeaderLines,
  type ScreenArgs
} from "./screen";

const USAGE = `Local Signal Japan CLI

使い方:
  pnpm localsignal search <検索語>
      市区町村名・よみがな・市区町村コードで検索します。
  pnpm localsignal show <市区町村> [--json]
      指標値と補助スコアを表示します。--json で表示用データをJSONで出力します。
  pnpm localsignal report <市区町村> [--out <ファイル>]
      Markdownレポートを出力します。--out を省くと標準出力に書きます。
  pnpm localsignal screen [--where "<指標キー><演算子><数値>"]... [--sort residents|overall|<指標キー>]
                          [--order desc|asc] [--pref <都道府県>] [--size <人口規模>] [--limit <件数>]
                          [--json | --csv] [--out <ファイル>]
      数値の条件に合う市区町村をもれなく抜き出し、条件に合う中での順位を付けて一覧にします。
      政令指定都市の区は市全体と重複するため対象外です。条件を付けた指標が欠損の市区町村は該当しません。
      --where  指標値の条件。何度でも指定でき、すべてを満たす市区町村だけが残ります。
               演算子は >=（以上）と <=（以下）。同じ指標に両方を付けると範囲になります。
               指標キー: ${describeIndicatorKeys().join("\n                         ")}
      --sort   並べ替えに使う値。residents（人口、既定）、overall（総合補助スコア）、指標キーのどれか。
      --order  desc（大きい順、既定）か asc（小さい順）。
      --pref   都道府県名（例: 東京都）か2桁の都道府県コード（例: 13）。
      --size   人口規模。all（既定） | under-10k | 10k-50k | 50k-200k | over-200k
      --limit  出力する件数（既定 ${DEFAULT_SCREEN_LIMIT}、0 ですべて）。該当した市区町村の数は件数にかかわらず表示します。
      --json   条件・該当数・各行・基準時点・出典をJSONで出力します。
      --csv    BOM付きUTF-8のCSVで出力します（見出しに単位と基準時点が入ります）。
      --out    出力をファイルに書きます。
      例: pnpm localsignal screen --where "aging<=25" --where "income>=400" --pref 東京都 --sort income

<市区町村> には5桁の市区町村コード(例: 13101)か名前(例: 千代田区、横浜市青葉区)を指定します。
データはリポジトリ同梱のデータセットを読みます。更新は pnpm data:refresh です。
JSONやCSVをファイルやパイプに渡すときは、pnpm 自身の表示が混ざらないよう pnpm -s localsignal ... とするか、--out を使ってください。`;

function describeCandidate(area: AreaSearchResult): string {
  return `${area.code}  ${area.prefName} ${areaLocalName(area)}（${AREA_KIND_LABELS[area.kind]}）`;
}

/** コードまたは名前から市区町村を1件に決める。決まらなければ候補を示して終了する。 */
async function resolveArea(query: string | undefined) {
  if (!query) {
    throw new CliError("市区町村を指定してください。");
  }

  const [manifest, index] = await Promise.all([readManifest(), readAreaIndex()]);
  const candidates = searchAreas(index, query, 20);
  const exact = candidates.filter(
    (area) => area.code === query || areaLocalName(area) === query || area.name === query
  );
  const matches = exact.length > 0 ? exact : candidates;

  if (matches.length === 0) {
    throw new CliError(`「${query}」に一致する市区町村がありません。`);
  }

  if (matches.length > 1) {
    throw new CliError(
      [
        `「${query}」に一致する市区町村が複数あります。コードで指定してください。`,
        ...matches.map(describeCandidate)
      ].join("\n")
    );
  }

  const [match] = matches as [AreaSearchResult];
  const area = await readArea(match.code);
  if (!area) {
    throw new CliError(`データセットに ${match.code} がありません。pnpm data:refresh で作り直してください。`);
  }

  return { manifest, view: buildAreaView(area, manifest) };
}

async function search(query: string | undefined): Promise<void> {
  if (!query) {
    throw new CliError("検索語を指定してください。");
  }

  const results = searchAreas(await readAreaIndex(), query, 20);
  if (results.length === 0) {
    throw new CliError(`「${query}」に一致する市区町村がありません。`);
  }
  console.log(results.map(describeCandidate).join("\n"));
}

async function show(query: string | undefined, asJson: boolean): Promise<void> {
  const { manifest, view } = await resolveArea(query);
  const summary = buildSummary(view, manifest);

  if (asJson) {
    console.log(JSON.stringify({ ...view, summary, source: manifest.source }, null, 2));
    return;
  }

  const { area } = view;
  const lines = [
    `${view.fullName}（${area.code}、${AREA_KIND_LABELS[area.kind]}）`,
    `人口: ${area.population === null ? "欠損" : `${formatNumber(area.population)}人`}`,
    `総合補助スコア: ${formatScore(view.overallScore)}（${view.coverage.total}指標中${view.coverage.available}指標）`,
    `信頼度メモ: ${CONFIDENCE_LABELS[view.confidence.level]}（${view.confidence.reason}）`,
    "",
    ...view.indicators.map(
      (indicator) =>
        `- ${indicator.definition.metricLabel}: ${indicator.valueText}（${indicator.periodText}）` +
        ` / 補助スコア ${formatScore(indicator.score)}（${SCORE_BAND_LABELS[indicator.band]}）`
    )
  ];

  for (const section of SUMMARY_SECTIONS) {
    const items = summary[section.key];
    if (items.length > 0) {
      lines.push("", `${section.title}:`, ...items.map((item) => `- ${item}`));
    }
  }

  lines.push(
    "",
    `出典: ${manifest.source.attribution}（取得日 ${formatDate(manifest.generatedAt)}）`,
    manifest.source.credit
  );
  console.log(lines.join("\n"));
}

async function report(query: string | undefined, out: string | undefined): Promise<void> {
  const { manifest, view } = await resolveArea(query);
  const markdown = renderMarkdownReport(view, manifest);

  if (!out) {
    process.stdout.write(markdown);
    return;
  }

  const outPath = path.resolve(out);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, markdown, "utf8");
  console.log(`書き出しました: ${outPath}`);
}

async function screen(args: ScreenArgs, format: "text" | "json" | "csv", out: string | undefined): Promise<void> {
  const [manifest, index, national] = await Promise.all([readManifest(), readAreaIndex(), readNational()]);
  const result = runScreen(national.areas, manifest, index.prefectures, parseScreenArgs(args, index.prefectures));
  const rendered = { text: renderScreenText, json: renderScreenJson, csv: renderScreenCsv }[format](result);

  if (out) {
    const outPath = path.resolve(out);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, rendered, "utf8");
    console.log([...screenHeaderLines(result), `書き出しました: ${outPath}`].join("\n"));
    return;
  }

  process.stdout.write(rendered);
  if (format === "csv") {
    // CSVには注記を入れられないので、条件・基準時点・出典は標準エラー出力に示す。
    console.error([...screenHeaderLines(result), ...screenFooterLines(result)].join("\n"));
  }
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      json: { type: "boolean", default: false },
      csv: { type: "boolean", default: false },
      out: { type: "string" },
      where: { type: "string", multiple: true },
      sort: { type: "string" },
      order: { type: "string" },
      pref: { type: "string" },
      size: { type: "string" },
      limit: { type: "string" },
      help: { type: "boolean", short: "h", default: false }
    }
  });
  const [command, query] = positionals;

  if (values.help || !command) {
    console.log(USAGE);
    return;
  }

  switch (command) {
    case "search":
      return search(query);
    case "show":
      return show(query, values.json);
    case "report":
      return report(query, values.out);
    case "screen": {
      if (query !== undefined) {
        throw new CliError(`screen に渡せない引数です（条件は --where "aging>=30" の形で指定してください）: ${query}`);
      }
      if (values.json && values.csv) {
        throw new CliError("--json と --csv は同時に指定できません。");
      }
      return screen(values, values.csv ? "csv" : values.json ? "json" : "text", values.out);
    }
    default:
      throw new CliError(`不明なコマンドです: ${command}\n\n${USAGE}`);
  }
}

try {
  await main();
} catch (error) {
  if (error instanceof CliError || (error instanceof TypeError && "code" in error)) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}

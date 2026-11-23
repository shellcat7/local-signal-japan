import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  AREA_KIND_LABELS,
  areaLocalName,
  buildAreaView,
  buildSummary,
  CONFIDENCE_LABELS,
  formatNumber,
  formatScore,
  POPULATION_BANDS,
  renderMarkdownReport,
  SCORE_BAND_LABELS,
  searchAreas,
  SUMMARY_SECTIONS,
  TOPICS,
  type AreaSearchResult
} from "@local-signal-japan/core";
import { readArea, readAreaIndex, readManifest, readNational } from "@local-signal-japan/dataset";
import { CliError } from "./errors";
import {
  attributionLines,
  DEFAULT_SCREEN_LIMIT,
  describeFactKeys,
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
import { buildHighlights, buildShownFacts, factLines, highlightLines } from "./show";
import {
  renderTopicCsv,
  renderTopicJson,
  renderTopicList,
  renderTopicListJson,
  renderTopicText,
  resolveTopic,
  runTopic,
  topicNoteLines,
  type TopicArgs
} from "./topics";

const KEY_INDENT = "\n                         ";

const USAGE = `まちのものさし（Local Signal Japan）CLI

使い方:
  pnpm localsignal search <検索語>
      市区町村名・よみがな・市区町村コードで検索します。
  pnpm localsignal show <市区町村> [--json]
      7指標の値と補助スコア、くらしの指標（値・基準時点・全国順位）、全国で目立つところを表示します。
      --json で表示用データ（facts と highlights を含む）をJSONで出力します。
  pnpm localsignal report <市区町村> [--out <ファイル>]
      Markdownレポートを出力します。--out を省くと標準出力に書きます。
  pnpm localsignal screen [--where "<指標キー><演算子><数値>"]... [--sort residents|overall|<指標キー>]
                          [--order desc|asc] [--pref <都道府県>] [--size <人口規模>] [--limit <件数>]
                          [--json | --csv] [--out <ファイル>]
      数値の条件に合う市区町村をもれなく抜き出し、条件に合う中での順位を付けて一覧にします。
      政令指定都市の区は市全体と重複するため対象外です。条件を付けた指標が欠損の市区町村は該当しません。
      --where  指標値の条件。何度でも指定でき、すべてを満たす市区町村だけが残ります。
               演算子は >=（以上）と <=（以下）。同じ指標に両方を付けると範囲になります。
               金額（円）の指標は、円の数値で指定します（例: furusatoReceipts>=1000000000 は10億円以上）。
               指標キー: ${describeIndicatorKeys().join(KEY_INDENT)}
               くらしの指標キー: ${describeFactKeys().join(KEY_INDENT)}
      --sort   並べ替えに使う値。residents（人口、既定）、overall（総合補助スコア）、指標キー、くらしの指標キーのどれか。
      --order  desc（大きい順、既定）か asc（小さい順）。
      --pref   都道府県名（例: 東京都）か2桁の都道府県コード（例: 13）。
      --size   人口規模。${POPULATION_BANDS.map((band) => `${band.id}${band.id === "all" ? "（既定）" : ""}`).join(" | ")}
      --limit  出力する件数（既定 ${DEFAULT_SCREEN_LIMIT}、0 ですべて）。該当した市区町村の数は件数にかかわらず表示します。
      --json   条件・該当数・各行（くらしの指標の値を含む）・基準時点・出典をJSONで出力します。
      --csv    BOM付きUTF-8のCSVで出力します（見出しに単位と基準時点が入り、金額は円の数値です）。
      --out    出力をファイルに書きます。
      表には7指標に加えて、並べ替えか条件に使ったくらしの指標の列を出します。
      例: pnpm localsignal screen --where "aging<=25" --where "income>=400" --pref 東京都 --sort income
          pnpm localsignal screen --where "vacancy<=20" --size over-10k --sort furusatoReceipts
  pnpm localsignal topics [<特集id>] [--pref <都道府県>] [--limit <件数>] [--json | --csv] [--out <ファイル>]
      特集ランキング（決まった条件で並べた一覧）を表示します。id を省くと特集の一覧を表示します。
      一覧の計算は screen と同じで、--limit の既定は ${DEFAULT_SCREEN_LIMIT} です。
      特集: ${TOPICS.map((topic) => topic.id).join(", ")}
      例: pnpm localsignal topics half-by-2050 --limit 5

<市区町村> には5桁の市区町村コード(例: 13101)か名前(例: 千代田区、横浜市青葉区)を指定します。
データはリポジトリ同梱のデータセットを読みます。更新は pnpm data:refresh です。
ふるさと納税の値の出典は、総務省「ふるさと納税に関する現況調査結果」です（それ以外は統計ダッシュボード）。
JSONやCSVをファイルやパイプに渡すときは、pnpm 自身の表示が混ざらないよう pnpm -s localsignal ... とするか、--out を使ってください。`;

type OutputFormat = "text" | "json" | "csv";

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
  const [{ manifest, view }, national] = await Promise.all([resolveArea(query), readNational()]);
  const summary = buildSummary(view, manifest);
  const { area } = view;
  const facts = buildShownFacts(area, manifest);
  const highlights = buildHighlights(area, national.areas, manifest);

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          ...view,
          summary,
          facts,
          highlights,
          source: manifest.source,
          additionalSources: manifest.additionalSources
        },
        null,
        2
      )
    );
    return;
  }

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
    ...highlightLines(area, highlights),
    "",
    ...factLines(facts, manifest),
    "",
    // くらしの指標にふるさと納税の値が入るので、総務省の出典も添える。
    ...attributionLines({ ...manifest.source, fetchedAt: manifest.generatedAt }, manifest.additionalSources, true)
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

async function writeOut(out: string, rendered: string): Promise<string> {
  const outPath = path.resolve(out);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, rendered, "utf8");
  return outPath;
}

async function screen(args: ScreenArgs, format: OutputFormat, out: string | undefined): Promise<void> {
  const [manifest, index, national] = await Promise.all([readManifest(), readAreaIndex(), readNational()]);
  const result = runScreen(national.areas, manifest, index.prefectures, parseScreenArgs(args, index.prefectures));
  const rendered = { text: renderScreenText, json: renderScreenJson, csv: renderScreenCsv }[format](result);
  // CSVには注記を入れられないので、条件・基準時点・出典（すべての値の出典）は別に示す。
  const csvNotes = [...screenHeaderLines(result), ...screenFooterLines(result, { allSources: true })];

  if (out) {
    const outPath = await writeOut(out, rendered);
    console.log(
      [...(format === "csv" ? csvNotes : screenHeaderLines(result)), `書き出しました: ${outPath}`].join("\n")
    );
    return;
  }

  process.stdout.write(rendered);
  if (format === "csv") console.error(csvNotes.join("\n"));
}

async function topics(id: string | undefined, args: TopicArgs, format: OutputFormat, out: string | undefined) {
  if (id === undefined) {
    if (format === "csv") throw new CliError("--csv は、特集の id を指定したときだけ使えます。");
    const rendered = format === "json" ? renderTopicListJson() : renderTopicList();
    if (out) console.log(`書き出しました: ${await writeOut(out, rendered)}`);
    else process.stdout.write(rendered);
    return;
  }

  const topic = resolveTopic(id);
  const [manifest, index, national] = await Promise.all([readManifest(), readAreaIndex(), readNational()]);
  const result = runTopic(national.areas, manifest, index.prefectures, topic, args);
  const rendered = { text: renderTopicText, json: renderTopicJson, csv: renderTopicCsv }[format](result);

  if (out) {
    const outPath = await writeOut(out, rendered);
    const notes = format === "csv" ? topicNoteLines(result) : [result.topic.title, ...screenHeaderLines(result)];
    console.log([...notes, `書き出しました: ${outPath}`].join("\n"));
    return;
  }

  process.stdout.write(rendered);
  if (format === "csv") console.error(topicNoteLines(result).join("\n"));
}

/** 特集では、並べ方と条件を変えるオプションを受け付けない。 */
const SCREEN_ONLY_OPTIONS = ["where", "sort", "order", "size"] as const;

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
  const [command, query, ...rest] = positionals;

  if (values.help || !command) {
    console.log(USAGE);
    return;
  }
  if (values.json && values.csv) {
    throw new CliError("--json と --csv は同時に指定できません。");
  }
  const format: OutputFormat = values.csv ? "csv" : values.json ? "json" : "text";

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
      return screen(values, format, values.out);
    }
    case "topics": {
      if (rest.length > 0) {
        throw new CliError(`topics に指定できる特集は1つです: ${rest.join(" ")}`);
      }
      const used = SCREEN_ONLY_OPTIONS.filter((name) => values[name] !== undefined);
      if (used.length > 0) {
        throw new CliError(
          `topics では ${used.map((name) => `--${name}`).join("、")} を使えません（並べ方と条件は特集ごとに決まっています）。` +
            "条件を変えて調べるときは screen を使ってください。"
        );
      }
      return topics(query, { pref: values.pref, limit: values.limit }, format, values.out);
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

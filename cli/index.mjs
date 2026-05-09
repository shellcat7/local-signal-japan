#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(rootDir, "examples", "mock-area-signal.json");

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg.startsWith("--")) {
      options[arg.slice(2)] = rest[index + 1];
      index += 1;
    }
  }

  return { command, options };
}

async function loadFixture() {
  return JSON.parse(await readFile(fixturePath, "utf8"));
}

function indicatorEntries(area) {
  return Object.values(area.indicators).filter(Boolean);
}

function normalizeScore(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function overallScore(area) {
  const scores = indicatorEntries(area)
    .map((indicator) => normalizeScore(indicator.score))
    .filter((score) => score !== null);

  if (scores.length === 0) {
    return null;
  }

  return normalizeScore(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

function bullets(items) {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- なし";
}

function scoreText(score) {
  return typeof score === "number" ? `${score}/100` : "欠損";
}

function generateReport(area) {
  const details = indicatorEntries(area)
    .map((indicator) => {
      const sources = indicator.sources
        .map((source) => {
          const mode = source.isMock ? "mock" : "public";
          return `  - ${source.sourceName} (${source.sourceUrlLabel}, retrieved: ${source.retrievedAt}, ${mode})`;
        })
        .join("\n");

      return [
        `### ${indicator.label}`,
        `- 値: ${indicator.value ?? "欠損"}${indicator.unit ? ` ${indicator.unit}` : ""}`,
        `- 補助スコア: ${scoreText(indicator.score)}`,
        "- 注意・根拠:",
        bullets(indicator.notes),
        "- 出典:",
        sources
      ].join("\n");
    })
    .join("\n\n");

  return [
    `# Local Signal Japan Report: ${area.prefectureName} ${area.areaName}`,
    "",
    `- 自治体コード: ${area.areaCode}`,
    `- 取得日: ${area.retrievedAt}`,
    `- 総合補助スコア: ${scoreText(overallScore(area))}`,
    "",
    "> このレポートは公開データ上のシグナルを整理するためのものです。地域の成長・停滞を断定しません。",
    "",
    "## 成長シグナル",
    "",
    bullets(area.summary.growthSignals),
    "",
    "## 停滞シグナル",
    "",
    bullets(area.summary.stagnationSignals),
    "",
    "## 要注意シグナル",
    "",
    bullets(area.summary.cautionSignals),
    "",
    "## 欠損データ",
    "",
    bullets(area.summary.missingDataNotes),
    "",
    "## 指標詳細",
    "",
    details,
    ""
  ].join("\n");
}

function usage() {
  return [
    "Local Signal Japan CLI",
    "",
    "Commands:",
    "  pnpm localsignal demo",
    "  pnpm localsignal report --area-code 13101 --out reports/local-signal-demo.md"
  ].join("\n");
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));

  if (command === "demo") {
    const area = await loadFixture();
    console.log(`${area.prefectureName} ${area.areaName} (${area.areaCode})`);
    console.log(`overall: ${scoreText(overallScore(area))}`);
    console.log("mode: mock data only");
    return;
  }

  if (command === "report") {
    if (options["area-code"] !== "13101") {
      console.error("Only the 13101 demo fixture is bundled in the MVP CLI.");
      process.exitCode = 1;
      return;
    }

    const outPath = options.out ? path.resolve(rootDir, options.out) : path.join(rootDir, "reports", "local-signal-demo.md");
    const area = await loadFixture();
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, generateReport(area), "utf8");
    console.log(`wrote ${path.relative(rootDir, outPath)}`);
    return;
  }

  console.log(usage());
}

await main();

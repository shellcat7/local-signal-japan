import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  areaIndexSchema,
  manifestSchema,
  nationalFileSchema,
  prefectureFileSchema,
  type AreaIndex,
  type AreaRecord,
  type Manifest,
  type NationalFile,
  type PrefectureFile
} from "@local-signal-japan/core";
import type { Dataset } from "./build";

/** Webアプリが /data として配信する、リポジトリ同梱のデータセット。 */
export const DATASET_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../apps/web/public/data");

const MANIFEST_FILE = "manifest.json";
const INDEX_FILE = "areas.json";
const NATIONAL_FILE = "national.json";
const PREF_DIR = "pref";

const prefFile = (prefCode: string) => path.join(PREF_DIR, `${prefCode}.json`);

/**
 * 配列の要素を1行ずつに並べたJSON。
 * 行単位の差分が市区町村単位になるので、データ更新時の変更を確認しやすい。
 */
function stringifyRows(wrapper: Record<string, unknown>, rowsKey: string, rows: readonly unknown[]): string {
  const head = Object.entries(wrapper).map(([key, value]) => `${JSON.stringify(key)}:${JSON.stringify(value)}`);
  const body = rows.map((row) => JSON.stringify(row)).join(",\n");
  return `{${[...head, `${JSON.stringify(rowsKey)}:[\n${body}\n]`].join(",\n")}}\n`;
}

export async function writeDataset(dataset: Dataset, dir = DATASET_DIR): Promise<void> {
  await mkdir(path.join(dir, PREF_DIR), { recursive: true });

  // 古い都道府県ファイルが残らないよう、書き出す前に消す。
  for (const file of await readdir(path.join(dir, PREF_DIR))) {
    await rm(path.join(dir, PREF_DIR, file));
  }

  await writeFile(path.join(dir, MANIFEST_FILE), `${JSON.stringify(dataset.manifest, null, 2)}\n`);
  await writeFile(
    path.join(dir, INDEX_FILE),
    stringifyRows({ prefectures: dataset.index.prefectures }, "areas", dataset.index.areas)
  );

  await writeFile(
    path.join(dir, NATIONAL_FILE),
    stringifyRows({ indicatorKeys: dataset.national.indicatorKeys }, "areas", dataset.national.areas)
  );

  for (const pref of dataset.prefectures) {
    await writeFile(
      path.join(dir, prefFile(pref.prefCode)),
      stringifyRows({ prefCode: pref.prefCode, prefName: pref.prefName }, "areas", pref.areas)
    );
  }
}

async function readJson(dir: string, file: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(dir, file), "utf8")) as unknown;
}

export async function readManifest(dir = DATASET_DIR): Promise<Manifest> {
  return manifestSchema.parse(await readJson(dir, MANIFEST_FILE));
}

export async function readAreaIndex(dir = DATASET_DIR): Promise<AreaIndex> {
  return areaIndexSchema.parse(await readJson(dir, INDEX_FILE));
}

export async function readNational(dir = DATASET_DIR): Promise<NationalFile> {
  return nationalFileSchema.parse(await readJson(dir, NATIONAL_FILE));
}

export async function readPrefecture(prefCode: string, dir = DATASET_DIR): Promise<PrefectureFile> {
  return prefectureFileSchema.parse(await readJson(dir, prefFile(prefCode)));
}

export async function readArea(code: string, dir = DATASET_DIR): Promise<AreaRecord | undefined> {
  const prefecture = await readPrefecture(code.slice(0, 2), dir);
  return prefecture.areas.find((area) => area.code === code);
}

export async function readDataset(dir = DATASET_DIR): Promise<Dataset> {
  const [manifest, index, national] = await Promise.all([readManifest(dir), readAreaIndex(dir), readNational(dir)]);
  const prefectures = await Promise.all(index.prefectures.map((pref) => readPrefecture(pref.code, dir)));
  return { manifest, index, national, prefectures };
}

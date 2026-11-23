import { INDICATOR_KEYS, INDICATORS } from "@local-signal-japan/core";
import { buildDataset } from "./build";
import { fetchSnapshot } from "./fetch";
import { DATASET_DIR, writeDataset } from "./store";
import { createPoliteFetch } from "./upstream";

/**
 * 統計ダッシュボードAPIから最新データを取得し、同梱データセットを作り直す。
 * 使い方: pnpm data:refresh
 */
const log = (message: string) => console.log(message);

const snapshot = await fetchSnapshot(createPoliteFetch(log), log);
const dataset = buildDataset(snapshot, new Date().toISOString());
await writeDataset(dataset);

log("");
log(`データセットを書き出しました: ${DATASET_DIR}`);
log(`  市区町村 ${dataset.manifest.counts.areas}件（基準集団 ${dataset.manifest.counts.referenceAreas}件）`);
for (const key of INDICATOR_KEYS) {
  const meta = dataset.manifest.indicators[key];
  log(
    `  ${INDICATORS[key].label}: 基準年 ${meta.year} / 中央値 ${meta.distribution.p50} / ${meta.distribution.count}件`
  );
}

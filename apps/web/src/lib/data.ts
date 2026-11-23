import { DATASET_SCHEMA_VERSION, type AreaIndex, type Manifest, type PrefectureFile } from "@local-signal-japan/core";

/**
 * 同梱データセットの読み込み。
 * データは同一オリジンの静的ファイルで、外部APIには一切アクセスしない。
 * 市区町村の詳細は都道府県単位のファイルに入っているため、
 * 配信元に伝わるのは「どの都道府県を開いたか」までで、検索語や市区町村は伝わらない。
 */
const DATA_BASE = `${import.meta.env.BASE_URL}data`;

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${DATA_BASE}/${path}`, init);
  } catch (cause) {
    throw new Error("データを読み込めませんでした。通信状態を確認して、再読み込みしてください。", { cause });
  }

  if (!response.ok) {
    throw new Error(`データを読み込めませんでした（HTTP ${response.status}）。時間をおいて再読み込みしてください。`);
  }

  try {
    return (await response.json()) as T;
  } catch (cause) {
    // 配信元が JSON 以外(エラーページなど)を返した場合。
    throw new Error("データの形式を読み取れませんでした。時間をおいて再読み込みしてください。", { cause });
  }
}

export async function loadManifest(): Promise<Manifest> {
  // マニフェストは毎回再検証し、ほかのファイルは取得日時をキーにしてキャッシュさせる。
  const manifest = await fetchJson<Manifest>("manifest.json", { cache: "no-cache" });
  if (manifest.schemaVersion !== DATASET_SCHEMA_VERSION) {
    throw new Error("データの形式がこの画面と合っていません。ページを再読み込みしてください。");
  }
  return manifest;
}

const versionOf = (manifest: Manifest) => encodeURIComponent(manifest.generatedAt);

export function loadAreaIndex(manifest: Manifest): Promise<AreaIndex> {
  return fetchJson<AreaIndex>(`areas.json?v=${versionOf(manifest)}`);
}

const prefectureCache = new Map<string, Promise<PrefectureFile>>();

export function loadPrefecture(prefCode: string, manifest: Manifest): Promise<PrefectureFile> {
  const key = `${prefCode}@${manifest.generatedAt}`;
  let pending = prefectureCache.get(key);

  if (!pending) {
    pending = fetchJson<PrefectureFile>(`pref/${prefCode}.json?v=${versionOf(manifest)}`);
    prefectureCache.set(key, pending);
    // 失敗した取得はキャッシュに残さず、次の操作で取り直せるようにする。
    pending.catch(() => prefectureCache.delete(key));
  }

  return pending;
}

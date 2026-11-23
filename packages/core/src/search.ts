import { areaLocalName } from "./format";
import type { AreaIndex, AreaIndexEntry, AreaRecord } from "./schema";

export type AreaSearchResult = AreaIndexEntry & { prefName: string };

/**
 * 全角英数・カタカナ・空白の違いを吸収して比較用の文字列にする。
 * 「鎌ケ谷」「茅ヶ崎」のように小書きかどうかが地名ごとに違う文字は、大きいほうにそろえる。
 */
export function normalizeQuery(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/ヶ/g, "ケ")
    .replace(/ヵ/g, "カ")
    .replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .replace(/\s+/g, "");
}

function matchRank(entry: AreaIndexEntry, prefName: string, query: string): number | null {
  const name = normalizeQuery(entry.name);
  const localName = normalizeQuery(areaLocalName(entry));
  const kana = normalizeQuery(entry.kana);

  if (/^\d+$/.test(query)) {
    if (entry.code === query) return 0;
    return entry.code.startsWith(query) ? 1 : null;
  }

  if (name === query || localName === query) return 0;
  if (kana === query) return 1;
  if (name.startsWith(query) || localName.startsWith(query)) return 2;
  if (kana !== "" && kana.startsWith(query)) return 3;
  if (localName.includes(query)) return 4;

  // 都道府県名から始まる入力は、残りを市区町村名として照合する。
  // 連結した文字列の部分一致にすると「京都府＋中京区」が「府中」に一致してしまうため、境界で区切る。
  const pref = normalizeQuery(prefName);
  if (pref !== "" && query.startsWith(pref)) {
    const rest = query.slice(pref.length);
    if (rest === "") return 8;
    // 「神奈川県青葉区」のように市名を省いた入力にも応える。
    if (localName.startsWith(rest) || name.startsWith(rest)) return 5;
    if (localName.includes(rest)) return 6;
  }

  if (kana !== "" && kana.includes(query)) return 7;
  return null;
}

/** 市区町村名・よみがな・市区町村コードで検索する。一致度の高い順、同順位はコード順。 */
export function searchAreas(index: AreaIndex, rawQuery: string, limit = 8): AreaSearchResult[] {
  const query = normalizeQuery(rawQuery);
  if (query === "") return [];

  const prefNames = new Map(index.prefectures.map((pref) => [pref.code, pref.name]));
  const matches: Array<{ rank: number; result: AreaSearchResult }> = [];

  for (const entry of index.areas) {
    const prefName = prefNames.get(entry.prefCode) ?? "";
    const rank = matchRank(entry, prefName, query);
    if (rank !== null) {
      matches.push({ rank, result: { ...entry, prefName } });
    }
  }

  return matches
    .sort((a, b) => a.rank - b.rank || a.result.code.localeCompare(b.result.code))
    .slice(0, limit)
    .map((match) => match.result);
}

export function findAreaEntry(index: AreaIndex, code: string): AreaSearchResult | undefined {
  const entry = index.areas.find((area) => area.code === code);
  if (!entry) return undefined;
  const prefName = index.prefectures.find((pref) => pref.code === entry.prefCode)?.name ?? "";
  return { ...entry, prefName };
}

/**
 * 同じ都道府県内で人口規模が近い市区町村を選ぶ（比較の初期表示用）。
 * 地理的な隣接ではなく、人口の対数差が小さい順。
 */
export function selectPeers(areas: readonly AreaRecord[], target: AreaRecord, count = 5): AreaRecord[] {
  if (target.population === null || target.population <= 0) return [];
  const targetSize = Math.log(target.population);

  return areas
    .filter(
      (area): area is AreaRecord & { population: number } =>
        area.code !== target.code && area.population !== null && area.population > 0
    )
    .map((area) => ({ area, distance: Math.abs(Math.log(area.population) - targetSize) }))
    .sort((a, b) => a.distance - b.distance || a.area.code.localeCompare(b.area.code))
    .slice(0, count)
    .map((entry) => entry.area);
}

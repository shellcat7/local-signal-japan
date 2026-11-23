import {
  CONTEXT_UPSTREAM,
  factUpstreamSeries,
  INDICATOR_KEYS,
  INDICATORS,
  type UpstreamSeries
} from "@local-signal-japan/core";
import type { UpstreamSnapshot } from "./build";
import { fetchFurusato, type FetchBinary } from "./furusato";
import {
  parseAreas,
  parsePrefectures,
  parseSeriesData,
  regionInfoUrl,
  seriesDataUrl,
  type FetchJson
} from "./upstream";

/** 取得対象の上流系列（指標用 + 文脈情報用 + くらしの指標用）。 */
export function listUpstreamSeries(): UpstreamSeries[] {
  return [
    ...INDICATOR_KEYS.flatMap((key) => INDICATORS[key].upstream),
    ...Object.values(CONTEXT_UPSTREAM),
    ...factUpstreamSeries()
  ];
}

/** 地域マスタと全系列を統計ダッシュボードAPIから取得する。 */
export async function fetchSnapshot(
  fetchJson: FetchJson,
  fetchText: (url: string) => Promise<string>,
  fetchBinary: FetchBinary,
  log: (message: string) => void = () => {}
): Promise<UpstreamSnapshot> {
  log("地域マスタを取得中");
  const prefectures = parsePrefectures(await fetchJson(regionInfoUrl([3])));
  const areas = parseAreas(await fetchJson(regionInfoUrl([8, 9, 10, 11, 12, 13])));
  log(`  都道府県 ${prefectures.length}件 / 市区町村 ${areas.length}件`);

  const series: UpstreamSnapshot["series"] = {};
  for (const upstream of listUpstreamSeries()) {
    log(`系列を取得中: ${upstream.id}（${upstream.code}）`);
    const data = parseSeriesData(await fetchJson(seriesDataUrl(upstream)), upstream);
    log(`  ${data.name}｜${data.statName}｜${data.valuesByArea.size}地域`);
    series[upstream.id] = data;
  }

  const furusato = await fetchFurusato(fetchText, fetchBinary, log);

  return { prefectures, areas, series, furusato };
}

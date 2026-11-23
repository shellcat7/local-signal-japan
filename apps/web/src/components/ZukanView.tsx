import { useMemo, useState, type MouseEvent } from "react";
import {
  areaLocalName,
  findAreaEntry,
  formatNumber,
  kujiPool,
  type AreaIndex,
  type Manifest
} from "@local-signal-japan/core";
import type { MapData } from "../lib/data";
import { hrefOf, KUJI_HOME, type Route } from "../lib/route";
import type { AsyncState } from "../lib/useAsync";
import type { Zukan } from "../lib/zukan";
import { AreaMap, zukanSvgString, type AreaState } from "./AreaMap";
import { shortName, TILES } from "./JapanMap";
import { Stamp } from "./PlayHeader";
import { cardSources, ShareButtons } from "./ShareButtons";

type ZukanViewProps = {
  manifest: Manifest;
  index: AreaIndex;
  map: AsyncState<MapData>;
  zukan: Zukan;
  /** 図鑑をはじめる前に、このページで引いたまち。 */
  drawn: readonly string[];
  onEnable: () => void;
  onClear: () => void;
  onNavigate: (route: Route) => void;
};

const isPlainClick = (event: MouseEvent) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

/**
 * まち図鑑。まちくじで引いたまちを、都道府県ごとに集める。
 * 記録は、利用者が「図鑑をはじめる」を押したときだけ、この端末のブラウザに保存する。
 */
export function ZukanView({ manifest, index, map, zukan, drawn, onEnable, onClear, onNavigate }: ZukanViewProps) {
  const [confirming, setConfirming] = useState(false);
  const pool = useMemo(() => kujiPool(index.areas), [index]);
  const totals = useMemo(() => {
    const counts = new Map<string, number>();
    for (const area of pool) counts.set(area.prefCode, (counts.get(area.prefCode) ?? 0) + 1);
    return counts;
  }, [pool]);

  const codes = zukan.enabled ? zukan.codes : drawn;
  const entries = codes
    .map((code) => findAreaEntry(index, code))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined && entry.kind !== "ward");
  const byPref = new Map<string, typeof entries>();
  for (const entry of entries) byPref.set(entry.prefCode, [...(byPref.get(entry.prefCode) ?? []), entry]);
  const completed = index.prefectures.filter(
    (pref) => (byPref.get(pref.code)?.length ?? 0) >= (totals.get(pref.code) ?? Number.POSITIVE_INFINITY)
  ).length;
  const share = entries.length / pool.length;
  const doneCodes = new Set(
    index.prefectures
      .filter((pref) => (byPref.get(pref.code)?.length ?? 0) >= (totals.get(pref.code) ?? Number.POSITIVE_INFINITY))
      .map((pref) => pref.code)
  );
  // 集めたまちは珊瑚、制覇した都道府県はミント、集めたまちがある都道府県のほかのまちはバターで塗る。
  const states = new Map<string, AreaState>();
  const visited = new Set(entries.map((entry) => entry.prefCode));
  for (const area of pool) {
    if (visited.has(area.prefCode)) states.set(area.code, doneCodes.has(area.prefCode) ? "done" : "pref");
  }
  for (const entry of entries) states.set(entry.code, doneCodes.has(entry.prefCode) ? "done" : "got");

  const link = (next: Route) => ({
    href: hrefOf(next),
    onClick: (event: MouseEvent) => {
      if (!isPlainClick(event)) return;
      event.preventDefault();
      onNavigate(next);
    }
  });

  return (
    <div className="zukan">
      {!zukan.enabled && (
        <section className="zukan-start" aria-labelledby="zukan-start-title">
          <h3 id="zukan-start-title">図鑑をはじめる</h3>
          <p>
            まちくじで引いたまちを、この端末のブラウザに記録します。記録するのは市区町村のコードだけで、どこにも送信しません。いつでも消せます。
          </p>
          <button type="button" className="pop-button pop-button--big" onClick={onEnable}>
            図鑑をはじめる
          </button>
          {drawn.length > 0 && (
            <p className="zukan-start__note">このページで引いた{drawn.length}まちも、図鑑に入れます。</p>
          )}
        </section>
      )}

      <section className="zukan-score" aria-label="集めたまちの数">
        <p>
          <span>集めたまち</span>
          <strong>{formatNumber(entries.length)}</strong>
          <small>/ {formatNumber(pool.length)}</small>
        </p>
        <p>
          <span>都道府県</span>
          <strong>{byPref.size}</strong>
          <small>/ 47</small>
        </p>
        <p>
          <span>制覇</span>
          <strong>{completed}</strong>
          <small>都道府県</small>
        </p>
        <div className="zukan-score__bar" aria-hidden="true">
          <span style={{ width: `${Math.min(100, share * 100)}%` }} />
        </div>
      </section>

      <figure className="zukan-japan">
        {map.status === "ready" ? (
          <AreaMap
            map={map.value}
            states={states}
            label={`集めたまちの地図。${formatNumber(entries.length)}まちを塗っています`}
          />
        ) : (
          <p className="play-status">{map.status === "error" ? map.message : "地図を読み込んでいます…"}</p>
        )}
        <figcaption>
          <span className="zukan-japan__key" data-state="got" />
          集めたまち
          <span className="zukan-japan__key" data-state="pref" />
          訪れた都道府県
          <span className="zukan-japan__key" data-state="done" />
          制覇した都道府県
        </figcaption>
      </figure>

      <ul className="zukan-map" aria-label="都道府県ごとの集めた数">
        {index.prefectures.map((pref) => {
          const [column, row] = TILES[pref.code] ?? [1, 1];
          const got = byPref.get(pref.code)?.length ?? 0;
          const all = totals.get(pref.code) ?? 0;
          const state = got === 0 ? "none" : got >= all ? "done" : "some";
          return (
            <li key={pref.code} style={{ gridColumn: column, gridRow: row }} data-state={state}>
              <span aria-hidden="true">{shortName(pref.name)}</span>
              <small aria-hidden="true">
                {got}/{all}
              </small>
              <span className="visually-hidden">
                {pref.name} {all}市区町村のうち{got}
                {state === "done" ? "、制覇" : ""}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="zukan__actions">
        <a className="pop-button pop-button--big" {...link(KUJI_HOME)}>
          まちくじを引く
        </a>
        {entries.length > 0 && (
          <ShareButtons
            pop
            filename="machizukan.png"
            text={`まち図鑑 ${formatNumber(entries.length)}/${formatNumber(pool.length)}まち・${byPref.size}都道府県${completed > 0 ? `・${completed}都道府県制覇` : ""}\n#まちくじ`}
            url={`${typeof window === "undefined" ? "" : `${window.location.origin}${window.location.pathname}`}#view=kuji`}
            card={() => ({
              kind: "zukan",
              count: entries.length,
              total: pool.length,
              prefectures: byPref.size,
              completed,
              mapUrl:
                map.status === "ready"
                  ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(zukanSvgString(map.value, states))}`
                  : null,
              mapAspect: map.status === "ready" ? map.value.viewBox[2] / map.value.viewBox[3] : 1,
              sources: cardSources(manifest, { map: map.status === "ready" ? map.value.source.attribution : undefined })
            })}
          />
        )}
      </div>

      {entries.length > 0 && (
        <section className="zukan-list" aria-labelledby="zukan-list-title">
          <h3 id="zukan-list-title">集めたまち</h3>
          {index.prefectures
            .filter((pref) => byPref.has(pref.code))
            .map((pref) => {
              const items = byPref.get(pref.code) ?? [];
              const done = items.length >= (totals.get(pref.code) ?? Number.POSITIVE_INFINITY);
              return (
                <div key={pref.code} className="zukan-list__pref">
                  <h4>
                    {pref.name}
                    <small>
                      {items.length}/{totals.get(pref.code)}
                    </small>
                    {done && <Stamp top={shortName(pref.name)} bottom="制覇" />}
                  </h4>
                  <ul>
                    {items.map((item) => (
                      <li key={item.code}>
                        <a {...link({ view: "kuji", areaCode: item.code, prefCode: null })}>{areaLocalName(item)}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
        </section>
      )}

      {zukan.enabled && (
        <div className="zukan__clear">
          {confirming ? (
            <>
              <p role="alert">この端末の図鑑の記録を消して、記録をやめます。よろしいですか？</p>
              <button
                type="button"
                className="pop-button pop-button--plain"
                onClick={() => {
                  setConfirming(false);
                  onClear();
                }}
              >
                消してやめる
              </button>
              <button type="button" className="pop-button pop-button--plain" onClick={() => setConfirming(false)}>
                やめない
              </button>
            </>
          ) : (
            <button type="button" className="link-button" onClick={() => setConfirming(true)}>
              図鑑の記録を消す
            </button>
          )}
        </div>
      )}

      <ul className="notes">
        <li>
          図鑑の記録は、この端末のブラウザ（localStorage）にだけあります。ほかの端末やブラウザには引き継がれません。
        </li>
        <li>政令指定都市の区は、まちくじの対象外のため、図鑑にも入りません。</li>
      </ul>
    </div>
  );
}

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import {
  AREA_KIND_LABELS,
  areaLocalName,
  findAreaEntry,
  findTraits,
  formatNumber,
  kujiPool,
  type AreaIndex,
  type Manifest,
  type NationalFile
} from "@local-signal-japan/core";
import { hrefOf, ZUKAN_HOME, type KujiRoute, type Route } from "../lib/route";
import type { AsyncState } from "../lib/useAsync";
import type { Zukan } from "../lib/zukan";
import { Stamp } from "./PlayHeader";
import { cardSources, ShareButtons } from "./ShareButtons";

/** 名前が切り替わる間隔（ミリ秒）。だんだん遅くして止める。 */
const ROLL_DELAYS = [40, 40, 45, 50, 55, 65, 75, 90, 110, 140, 180];

type KujiViewProps = {
  route: KujiRoute;
  manifest: Manifest;
  index: AreaIndex;
  national: AsyncState<NationalFile>;
  /** このページを開いてから引いた市区町村（新しい順）。 */
  drawn: readonly string[];
  zukan: Zukan;
  /** 引いた直後で、名前が切り替わる演出を見せる市区町村。 */
  pendingReveal: string | null;
  onRevealed: () => void;
  onDraw: (prefCode: string | null) => void;
  onChangePref: (prefCode: string | null) => void;
  onEnableZukan: () => void;
  onNavigate: (route: Route) => void;
};

const isPlainClick = (event: MouseEvent) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

/**
 * まちくじ。全国の市区町村から1つを引き、全国や都道府県の中で目立つ項目を3つまで示す。
 * 引いた結果は URL のハッシュに持つので、投稿したリンクから同じ札を開ける。
 */
export function KujiView({
  route,
  manifest,
  index,
  national,
  drawn,
  zukan,
  pendingReveal,
  onRevealed,
  onDraw,
  onChangePref,
  onEnableZukan,
  onNavigate
}: KujiViewProps) {
  const prefNames = useMemo(() => new Map(index.prefectures.map((pref) => [pref.code, pref.name])), [index]);
  const entry = route.areaCode ? findAreaEntry(index, route.areaCode) : undefined;
  const [rolling, setRolling] = useState<string | null>(null);

  // 引いた直後は、候補の名前を次々に切り替えてから結果を見せる（動きを減らす設定では切り替えない）。
  useEffect(() => {
    if (route.areaCode === null || pendingReveal !== route.areaCode) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onRevealed();
      return;
    }
    const pool = kujiPool(index.areas, route.prefCode);
    let step = 0;
    let timer = 0;
    const tick = () => {
      if (step >= ROLL_DELAYS.length) {
        setRolling(null);
        onRevealed();
        return;
      }
      const candidate = pool[Math.floor(Math.random() * pool.length)];
      setRolling(candidate ? `${prefNames.get(candidate.prefCode) ?? ""} ${areaLocalName(candidate)}` : "");
      timer = window.setTimeout(tick, ROLL_DELAYS[step]);
      step += 1;
    };
    tick();
    return () => {
      window.clearTimeout(timer);
      setRolling(null);
    };
  }, [route.areaCode, route.prefCode, pendingReveal, index, prefNames, onRevealed]);

  const rows = national.status === "ready" ? national.value.areas : null;
  const target = rows && route.areaCode ? rows.find((row) => row.code === route.areaCode) : undefined;
  const prefName = entry ? (prefNames.get(entry.prefCode) ?? "") : "";
  const traits = useMemo(
    () => (target && rows ? findTraits(target, rows, manifest, prefName) : []),
    [target, rows, manifest, prefName]
  );
  const populationRank = useMemo(() => {
    if (!target || !rows || target.population === null) return null;
    const population = target.population;
    const reference = rows.filter((row) => row.kind !== "ward" && row.population !== null);
    return { rank: 1 + reference.filter((row) => (row.population ?? 0) > population).length, total: reference.length };
  }, [target, rows]);

  const total = kujiPool(index.areas, route.prefCode).length;
  const referenceTotal = kujiPool(index.areas).length;
  const scopeName = route.prefCode ? (prefNames.get(route.prefCode) ?? "") : "全国";
  const fullName = entry ? `${prefName} ${areaLocalName(entry)}` : "";
  const first = traits[0];
  const nationalFirst = traits.some((trait) => trait.scope === "national" && trait.rank === 1);
  // 名前が切り替わっている間は、引いた結果を一覧に先に出さない。
  const drawnEntries = drawn
    .filter((code) => rolling === null || code !== pendingReveal)
    .map((code) => findAreaEntry(index, code))
    .filter((item) => item !== undefined);
  const drawnPrefs = new Set(drawnEntries.map((item) => item.prefCode)).size;
  const zukanCount = zukan.enabled
    ? zukan.codes.filter((code) => rolling === null || code !== pendingReveal).length
    : 0;

  const link = (next: Route) => ({
    href: hrefOf(next),
    onClick: (event: MouseEvent) => {
      if (!isPlainClick(event)) return;
      event.preventDefault();
      onNavigate(next);
    }
  });

  const shareText = first
    ? `まちくじで「${fullName}」を引きました。${first.label}が${first.phrase}（${first.valueText}）。 #まちくじ`
    : `まちくじで「${fullName}」を引きました。 #まちくじ`;
  const profile = entry
    ? `${AREA_KIND_LABELS[entry.kind]}${target?.population != null ? `・人口 ${formatNumber(target.population)}人` : ""}`
    : "";

  return (
    <div className="kuji">
      <div className="kuji__controls">
        <button
          type="button"
          className="pop-button pop-button--big"
          onClick={() => onDraw(route.prefCode)}
          disabled={rolling !== null}
        >
          {route.areaCode ? "もう一回引く" : "くじを引く"}
        </button>
        <label className="kuji__range">
          引く範囲
          <select
            value={route.prefCode ?? ""}
            onChange={(event) => onChangePref(event.target.value === "" ? null : event.target.value)}
          >
            <option value="">全国</option>
            {index.prefectures.map((pref) => (
              <option key={pref.code} value={pref.code}>
                {pref.name}
              </option>
            ))}
          </select>
        </label>
        <p className="kuji__count">
          {scopeName}の{formatNumber(total)}市区町村から1つ
        </p>
      </div>

      <article
        className={`ticket${rolling !== null ? " is-rolling" : ""}${entry && rolling === null ? " is-revealed" : ""}`}
        aria-labelledby="kuji-name"
      >
        <header className="ticket__band">
          <span>まちくじ</span>
          {entry && rolling === null && <span className="ticket__no">No.{entry.code}</span>}
        </header>

        <div className="ticket__body">
          {rolling !== null ? (
            <p className="ticket__name ticket__name--rolling" id="kuji-name" aria-hidden="true">
              {rolling}
            </p>
          ) : !route.areaCode ? (
            <>
              <h3 className="ticket__name ticket__name--empty" id="kuji-name">
                どこのまちが出るかな
              </h3>
              <p className="ticket__lead">引くと、まちの名前と、全国や都道府県の中で目立つところが3つまで出ます。</p>
            </>
          ) : !entry ? (
            <p className="ticket__lead" id="kuji-name">
              市区町村コード {route.areaCode} のデータは収録されていません。
            </p>
          ) : (
            <>
              <p className="ticket__pref">{prefName}</p>
              <h3 className="ticket__name" id="kuji-name">
                {areaLocalName(entry)}
              </h3>
              <p className="ticket__profile">
                {profile}
                {populationRank && (
                  <small>
                    （全国{formatNumber(populationRank.total)}のうち、人口の多いほうから
                    {formatNumber(populationRank.rank)}番目）
                  </small>
                )}
              </p>
              {nationalFirst && <Stamp top="全国" bottom="1位" />}

              {entry.kind === "ward" ? (
                <p className="ticket__lead">政令指定都市の区は、市全体と重なるため全国の比較に含めていません。</p>
              ) : national.status === "loading" ? (
                <p className="ticket__lead">全国のデータを読み込んでいます…</p>
              ) : national.status === "error" ? (
                <p className="ticket__lead">{national.message}</p>
              ) : (
                <ol className="ticket__traits" aria-label="このまちの目立つところ">
                  {traits.map((trait) => (
                    <li key={trait.key} data-top={trait.rank === 1 && trait.scope === "national"}>
                      <span className="ticket__phrase">{trait.phrase}</span>
                      <span className="ticket__label">
                        {trait.label}
                        <small>{trait.period}</small>
                      </span>
                      <strong className="ticket__value">{trait.valueText}</strong>
                    </li>
                  ))}
                </ol>
              )}

              <footer className="ticket__actions">
                <a
                  className="pop-button pop-button--plain"
                  {...link({ view: "area", areaCode: entry.code, tab: "overview", compare: [] })}
                >
                  このまちをくわしく見る
                </a>
                {rows && entry.kind !== "ward" && (
                  <ShareButtons
                    pop
                    filename={`machikuji-${entry.code}.png`}
                    text={shareText}
                    card={() => ({
                      kind: "kuji",
                      code: entry.code,
                      prefName,
                      name: areaLocalName(entry),
                      profile,
                      traits: traits.map((trait) => ({
                        phrase: trait.phrase,
                        label: trait.label,
                        value: trait.valueText,
                        period: trait.period
                      })),
                      stamp: nationalFirst,
                      sources: cardSources(manifest, {
                        furusato: traits.some((trait) => trait.key.startsWith("furusato"))
                      })
                    })}
                  />
                )}
              </footer>
            </>
          )}
        </div>
      </article>
      <p className="visually-hidden" role="status">
        {rolling === null && entry ? `${fullName}を引きました。` : ""}
      </p>

      {zukan.enabled ? (
        <p className="kuji__zukan">
          <a {...link(ZUKAN_HOME)}>
            まち図鑑 <strong>{formatNumber(zukanCount)}</strong> / {formatNumber(referenceTotal)}
          </a>
          引いたまちは、この端末の図鑑に記録しています。
        </p>
      ) : (
        <div className="kuji__zukan">
          <p>図鑑をはじめると、引いたまちをこの端末に記録して、47都道府県の制覇をめざせます。</p>
          <button type="button" className="pop-button pop-button--plain" onClick={onEnableZukan}>
            図鑑をはじめる
          </button>
        </div>
      )}

      {!zukan.enabled && drawnEntries.length > 0 && (
        <section className="kuji__log" aria-labelledby="kuji-log-title">
          <h3 id="kuji-log-title">
            このページで引いたまち <span>{formatNumber(drawnEntries.length)}</span>
            <small>（47都道府県のうち{drawnPrefs}）</small>
          </h3>
          <ol>
            {drawnEntries.map((item) => (
              <li key={item.code}>
                <a
                  {...link({ view: "kuji", areaCode: item.code, prefCode: route.prefCode })}
                  aria-current={item.code === route.areaCode ? "true" : undefined}
                >
                  <small>{prefNames.get(item.prefCode)}</small>
                  {areaLocalName(item)}
                </a>
              </li>
            ))}
          </ol>
          <p className="kuji__note">
            図鑑をはじめないかぎり、このページを閉じると消えます（ブラウザにも保存しません）。
          </p>
        </section>
      )}

      <ul className="notes">
        <li>
          政令指定都市の区を除く市区町村から、同じ確率で1つを選びます。選んだ結果はページのアドレス（#
          以降）に入り、どこにも送信しません。
        </li>
        <li>
          目立つところは、決まった規則で選びます。全国で上位・下位10位以内、都道府県の中で最も大きい・小さい、全国で上位・下位5%以内、都道府県の中で3位以内の順に、同じ値の市区町村も数えて選びます。良し悪しを表すものではありません。
        </li>
        <li>
          人口の少ない市区町村で大きく動く項目（婚姻率など）は、人口1万人以上の市区町村の中で比べています。ふるさと納税の受入額のような総額の項目は、多い側だけを示します。
        </li>
      </ul>
    </div>
  );
}

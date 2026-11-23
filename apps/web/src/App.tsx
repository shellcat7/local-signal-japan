import { useCallback, useEffect, useRef, type RefObject } from "react";
import {
  areaFullName,
  findAreaEntry,
  formatNumber,
  type AreaIndex,
  type AreaRecord,
  type Manifest,
  type PrefectureFile
} from "@local-signal-japan/core";
import { AreaDashboard } from "./components/AreaDashboard";
import { Footer } from "./components/Footer";
import { Landing } from "./components/Landing";
import { ScreenerView } from "./components/ScreenerView";
import { SearchBox } from "./components/SearchBox";
import { TopBar } from "./components/TopBar";
import { loadAreaIndex, loadManifest, loadNational, loadPrefecture } from "./lib/data";
import { useRoute, type AreaRoute, type RankingRoute, type Route, type TabId } from "./lib/route";
import { SITE_NAME } from "./lib/site";
import { useAsync } from "./lib/useAsync";

type LoadedArea = { area: AreaRecord | null; prefecture: PrefectureFile };

async function loadDataset() {
  const manifest = await loadManifest();
  return { manifest, index: await loadAreaIndex(manifest) };
}

const notFoundMessage = (areaCode: string) =>
  `市区町村コード ${areaCode} のデータは収録されていません。上の検索欄からさがしてください。`;

function Status({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="container">
      <div className="status" role={onRetry ? "alert" : "status"}>
        <p>{message}</p>
        {onRetry && (
          <button type="button" className="button" onClick={onRetry}>
            再読み込み
          </button>
        )}
      </div>
    </div>
  );
}

type AreaSectionProps = {
  route: AreaRoute;
  manifest: Manifest;
  index: AreaIndex;
  focusRequestRef: RefObject<boolean>;
  onTabChange: (tab: TabId) => void;
  onCompareChange: (codes: string[]) => void;
  onSelectArea: (areaCode: string) => void;
  onOpenRanking: (route: RankingRoute) => void;
};

function AreaSection({
  route,
  manifest,
  index,
  focusRequestRef,
  onTabChange,
  onCompareChange,
  onSelectArea,
  onOpenRanking
}: AreaSectionProps) {
  const { areaCode } = route;
  const load = useCallback(async (): Promise<LoadedArea> => {
    const prefecture = await loadPrefecture(areaCode.slice(0, 2), manifest);
    return { prefecture, area: prefecture.areas.find((candidate) => candidate.code === areaCode) ?? null };
  }, [areaCode, manifest]);
  const [state, retry] = useAsync(load);

  // 読み込み中は、直前に表示していた市区町村があればそれを保ったままにする。
  const loaded =
    state.status === "ready"
      ? state.value
      : state.status === "loading" && state.previous?.area
        ? state.previous
        : undefined;
  const areaName = loaded?.area ? areaFullName(loaded.area) : null;

  useEffect(() => {
    document.title = areaName ? `${areaName} | ${SITE_NAME}` : SITE_NAME;
    return () => {
      document.title = SITE_NAME;
    };
  }, [areaName]);

  if (state.status === "error") {
    return <Status message={state.message} onRetry={retry} />;
  }

  if (!loaded) {
    return <Status message="市区町村のデータを読み込んでいます…" />;
  }

  if (!loaded.area) {
    return <Status message={notFoundMessage(areaCode)} />;
  }

  return (
    <AreaDashboard
      area={loaded.area}
      prefecture={loaded.prefecture}
      manifest={manifest}
      index={index}
      tab={route.tab}
      // 共有されたURLに収録外のコードが混ざっていても、比較の枠を使わせない。
      compare={route.compare.filter((code) => findAreaEntry(index, code) !== undefined)}
      busy={state.status === "loading"}
      focusRequestRef={focusRequestRef}
      onTabChange={onTabChange}
      onCompareChange={onCompareChange}
      onSelectArea={onSelectArea}
      onOpenRanking={onOpenRanking}
    />
  );
}

type RankingSectionProps = {
  route: RankingRoute;
  manifest: Manifest;
  index: AreaIndex;
  onChange: (route: RankingRoute) => void;
  onOpenArea: (areaCode: string) => void;
};

function RankingSection({ route, manifest, index, onChange, onOpenArea }: RankingSectionProps) {
  const load = useCallback(() => loadNational(manifest), [manifest]);
  const [national, retry] = useAsync(load);

  useEffect(() => {
    document.title = `条件でさがす | ${SITE_NAME}`;
    return () => {
      document.title = SITE_NAME;
    };
  }, []);

  return (
    <>
      <header className="container page-head">
        <h2>条件でさがす</h2>
        <p>
          全国{formatNumber(manifest.counts.referenceAreas)}
          市区町村から、条件に合うものをすべて並べます（政令指定都市の区は、市全体と重なるため除いています）。
        </p>
      </header>
      {national.status === "error" && <Status message={national.message} onRetry={retry} />}
      {national.status === "loading" && <Status message="全国のデータを読み込んでいます…" />}
      {national.status === "ready" && (
        <ScreenerView
          route={route}
          national={national.value}
          index={index}
          manifest={manifest}
          onChange={onChange}
          onOpenArea={onOpenArea}
        />
      )}
    </>
  );
}

type HomeSectionProps = {
  manifest: Manifest;
  index: AreaIndex;
  onOpenArea: (areaCode: string) => void;
  onOpenRanking: (route: RankingRoute) => void;
};

function HomeSection({ manifest, index, onOpenArea, onOpenRanking }: HomeSectionProps) {
  const load = useCallback(() => loadNational(manifest), [manifest]);
  const [national] = useAsync(load);

  return (
    <div className="container home">
      <Landing
        manifest={manifest}
        index={index}
        national={national}
        onOpenArea={onOpenArea}
        onOpenRanking={onOpenRanking}
      />
    </div>
  );
}

export function App() {
  const [route, navigate] = useRoute();
  const [dataset] = useAsync(loadDataset);
  const focusRequestRef = useRef(false);
  const mainRef = useRef<HTMLElement>(null);

  const ready = dataset.status === "ready" ? dataset.value : null;

  // 検索・例のボタン・比較表・ランキングのどこから選んでも、切り替え後は見出しへフォーカスを移す。
  const selectArea = (areaCode: string) => {
    if (route.view !== "area") {
      focusRequestRef.current = true;
      navigate({ view: "area", areaCode, tab: "overview", compare: [] });
      return;
    }

    // すでに表示中の市区町村を選び直した場合は切り替わらないので、フォーカス移動も予約しない。
    focusRequestRef.current = areaCode !== route.areaCode;
    // 比較に並べていた市区町村を開いたときは、いま見ている市区町村と入れ替える。
    const compare = route.compare.includes(areaCode)
      ? [route.areaCode, ...route.compare.filter((code) => code !== areaCode)]
      : route.compare;
    navigate({ view: "area", areaCode, tab: route.tab, compare });
  };

  const openRanking = (target: RankingRoute) => {
    navigate(target);
    window.scrollTo({ top: 0 });
    // 押したリンクは画面から消えるので、読み上げ位置を本文の先頭へ移す。
    mainRef.current?.focus({ preventScroll: true });
  };

  const goTo = (target: Route) => {
    navigate(target);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="app">
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          // ハッシュは表示状態に使っているので、書き換えずにフォーカスだけ移す。
          event.preventDefault();
          mainRef.current?.focus();
        }}
      >
        本文へ移動
      </a>

      <TopBar
        route={route}
        onNavigate={goTo}
        search={
          ready ? (
            <SearchBox
              index={ready.index}
              onSelect={selectArea}
              variant="bar"
              clearOnSelect
              shortcut
              focusOnMount={route.view === "home"}
            />
          ) : null
        }
      />

      <main id="main" tabIndex={-1} ref={mainRef}>
        {dataset.status === "loading" && <Status message="データを読み込んでいます…" />}
        {/* 全体のデータを読めなかったときは、古いスクリプトが残っている可能性もあるのでページごと読み直す。 */}
        {dataset.status === "error" && <Status message={dataset.message} onRetry={() => window.location.reload()} />}
        {ready && route.view === "home" && (
          <HomeSection
            manifest={ready.manifest}
            index={ready.index}
            onOpenArea={selectArea}
            onOpenRanking={openRanking}
          />
        )}
        {ready && route.view === "ranking" && (
          <RankingSection
            route={route}
            manifest={ready.manifest}
            index={ready.index}
            onChange={(next) => navigate(next, { replace: true })}
            onOpenArea={selectArea}
          />
        )}
        {ready &&
          route.view === "area" &&
          (findAreaEntry(ready.index, route.areaCode) ? (
            <AreaSection
              route={route}
              manifest={ready.manifest}
              index={ready.index}
              focusRequestRef={focusRequestRef}
              onTabChange={(tab) => navigate({ ...route, tab }, { replace: true })}
              onCompareChange={(compare) => navigate({ ...route, compare }, { replace: true })}
              onSelectArea={selectArea}
              onOpenRanking={openRanking}
            />
          ) : (
            // 一覧にないコードは、存在しない都道府県のファイルを取りに行く前にここで止める。
            <Status message={notFoundMessage(route.areaCode)} />
          ))}
      </main>

      <Footer manifest={ready?.manifest ?? null} />
    </div>
  );
}

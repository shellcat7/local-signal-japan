import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  areaFullName,
  drawArea,
  findAreaEntry,
  findTopic,
  formatNumber,
  type AreaIndex,
  type AreaRecord,
  type Manifest,
  type PrefectureFile
} from "@local-signal-japan/core";
import { AreaDashboard } from "./components/AreaDashboard";
import { Footer } from "./components/Footer";
import { KujiView } from "./components/KujiView";
import { Landing } from "./components/Landing";
import { PlayHeader } from "./components/PlayHeader";
import { QuizView } from "./components/QuizView";
import { ZukanView } from "./components/ZukanView";
import { ScreenerView } from "./components/ScreenerView";
import { TopicsView } from "./components/TopicsView";
import { SearchBox } from "./components/SearchBox";
import { TopBar } from "./components/TopBar";
import { loadAreaIndex, loadManifest, loadNational, loadPrefecture } from "./lib/data";
import {
  hrefOf,
  useRoute,
  type AreaRoute,
  type KujiRoute,
  type QuizRoute,
  type RankingRoute,
  type Route,
  type TabId
} from "./lib/route";
import { SITE_NAME } from "./lib/site";
import { useAsync } from "./lib/useAsync";
import { addCode, clearZukan, EMPTY_ZUKAN, readZukan, writeZukan, type Zukan } from "./lib/zukan";

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
  onOpenTopics: () => void;
};

function RankingSection({ route, manifest, index, onChange, onOpenArea, onOpenTopics }: RankingSectionProps) {
  const load = useCallback(() => loadNational(manifest), [manifest]);
  const [national, retry] = useAsync(load);
  const topic = findTopic(route.topic);
  const title = topic ? topic.title : "条件でさがす";

  useEffect(() => {
    document.title = `${title} | ${SITE_NAME}`;
    return () => {
      document.title = SITE_NAME;
    };
  }, [title]);

  return (
    <>
      <header className="container page-head">
        {topic ? (
          <>
            <p className="page-head__kicker">
              <a
                href={hrefOf({ view: "topics" })}
                onClick={(event) => {
                  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  onOpenTopics();
                }}
              >
                特集
              </a>
            </p>
            <h2>{topic.title}</h2>
            <p>{topic.lead}</p>
          </>
        ) : (
          <>
            <h2>条件でさがす</h2>
            <p>
              全国{formatNumber(manifest.counts.referenceAreas)}
              市区町村から、条件に合うものをすべて並べます（政令指定都市の区は、市全体と重なるため除いています）。
            </p>
          </>
        )}
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

type TopicsSectionProps = {
  manifest: Manifest;
  index: AreaIndex;
  onOpenArea: (areaCode: string) => void;
  onOpenRanking: (route: RankingRoute) => void;
};

function TopicsSection({ manifest, index, onOpenArea, onOpenRanking }: TopicsSectionProps) {
  const load = useCallback(() => loadNational(manifest), [manifest]);
  const [national, retry] = useAsync(load);

  useEffect(() => {
    document.title = `特集 | ${SITE_NAME}`;
    return () => {
      document.title = SITE_NAME;
    };
  }, []);

  return (
    <>
      <header className="container page-head">
        <h2>特集</h2>
        <p>決まった条件で並べた、全国の市区町村の一覧です。</p>
      </header>
      {national.status === "error" && <Status message={national.message} onRetry={retry} />}
      {national.status === "loading" && <Status message="全国のデータを読み込んでいます…" />}
      {national.status === "ready" && (
        <TopicsView
          national={national.value}
          index={index}
          manifest={manifest}
          onOpenArea={onOpenArea}
          onOpenRanking={onOpenRanking}
        />
      )}
    </>
  );
}

/** あそぶ画面の共通の枠（黄色の地と、まちくじ・まちクイズ・まち図鑑の切り替え）。 */
function PlayFrame({
  current,
  title,
  lead,
  onNavigate,
  children
}: {
  current: "kuji" | "quiz" | "zukan";
  title: string;
  lead: string;
  onNavigate: (route: Route) => void;
  children: ReactNode;
}) {
  return (
    <div className="play">
      <div className="container">
        <PlayHeader current={current} title={title} lead={lead} onNavigate={onNavigate} />
        {children}
      </div>
    </div>
  );
}

function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} | ${SITE_NAME}`;
    return () => {
      document.title = SITE_NAME;
    };
  }, [title]);
}

type KujiSectionProps = {
  route: KujiRoute;
  manifest: Manifest;
  index: AreaIndex;
  drawn: readonly string[];
  zukan: Zukan;
  pendingReveal: string | null;
  onRevealed: () => void;
  onDraw: (prefCode: string | null) => void;
  onChangePref: (prefCode: string | null) => void;
  onEnableZukan: () => void;
  onNavigate: (route: Route) => void;
};

function KujiSection({ manifest, ...props }: KujiSectionProps) {
  const load = useCallback(() => loadNational(manifest), [manifest]);
  const [national] = useAsync(load);
  const entry = props.route.areaCode ? findAreaEntry(props.index, props.route.areaCode) : undefined;
  const revealed = entry && props.pendingReveal !== entry.code;
  usePageTitle(revealed ? `まちくじ：${entry.prefName} ${entry.parentName ?? ""}${entry.name}` : "まちくじ");

  return (
    <PlayFrame
      current="kuji"
      title="まちくじ"
      lead="ボタンを押すと、全国のどこかのまちが出ます。そのまちが全国や都道府県の中で目立つところを読んでみましょう。"
      onNavigate={props.onNavigate}
    >
      <KujiView manifest={manifest} national={national} {...props} />
    </PlayFrame>
  );
}

type QuizSectionProps = {
  route: QuizRoute;
  manifest: Manifest;
  index: AreaIndex;
  answers: Readonly<Record<string, ReadonlyArray<number | null>>>;
  onAnswer: (seed: string, question: number, choice: number) => void;
  onNavigate: (route: Route, options?: { replace?: boolean }) => void;
};

function QuizSection({ manifest, ...props }: QuizSectionProps) {
  const load = useCallback(() => loadNational(manifest), [manifest]);
  const [national] = useAsync(load);
  usePageTitle("まちクイズ");

  return (
    <PlayFrame
      current="quiz"
      title="まちクイズ"
      lead="公的統計から作った4択の5問。日替わりの問題は、同じ日ならだれでも同じです。"
      onNavigate={props.onNavigate}
    >
      <QuizView manifest={manifest} national={national} {...props} />
    </PlayFrame>
  );
}

type ZukanSectionProps = {
  manifest: Manifest;
  index: AreaIndex;
  zukan: Zukan;
  drawn: readonly string[];
  onEnable: () => void;
  onClear: () => void;
  onNavigate: (route: Route) => void;
};

function ZukanSection(props: ZukanSectionProps) {
  usePageTitle("まち図鑑");
  return (
    <PlayFrame
      current="zukan"
      title="まち図鑑"
      lead="まちくじで引いたまちを集めます。47都道府県の、全部のまちを集めたら制覇です。"
      onNavigate={props.onNavigate}
    >
      <ZukanView {...props} />
    </PlayFrame>
  );
}

type HomeSectionProps = {
  manifest: Manifest;
  index: AreaIndex;
  onOpenArea: (areaCode: string) => void;
  onOpenRanking: (route: RankingRoute) => void;
  onOpenTopics: () => void;
  onDrawKuji: () => void;
  onNavigate: (route: Route) => void;
  zukan: Zukan;
};

function HomeSection({
  manifest,
  index,
  onOpenArea,
  onOpenRanking,
  onOpenTopics,
  onDrawKuji,
  onNavigate,
  zukan
}: HomeSectionProps) {
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
        onOpenTopics={onOpenTopics}
        onDrawKuji={onDrawKuji}
        onNavigate={onNavigate}
        zukan={zukan}
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
  // まちくじで引いた市区町村（新しい順）。このページを開いている間だけ持つ。
  const [drawn, setDrawn] = useState<string[]>([]);
  // まち図鑑。利用者が「図鑑をはじめる」を押したときだけ、この端末のブラウザに保存する。
  const [zukan, setZukan] = useState<Zukan>(readZukan);
  const [pendingReveal, setPendingReveal] = useState<string | null>(null);
  const clearReveal = useCallback(() => setPendingReveal(null), []);
  // まちクイズの答え（シードごと）。このページを開いている間だけ持ち、保存しない。
  const [quizAnswers, setQuizAnswers] = useState<Record<string, Array<number | null>>>({});

  const enableZukan = () => {
    const codes = [...new Set([...drawn, ...zukan.codes])];
    writeZukan(codes);
    setZukan({ enabled: true, codes });
  };
  const stopZukan = () => {
    clearZukan();
    setZukan(EMPTY_ZUKAN);
  };
  const answerQuiz = (seed: string, question: number, choice: number) => {
    setQuizAnswers((previous) => {
      const picks = [...(previous[seed] ?? [])];
      if (picks[question] !== undefined && picks[question] !== null) return previous;
      picks[question] = choice;
      return { ...previous, [seed]: picks };
    });
  };

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

  const drawKuji = (prefCode: string | null) => {
    if (!ready) return;
    const picked = drawArea(ready.index.areas, {
      prefCode,
      exclude: route.view === "kuji" ? route.areaCode : null
    });
    if (!picked) return;
    setDrawn((previous) => addCode(previous, picked.code));
    if (zukan.enabled) {
      const codes = addCode(zukan.codes, picked.code);
      writeZukan(codes);
      setZukan({ enabled: true, codes });
    }
    setPendingReveal(picked.code);
    if (route.view === "kuji") {
      navigate({ view: "kuji", areaCode: picked.code, prefCode });
      return;
    }
    // ほかの画面から引いたときは、ページの先頭から見せる。
    goTo({ view: "kuji", areaCode: picked.code, prefCode });
    mainRef.current?.focus({ preventScroll: true });
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
            onOpenTopics={() => goTo({ view: "topics" })}
            onDrawKuji={() => drawKuji(null)}
            onNavigate={goTo}
            zukan={zukan}
          />
        )}
        {ready && route.view === "kuji" && (
          <KujiSection
            route={route}
            manifest={ready.manifest}
            index={ready.index}
            drawn={drawn}
            zukan={zukan}
            pendingReveal={pendingReveal}
            onRevealed={clearReveal}
            onDraw={drawKuji}
            onChangePref={(prefCode) => navigate({ ...route, prefCode }, { replace: true })}
            onEnableZukan={enableZukan}
            onNavigate={goTo}
          />
        )}
        {ready && route.view === "quiz" && (
          <QuizSection
            route={route}
            manifest={ready.manifest}
            index={ready.index}
            answers={quizAnswers}
            onAnswer={answerQuiz}
            onNavigate={(next, options) => (options?.replace ? navigate(next, options) : goTo(next))}
          />
        )}
        {ready && route.view === "zukan" && (
          <ZukanSection
            manifest={ready.manifest}
            index={ready.index}
            zukan={zukan}
            drawn={drawn}
            onEnable={enableZukan}
            onClear={stopZukan}
            onNavigate={goTo}
          />
        )}
        {ready && route.view === "topics" && (
          <TopicsSection
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
            onOpenTopics={() => goTo({ view: "topics" })}
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

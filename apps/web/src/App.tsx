import { useCallback, useEffect, useRef, type RefObject } from "react";
import {
  areaFullName,
  findAreaEntry,
  formatDate,
  type AreaRecord,
  type Manifest,
  type PrefectureFile
} from "@local-signal-japan/core";
import { AreaDashboard } from "./components/AreaDashboard";
import { Footer } from "./components/Footer";
import { Landing } from "./components/Landing";
import { SearchBox } from "./components/SearchBox";
import { loadAreaIndex, loadManifest, loadPrefecture } from "./lib/data";
import { useRoute, type TabId } from "./lib/route";
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
    <div className="status" role={onRetry ? "alert" : "status"}>
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="button" onClick={onRetry}>
          再読み込み
        </button>
      )}
    </div>
  );
}

type AreaSectionProps = {
  areaCode: string;
  tab: TabId;
  manifest: Manifest;
  focusRequestRef: RefObject<boolean>;
  onTabChange: (tab: TabId) => void;
  onSelectArea: (areaCode: string) => void;
};

function AreaSection({ areaCode, tab, manifest, focusRequestRef, onTabChange, onSelectArea }: AreaSectionProps) {
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
      tab={tab}
      busy={state.status === "loading"}
      focusRequestRef={focusRequestRef}
      onTabChange={onTabChange}
      onSelectArea={onSelectArea}
    />
  );
}

export function App() {
  const [route, navigate] = useRoute();
  const [dataset] = useAsync(loadDataset);
  const focusRequestRef = useRef(false);
  const mainRef = useRef<HTMLElement>(null);

  const manifest = dataset.status === "ready" ? dataset.value.manifest : null;

  // 検索・例のボタン・比較表のどこから選んでも、切り替え後は見出しへフォーカスを移す。
  const selectArea = (areaCode: string) => {
    // すでに表示中の市区町村を選び直した場合は切り替わらないので、フォーカス移動も予約しない。
    focusRequestRef.current = areaCode !== route.areaCode;
    navigate({ areaCode, tab: route.areaCode ? route.tab : "overview" });
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

      <header className="site-header">
        <div className="site-header__brand">
          <h1>
            <a
              href="./"
              onClick={(event) => {
                // 新しいタブで開く操作(修飾キーつきのクリック)は、ブラウザに任せる。
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                navigate({ areaCode: null, tab: "overview" });
              }}
            >
              {SITE_NAME}
            </a>
          </h1>
          <p>市区町村の公開統計を、出典・基準時点・欠損の注記ごと確認する</p>
        </div>
        {manifest && (
          <p className="site-header__meta">
            全国{manifest.counts.areas.toLocaleString("ja-JP")}市区町村・データ取得日 {formatDate(manifest.generatedAt)}
          </p>
        )}
      </header>

      <main id="main" tabIndex={-1} ref={mainRef}>
        {dataset.status === "loading" && <Status message="データを読み込んでいます…" />}
        {/* 全体のデータを読めなかったときは、古いスクリプトが残っている可能性もあるのでページごと読み直す。 */}
        {dataset.status === "error" && <Status message={dataset.message} onRetry={() => window.location.reload()} />}
        {dataset.status === "ready" && (
          <>
            <SearchBox index={dataset.value.index} onSelect={selectArea} />
            {route.areaCode === null ? (
              <Landing manifest={dataset.value.manifest} index={dataset.value.index} onSelect={selectArea} />
            ) : !findAreaEntry(dataset.value.index, route.areaCode) ? (
              // 一覧にないコードは、存在しない都道府県のファイルを取りに行く前にここで止める。
              <Status message={notFoundMessage(route.areaCode)} />
            ) : (
              <AreaSection
                areaCode={route.areaCode}
                tab={route.tab}
                manifest={dataset.value.manifest}
                focusRequestRef={focusRequestRef}
                onTabChange={(tab) => navigate({ areaCode: route.areaCode, tab }, { replace: true })}
                onSelectArea={selectArea}
              />
            )}
          </>
        )}
      </main>

      <Footer manifest={manifest} />
    </div>
  );
}

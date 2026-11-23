import { DISCLAIMER, formatDateWithEra, type Manifest } from "@local-signal-japan/core";
import { APP_VERSION, DOCS_URL, PROJECT_NAME, REPOSITORY_URL, SITE_NAME } from "../lib/site";

export function Footer({ manifest }: { manifest: Manifest | null }) {
  return (
    <footer className="site-footer container">
      {manifest && (
        <div className="site-footer__source">
          <p>
            出典：
            <a href={manifest.source.url} target="_blank" rel="noreferrer">
              {manifest.source.name}
            </a>
            のデータを加工して作成（{formatDateWithEra(manifest.generatedAt)}取得）。利用規約：
            <a href={manifest.source.licenseUrl} target="_blank" rel="noreferrer">
              {manifest.source.license}
            </a>
          </p>
          {/* 統計ダッシュボードAPIの利用条件として求められているクレジット表示。文言は変更しない。 */}
          <p>{manifest.source.credit}</p>
          {manifest.additionalSources.map((source) => (
            <p key={source.id}>
              出典：
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.name}
              </a>
              を加工して作成。利用規約：
              <a href={source.licenseUrl} target="_blank" rel="noreferrer">
                {source.license}
              </a>
            </p>
          ))}
          <p>
            地図：
            <a href="https://nlftp.mlit.go.jp/ksj/" target="_blank" rel="noreferrer">
              国土数値情報（行政区域データ）（国土交通省）
            </a>
            を加工して作成（CC BY 4.0）
          </p>
          <p>
            {SITE_NAME}は、{DISCLAIMER}
          </p>
        </div>
      )}
      <nav className="site-footer__links" aria-label="関連情報">
        <a href={`${DOCS_URL}/METHODOLOGY.md`} target="_blank" rel="noreferrer">
          算出方法
        </a>
        <a href={`${DOCS_URL}/DATA_SOURCES.md`} target="_blank" rel="noreferrer">
          データの出典
        </a>
        <a href={`${DOCS_URL}/PRIVACY.md`} target="_blank" rel="noreferrer">
          プライバシー
        </a>
        <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">
          ソースコード（GitHub）
        </a>
      </nav>
      <p className="site-footer__meta">
        {SITE_NAME}（{PROJECT_NAME}）v{APP_VERSION}・MIT License
      </p>
    </footer>
  );
}

import { formatDate, type Manifest } from "@local-signal-japan/core";
import { APP_VERSION, DOCS_URL, REPOSITORY_URL, SITE_NAME } from "../lib/site";

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
            のデータを加工して作成（データ取得日 {formatDate(manifest.generatedAt)}）。利用規約：
            <a href={manifest.source.licenseUrl} target="_blank" rel="noreferrer">
              {manifest.source.license}
            </a>
          </p>
          {/* 統計ダッシュボードAPIの利用条件として求められているクレジット表示。文言は変更しない。 */}
          <p>{manifest.source.credit}</p>
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
        {SITE_NAME} v{APP_VERSION}・MIT License
      </p>
    </footer>
  );
}

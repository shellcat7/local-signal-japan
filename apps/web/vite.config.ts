import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * 本番ビルドにだけ Content-Security-Policy を埋め込む。
 * meta 要素で指定するので、ヘッダーを設定できない静的ホスティングでも有効になる。
 * - スクリプトと通信先は同一オリジンのみ(外部への送信を仕組みとして禁止する)
 * - style 属性はグラフの位置指定に使うため許可する
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'"
].join("; ");

function contentSecurityPolicy(): Plugin {
  return {
    name: "content-security-policy",
    apply: "build",
    transformIndexHtml: () => [
      {
        tag: "meta",
        attrs: { "http-equiv": "Content-Security-Policy", content: CONTENT_SECURITY_POLICY },
        injectTo: "head-prepend"
      }
    ]
  };
}

export default defineConfig({
  // 相対パスで出力するので、ドメイン直下でもサブディレクトリでもそのまま配信できる。
  base: "./",
  plugins: [react(), contentSecurityPolicy()],
  build: {
    // 小さなファイルも data: に埋め込まず、ファイルとして配信する（data: の書体や画像は CSP で許可していない）。
    assetsInlineLimit: 0
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? "0.0.0")
  },
  server: {
    port: 5173
  },
  preview: {
    port: 4173
  }
});

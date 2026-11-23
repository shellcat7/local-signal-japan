# 公開（デプロイ）

公開するのは `apps/web/dist/` にできる静的なファイルだけです。サーバー側のプログラムも、APIキーなどの設定も要りません。ビルド成果物は相対パスで書き出しているので、ドメイン直下でもサブディレクトリでもそのまま配信できます。

```bash
pnpm install
pnpm build      # apps/web/dist/ に出力
pnpm preview    # http://127.0.0.1:4173/ で成果物を確認
```

## Cloudflare Pages（このリポジトリの構成）

このリポジトリは Cloudflare Pages の Git 連携で公開しています。GitHub 側にシークレットを置く必要はありません。

- **main へのマージ**で本番（`https://<プロジェクト名>.pages.dev`）が更新されます。
- **プルリクエストやブランチへの push** ごとに、プレビュー用のURLが作られます（プルリクエストにコメントで通知されます）。

### ビルド設定

Cloudflare のダッシュボードで、Pages プロジェクトの Settings > Build を次のようにします。

| 設定                   | 値                     |
| ---------------------- | ---------------------- |
| Framework preset       | None                   |
| Build command          | `pnpm build`           |
| Build output directory | `apps/web/dist`        |
| Root directory         | （リポジトリのルート） |

Node.js は 22.12 以上が必要です。環境変数 `PNPM_VERSION` を設定している場合は、`package.json` の `packageManager` と同じ版にそろえるか、削除してください。

### 配信時に効くファイル

`apps/web/public/` にある次のファイルは、ビルド成果物にそのまま入り、Cloudflare Pages が解釈します。

| ファイル     | 役割                                                     |
| ------------ | -------------------------------------------------------- |
| `_headers`   | セキュリティ関連のレスポンスヘッダーと、キャッシュの指定 |
| `_redirects` | 旧URL `/demo` からトップページへの転送                   |
| `404.html`   | 存在しないパスへの応答                                   |

### 手元からアップロードする

Git 連携を使わない場合は、ビルド成果物を直接アップロードできます。

```bash
pnpm build
pnpm dlx wrangler pages deploy apps/web/dist --project-name <プロジェクト名>
```

## GitHub Pages

Cloudflare を使わずに公開する場合の手順です。

1. リポジトリの Settings > Pages > Build and deployment > Source を **GitHub Actions** にします。
2. Actions タブで「GitHub Pages へ公開」ワークフローを手動実行します（[`deploy-pages.yml`](../.github/workflows/deploy-pages.yml)）。

`https://<ユーザー名>.github.io/<リポジトリ名>/` で公開されます。main への push のたびに公開したい場合は、ワークフローの `on:` に `push` を追加してください。

GitHub Pages では `_headers` と `_redirects` は効きません。Content-Security-Policy は `index.html` に埋め込んであるので、そのまま有効です。

## 公開したサイトの確認

ブラウザでの自動テストを、公開済みのURLに対して実行できます（URLの末尾は `/`）。プレビュー用のURLで実行すれば、マージ前に実際の配信で確認できます。

```bash
E2E_BASE_URL=https://<公開先のURL>/ pnpm test:e2e
```

## 公開前のチェックリスト

- [ ] `pnpm preflight` が通る（整形・Lint・型検査・テスト・秘密情報の検査・ビルド）
- [ ] `pnpm test:e2e` が通る（主要な操作、アクセシビリティ、外部通信をしないことの確認）
- [ ] フッターに、出典の記載と API 利用のクレジット表示が出ている
- [ ] フッターの「データ取得日」が想定どおり（古ければ `pnpm data:refresh`）
- [ ] フォークして公開する場合は、[`apps/web/src/lib/site.ts`](../apps/web/src/lib/site.ts) のリポジトリURLを自分のものに変える

## データの定期更新

「データ更新」ワークフロー（[`refresh-data.yml`](../.github/workflows/refresh-data.yml)）が毎月1回、統計ダッシュボード API から最新の統計を取得し、統計値に変更があればプルリクエストを作ります。マージすると本番に反映されます。

プルリクエストを自動作成させるには、Settings > Actions > General > Workflow permissions で **Allow GitHub Actions to create and approve pull requests** を有効にしてください。無効の場合は、ブランチの push までが行われます。

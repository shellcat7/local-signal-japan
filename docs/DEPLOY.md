# 公開（デプロイ）

公開するのは `apps/web/dist/` にできる静的なファイルだけです。サーバー側のプログラムも、APIキーなどの設定も要りません。ビルド成果物は相対パスで書き出しているので、ドメイン直下でもサブディレクトリでもそのまま配信できます。

```bash
pnpm install
pnpm build      # apps/web/dist/ に出力
pnpm preview    # http://127.0.0.1:4173/ で成果物を確認
```

配信先は次のどちらかを想定しています。

| 配信先       | 向いている場合                                           |
| ------------ | -------------------------------------------------------- |
| Cloudflare   | セキュリティ関連のレスポンスヘッダーまで付けたい（推奨） |
| GitHub Pages | いちばん手数を少なく公開したい                           |

## Cloudflare（Workers の静的アセット）

設定は [`apps/web/wrangler.jsonc`](../apps/web/wrangler.jsonc) にあります。Worker のコードは持たず、静的アセットだけを配信します。`apps/web/public/` にある次のファイルが有効になります。

- `_headers`: セキュリティ関連のヘッダーとキャッシュの指定
- `_redirects`: 旧URL `/demo` からトップページへの転送
- `404.html`: 存在しないパスへの応答

### 手元から公開する

```bash
pnpm --filter @local-signal-japan/web exec wrangler login   # 初回だけ
pnpm run deploy                                             # ビルドして公開
```

`https://local-signal-japan.<アカウントのサブドメイン>.workers.dev` で公開されます。Worker の名前は `wrangler.jsonc` の `name` で変えられます。

### Git 連携で自動公開する（Workers Builds）

Cloudflare のダッシュボードでリポジトリを接続すると、push のたびにビルドと公開が行われます。GitHub 側にシークレットを置く必要はありません。

1. ダッシュボードの Workers & Pages で、このリポジトリを取り込んで Worker を作ります。Worker の名前は `wrangler.jsonc` の `name`（`local-signal-japan`）と同じにします。
2. Settings > Build で次のように設定します。

   | 設定           | 値                          |
   | -------------- | --------------------------- |
   | Root directory | `/apps/web`                 |
   | Build command  | `pnpm build`                |
   | Deploy command | `pnpm exec wrangler deploy` |

依存パッケージは自動でインストールされます。pnpm の版は、リポジトリ直下の `package.json` の `packageManager` から決まります。Node.js は 22.12 以上が必要です（Workers Builds の既定の版で足ります）。

### 公開前の確認

設定の検査と、実際の配信に近い形での確認が手元でできます。

```bash
pnpm build
cd apps/web
pnpm exec wrangler deploy --dry-run   # 設定とアセットの検査だけ行う
pnpm exec wrangler dev                # ヘッダーや転送も含めてローカルで配信
```

## GitHub Pages

1. リポジトリの Settings > Pages > Build and deployment > Source を **GitHub Actions** にします。
2. Actions タブで「GitHub Pages へ公開」ワークフローを手動実行します（[`deploy-pages.yml`](../.github/workflows/deploy-pages.yml)）。

`https://<ユーザー名>.github.io/local-signal-japan/` で公開されます。main への push のたびに公開したい場合は、ワークフローの `on:` に `push` を追加してください。

GitHub Pages では `_headers` と `_redirects` は効きません。Content-Security-Policy は `index.html` に埋め込んであるので、そのまま有効です。

## 公開前のチェックリスト

- [ ] `pnpm preflight` が通る（整形・Lint・型検査・テスト・秘密情報の検査・ビルド）
- [ ] `pnpm test:e2e` が通る（主要な操作、アクセシビリティ、外部通信をしないことの確認）
- [ ] フッターに、出典の記載と API 利用のクレジット表示が出ている
- [ ] フッターの「データ取得日」が想定どおり（古ければ `pnpm data:refresh`）
- [ ] フォークして公開する場合は、[`apps/web/src/lib/site.ts`](../apps/web/src/lib/site.ts) のリポジトリURLを自分のものに変える

## データの定期更新

「データ更新」ワークフロー（[`refresh-data.yml`](../.github/workflows/refresh-data.yml)）が毎月1回、統計ダッシュボード API から最新の統計を取得し、統計値に変更があればプルリクエストを作ります。マージすると、Git 連携を設定していれば自動で公開されます。

プルリクエストを自動作成させるには、Settings > Actions > General > Workflow permissions で **Allow GitHub Actions to create and approve pull requests** を有効にしてください。無効の場合は、ブランチの push までが行われます。

# セキュリティ

## 脆弱性の報告

脆弱性を見つけた場合は、公開の Issue に詳細を書かず、GitHub の [Security Advisories](https://github.com/shellcat7/local-signal-japan/security/advisories/new)（Security タブの "Report a vulnerability"）から非公開で報告してください。

## 構成上の前提

- 公開するのは静的なファイルだけです。サーバー側のプログラム、データベース、認証はありません。
- 実行時に API キーや秘密情報を一切使いません。データの出典（統計ダッシュボード API）は利用登録不要です。
- 利用者の入力をサーバーに送りません（[プライバシー](docs/PRIVACY.md)を参照）。

## 対策

- **Content-Security-Policy**: 本番ビルドの `index.html` に埋め込み、スクリプトと通信先を同一オリジンに限定しています（`apps/web/vite.config.ts`）。
- **レスポンスヘッダー**: Cloudflare Pages で配信する場合、`apps/web/public/_headers` で `X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy`、`Permissions-Policy` などを付けます。
- **依存パッケージ**: インストール時スクリプトの実行は `pnpm-workspace.yaml` で許可したパッケージに限っています。Dependabot で更新を確認します。
- **GitHub Actions**: アクションはコミットハッシュで固定し、ワークフローの権限は必要最小限にしています。
- **秘密情報の混入検査**: `pnpm scan:secrets` で、`.env` などのファイルと認証情報らしい文字列がリポジトリに入っていないかを検査します（`pnpm preflight` に含まれます）。

## 秘密情報の扱い

将来 API キーが必要な出典に対応する場合も、キーはデータ取得の処理（GitHub Actions のシークレット）でだけ使い、ブラウザに配るファイルには含めません。キーや取得した生の応答をリポジトリにコミットしないでください。

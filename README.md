# Local Signal Japan

[![CI](https://github.com/shellcat7/local-signal-japan/actions/workflows/ci.yml/badge.svg)](https://github.com/shellcat7/local-signal-japan/actions/workflows/ci.yml)

全国の市区町村について、人口・高齢化・転入転出・事業所・雇用・所得・財政の公開統計を、出典・基準時点・欠損の注記ごと確認できるダッシュボードです。

_A dashboard for Japanese municipalities that shows official public statistics together with their sources, reference periods, and missing-data notes. All data comes from the Statistics Dashboard API of the Statistics Bureau of Japan (no API key required) and ships as a static dataset, so the site runs without any backend. The UI and documentation are in Japanese._

![南砺市の概要画面。総合補助スコア、人口、利用できる指標、信頼度メモと、指標ごとの補助スコアの内訳、公開統計から読み取れるシグナルが並ぶ](docs/images/overview.png)

## できること

- **さがす**: 市区町村名・よみがな・5桁の市区町村コードで検索（全国約1,900団体。政令指定都市の区を含む）
- **概要**: 7つの指標が全国の中でどの位置にあるかと、そこから規則的に書き出したシグナル・注意・欠損
- **指標**: 指標ごとの値、基準時点、時系列グラフ、算出方法、出典の系列と取得日
- **比較**: 同じ都道府県の中で、人口規模が近い市区町村との比較
- **レポート**: 同じ内容を Markdown でダウンロード・コピー

## 設計上の約束

- **出典と基準時点を必ず示す。** すべての値に、出典の統計名・系列コード・基準時点・取得日を添えます。各指標のリンクから、出典の値そのものを確認できます。
- **断定しない。** 「この地域は成長している／衰退している」といった判定はしません。補助スコアは全国の中での相対的な位置を示すだけです。
- **欠損を低い評価として扱わない。** 値がそろわない指標は「欠損」と表示して理由を添え、平均から除きます。
- **入力を保存・送信しない。** 検索はブラウザの中で完結します。サーバー側のプログラム、アクセス解析、Cookie はありません。外部への通信は Content-Security-Policy で禁止しています。
- **APIキーが要らない。** 出典は利用登録不要の API で、取得済みのデータをリポジトリに同梱しています。公開に必要な設定はありません。

## 収録している指標

| 指標       | 指標値                            | 元の統計                               |
| ---------- | --------------------------------- | -------------------------------------- |
| 人口       | 5年間の人口増減率                 | 住民基本台帳人口（社会・人口統計体系） |
| 高齢化     | 高齢化率（65歳以上人口の割合）    | 国勢調査                               |
| 転入・転出 | 転入超過率（直近3年平均）         | 社会・人口統計体系                     |
| 事業所     | 人口千人当たりの民営事業所数      | 経済センサス                           |
| 雇用       | 完全失業率                        | 国勢調査（社会・人口統計体系）         |
| 所得       | 納税義務者1人当たりの課税対象所得 | 社会・人口統計体系                     |
| 財政       | 財政力指数                        | 社会・人口統計体系                     |

算出方法は [docs/METHODOLOGY.md](docs/METHODOLOGY.md)、系列コードと取得のしかたは [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) にあります。

## はじめかた

Node.js 22.12 以上が必要です。pnpm は Corepack 経由で使います。

```bash
corepack enable
```

```bash
pnpm install
```

```bash
pnpm dev
```

<http://127.0.0.1:5173/> を開きます。データは同梱済みなので、そのまま動きます。

Windows で `corepack enable` が権限エラーになる場合は、`npm install -g pnpm@10` で pnpm を入れてから `pnpm install` を実行してください。

## CLI

同梱データセットを、コマンドラインから検索・表示・レポート出力できます。

```bash
pnpm localsignal search 府中
```

```bash
pnpm localsignal show 13101
```

```bash
pnpm localsignal report 横浜市青葉区 --out report.md
```

`show --json` で、画面と同じ表示用データを JSON で出力します。

## データの更新

```bash
pnpm data:refresh
```

統計ダッシュボード API から最新の統計を取得し、`apps/web/public/data/` を作り直します（APIキー不要、1分ほど）。GitHub Actions の「データ更新」ワークフローが毎月これを実行し、統計値に変更があればプルリクエストを作ります。

## 公開

```bash
pnpm build
```

`apps/web/dist/` を静的ファイルとして配信するだけです。Cloudflare と GitHub Pages への公開手順は [docs/DEPLOY.md](docs/DEPLOY.md) にあります。

## 開発

```bash
pnpm preflight
```

整形・Lint・型検査・単体テスト・同梱データセットの検査・秘密情報の検査・ビルドをまとめて実行します。

```bash
pnpm exec playwright install chromium
```

```bash
pnpm test:e2e
```

ブラウザでの動作確認です（主要な操作、アクセシビリティ、横はみ出し、外部通信をしないこと）。

構成と設計判断は [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) にまとめています。

| 場所               | 役割                                                              |
| ------------------ | ----------------------------------------------------------------- |
| `apps/web`         | 画面（React + Vite）。`public/data/` に同梱データセット           |
| `apps/cli`         | CLI                                                               |
| `packages/core`    | 指標の定義、補助スコア、シグナルの文章、レポート、検索            |
| `packages/dataset` | 統計ダッシュボード API からの取得と、データセットの組み立て・検査 |
| `e2e`              | ブラウザでの動作確認                                              |

## ドキュメント

- [算出方法](docs/METHODOLOGY.md)
- [データの出典](docs/DATA_SOURCES.md)
- [構成](docs/ARCHITECTURE.md)
- [公開（デプロイ）](docs/DEPLOY.md)
- [プライバシー](docs/PRIVACY.md)
- [セキュリティ](SECURITY.md)
- [ロードマップ](docs/ROADMAP.md)
- [変更履歴](CHANGELOG.md)

## 出典とクレジット

出典：[統計ダッシュボード](https://dashboard.e-stat.go.jp/)（総務省統計局）のデータを加工して作成

このサービスは、統計ダッシュボードのAPI機能を使用していますが、サービスの内容は国によって保証されたものではありません。

統計データは[公共データ利用規約（第1.0版）](https://dashboard.e-stat.go.jp/static/terms)に基づいて利用しています。派生物を公開するときも、上の出典の記載とクレジット表示を残してください。

## ライセンス

ソースコードは [MIT License](LICENSE) です。同梱している統計データには、上記の利用規約が適用されます。

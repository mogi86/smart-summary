# smart-summary

長文を「抽出 → 要約」の 2 段階で要約するツールです。抽出と要約は LLM（Gemini）で行い、
入力・抽出結果・要約を DynamoDB に保存します。

現在は local の CLI で動作します。画面、Slack 認証、AWS へのデプロイは未実装です。

## 必要なもの

- Node.js 24 以上
- Docker（DynamoDB Local 用）
- Gemini API キー

## セットアップ

```sh
npm install
cp .env.example .env   # GEMINI_API_KEY を設定する
npm run db:up          # DynamoDB Local を起動する
npm run db:init        # テーブルを作成する（初回のみ）
```

DynamoDB Local の中身は、ブラウザで http://localhost:8001 を開くと確認できます（dynamodb-admin）。

`.env` の設定項目:

| 変数                | 説明                                                      |
| ------------------- | --------------------------------------------------------- |
| `GEMINI_API_KEY`    | Gemini API キー                                           |
| `GEMINI_MODEL`      | 使用するモデル。未設定の場合は `gemini-3.5-flash-lite`    |
| `DYNAMODB_ENDPOINT` | DynamoDB Local の接続先。省略時は `http://localhost:8000` |

`.env` は git 管理対象外です。API キーなどの実値をコミットしないでください。

## 使い方

```sh
npm run cli -- summarize <file> [--title <title>]   # ファイルを要約する
npm run cli -- jobs                                 # ジョブ一覧を表示する
npm run cli -- show <jobId>                         # 抽出した要点と要約を表示する
```

`tmp/` は git 管理対象外の作業用ディレクトリです。要約したいファイルの置き場所に使えます。

## 処理の流れ

1. 入力テキストを保存する
2. 入力テキスト全文から LLM で要点を抽出して保存する
3. 抽出した要点から LLM で要約を生成して保存する

ジョブの状態は `pending → extracting → summarizing → completed`（失敗時は `failed`）と遷移します。

## ディレクトリ構成

オニオンアーキテクチャです。依存は外側から内側への一方向のみで、ESLint で強制しています。

```
app/src/
├── domain/           # エンティティ、リポジトリのインターフェース
├── application/      # ユースケース、LLM・ジョブ起動のポート
├── infrastructure/   # DynamoDB、Gemini、設定
└── presentation/     # CLI
docs/                 # Slack App 作成手順
tmp/                  # 作業用（git 管理対象外）
```

## 開発

```sh
npm test            # ユニットテスト
npm run typecheck
npm run lint
npm run format
npm run db:down     # DynamoDB Local を停止する
```

DynamoDB リポジトリの結合テストは、DynamoDB Local を起動したうえで接続先を指定すると実行されます。

```sh
DYNAMODB_ENDPOINT=http://localhost:8000 npm test
```

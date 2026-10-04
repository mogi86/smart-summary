# smart-summary

長文を「抽出 → 要約」の 2 段階で要約するツールです。抽出と要約は LLM（Gemini）で行い、
入力・抽出結果・要約を DynamoDB に保存します。

local では画面と CLI から使えます。AWS では Lambda の Function URL で画面を公開し、Slack でログインします。

## 必要なもの

- Node.js 24 以上
- Docker（DynamoDB Local 用）
- Gemini API キー
- Langfuse Cloud のアカウント（LLM 呼び出しのトレースの送信先）

## セットアップ

```sh
npm install
cp .env.example .env   # GEMINI_API_KEY と Langfuse のキーを設定する
npm run db:up          # DynamoDB Local を起動する
npm run db:init        # テーブルを作成する（初回のみ）
```

DynamoDB Local の中身は、ブラウザで http://localhost:8001 を開くと確認できます（dynamodb-admin）。

`.env` の設定項目:

| 変数                           | 説明                                                                |
| ------------------------------ | ------------------------------------------------------------------- |
| `GEMINI_API_KEY`               | Gemini API キー                                                     |
| `GEMINI_MODEL`                 | 使用するモデル。未設定の場合は `gemini-3.5-flash-lite`              |
| `LANGFUSE_PUBLIC_KEY`          | Langfuse のプロジェクトの Public Key                                |
| `LANGFUSE_SECRET_KEY`          | Langfuse のプロジェクトの Secret Key                                |
| `LANGFUSE_BASE_URL`            | Langfuse の接続先。日本リージョンは `https://jp.cloud.langfuse.com` |
| `LANGFUSE_TRACING_ENVIRONMENT` | Langfuse 上の環境名。local では `local`                             |
| `DYNAMODB_ENDPOINT`            | DynamoDB Local の接続先。省略時は `http://localhost:8000`           |

`.env` は git 管理対象外です。API キーなどの実値をコミットしないでください。

### Langfuse

LLM の呼び出し（入力・出力・トークン使用量）を [Langfuse Cloud](https://jp.cloud.langfuse.com) に送ります。
1 ジョブが 1 件のトレースになり、その中に抽出（`extract`）と要約（`summarize`）が記録されます。

- キーは Langfuse のプロジェクトの設定画面（Settings → API Keys）で発行します
- local と AWS は同じプロジェクト・同じキーを使い、環境名（`local` / `aws`）で区別します。
  Langfuse の画面では、上部の環境フィルタで切り替えます

## 使い方

### 画面

```sh
npm run dev
```

http://localhost:5173 を開きます。文章を貼り付けるかテキストファイルを読み込んで「要約する」を押すと、
抽出した要点と要約が表示されます。API サーバは http://localhost:3000 で起動し、画面からは `/api` 経由で呼び出します。

### CLI

```sh
npm run cli -- summarize <file> [--title <title>]   # ファイルを要約する
npm run cli -- jobs                                 # ジョブ一覧を表示する
npm run cli -- show <jobId>                         # 抽出した要点と要約を表示する
```

`tmp/` は git 管理対象外の作業用ディレクトリです。要約したいファイルの置き場所に使えます。

## AWS へのデプロイ

構成は Lambda（Web / Worker）+ Function URL + DynamoDB で、`infra/` の CDK で管理します。リージョンは ap-northeast-1 です。

### 1. シークレットを登録する

実値は SSM Parameter Store にだけ置きます。Slack の値の取得方法は [docs/slack-app-setup.md](docs/slack-app-setup.md) を参照してください。

まず、値をシェル変数に入れます。書き換えるのはこのブロックの `'...'` の中だけです。

```sh
GEMINI_API_KEY='...'          # Gemini API キー
LANGFUSE_PUBLIC_KEY='...'     # Langfuse の Public Key
LANGFUSE_SECRET_KEY='...'     # Langfuse の Secret Key
SLACK_CLIENT_ID='...'         # Slack App の Client ID
SLACK_CLIENT_SECRET='...'     # Slack App の Client Secret
SLACK_ALLOWED_TEAM_ID='...'   # ログインを許可するワークスペースの team ID
```

次に、同じターミナルで以下をそのまま実行します（書き換え不要）。

```sh
aws ssm put-parameter --region ap-northeast-1 --type SecureString --overwrite --name /smart-summary/gemini-api-key        --value "$GEMINI_API_KEY"
aws ssm put-parameter --region ap-northeast-1 --type SecureString --overwrite --name /smart-summary/langfuse/public-key   --value "$LANGFUSE_PUBLIC_KEY"
aws ssm put-parameter --region ap-northeast-1 --type SecureString --overwrite --name /smart-summary/langfuse/secret-key   --value "$LANGFUSE_SECRET_KEY"
aws ssm put-parameter --region ap-northeast-1 --type SecureString --overwrite --name /smart-summary/slack/client-id       --value "$SLACK_CLIENT_ID"
aws ssm put-parameter --region ap-northeast-1 --type SecureString --overwrite --name /smart-summary/slack/client-secret   --value "$SLACK_CLIENT_SECRET"
aws ssm put-parameter --region ap-northeast-1 --type SecureString --overwrite --name /smart-summary/slack/allowed-team-id --value "$SLACK_ALLOWED_TEAM_ID"
aws ssm put-parameter --region ap-northeast-1 --type SecureString --overwrite --name /smart-summary/session-secret        --value "$(openssl rand -base64 32)"
```

- 最後の `session-secret` はセッションの署名鍵で、ランダムな値をその場で生成して登録します
- 値を変更するときは、該当する行だけをもう一度実行します
- パラメータ名は `app/src/presentation/lambda/composition.ts` の `PARAMETERS` と対応しています

### 2. デプロイする

そのアカウント・リージョンで初めて CDK を使う場合のみ、先に bootstrap を実行します。

```sh
npx -w infra cdk bootstrap
```

デプロイ前に、AWS 上の現状との差分を確認します。

```sh
npm run diff
```

追加・変更・削除されるリソースと、IAM 権限の変更が表示されます。意図しない変更（特にテーブルの置き換えや削除）が
含まれていないことを確認してから、デプロイします。

```sh
npm run deploy
```

出力される `Url` が画面の URL です。

### 3. Slack App に Redirect URL を登録する

`<Url>/auth/slack/callback` を Slack App の Redirect URLs に登録します（[手順](docs/slack-app-setup.md)）。

### 認証

- ログインは Sign in with Slack で行い、`allowed-team-id` のワークスペース以外からのログインは拒否します
- 拒否した場合は、Web の Lambda のログに拒否したワークスペースの team ID が出ます
- Slack の Redirect URL は HTTPS 必須のため、local（`npm run dev`）では認証を行いません

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
├── application/      # ユースケース、LLM・ジョブ起動・トレースのポート
├── infrastructure/   # DynamoDB、Gemini、Langfuse、設定
└── presentation/     # CLI、HTTP API、Lambda ハンドラ
web/src/              # 画面（React）
infra/                # AWS CDK
docs/                 # Slack App 作成手順
tmp/                  # 作業用（git 管理対象外）
```

## 開発

```sh
npm test            # ユニットテスト
npm run build       # 画面のビルド
npm run synth       # CloudFormation テンプレートの生成（デプロイはしない）
npm run typecheck
npm run lint
npm run format
npm run db:down     # DynamoDB Local を停止する
```

DynamoDB リポジトリの結合テストは、DynamoDB Local を起動したうえで接続先を指定すると実行されます。

```sh
DYNAMODB_ENDPOINT=http://localhost:8000 npm test
```

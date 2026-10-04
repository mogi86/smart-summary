# smart-summary

長文を「抽出 → 要約」の 2 段階で要約するツール。抽出と要約は LLM（Gemini）で行い、
入力・抽出した要点・要約を DynamoDB に保存する。LLM の呼び出しは Langfuse Cloud にトレースとして送る。
個人利用のツールで、リリースはしない。

セットアップと使い方は `README.md` を参照。

## コマンド

```sh
npm run dev         # API サーバ（:3000）と画面（:5173）を起動
npm run cli -- summarize <file>
npm run db:up       # DynamoDB Local（:8000）と管理画面（:8001）を起動
npm run db:init     # local のテーブル作成
npm test
npm run typecheck
npm run lint
npm run format
npm run synth       # 画面をビルドして cdk synth
npm run diff        # 画面をビルドして cdk diff（デプロイ前に差分を確認する）
npm run deploy      # 画面をビルドして cdk deploy（実行前にユーザーへ確認すること）
```

DynamoDB リポジトリの結合テストは `DYNAMODB_ENDPOINT=http://localhost:8000 npm test` のときだけ実行される。

変更後は `npm run typecheck`、`npm run lint`、`npm test` を通すこと。
画面や CLI の挙動を変えた場合は、実際に動かして確認すること。

## 構成

npm workspaces。

```
app/     バックエンド（オニオンアーキテクチャ）
web/     画面（React + Vite + Tailwind CSS）
infra/   AWS CDK（アプリケーションコードとは分ける）
docs/    Slack App 作成手順
tmp/     作業用（.gitkeep 以外は git 管理対象外）
```

### app/src のレイヤ

| レイヤ            | 役割                                                                               |
| ----------------- | ---------------------------------------------------------------------------------- |
| `domain/`         | `SummaryJob`（状態遷移）、生成物の型、リポジトリのインターフェース                 |
| `application/`    | ユースケース、ポート（`Extractor` / `Summarizer` / `JobDispatcher` / `JobTracer`） |
| `infrastructure/` | DynamoDB、Gemini、Langfuse、ジョブ起動、設定                                       |
| `presentation/`   | CLI、HTTP API（Hono）、Lambda ハンドラ、依存の組み立て                             |

- 依存は外側から内側への一方向のみ（presentation / infrastructure → application → domain）。
  ESLint の `no-restricted-imports` で強制している
- インターフェースは、それを使うレイヤに定義する。実装は外側のレイヤ（infrastructure）に置く
  - ユースケースが使う外部機能（LLM、ジョブ起動、認証、トレース）は `application/ports/`
  - ドメインのモデルの保存・取得（`SummaryJobRepository`）は `domain/`
- `application/ports/` は独立したレイヤではなく、application レイヤの一部
- 依存の組み立ては presentation で行う。local 用は `localComposition.ts`、Lambda 用は `lambda/composition.ts`

### 処理の流れ

1. `SubmitSummaryJob`: 入力を保存してジョブを登録し、`JobDispatcher` に実行を依頼する
2. `RunSummaryJob`: 入力全文から要点を抽出 → 要点から要約を生成。各段階の結果を保存する
3. 状態は `pending → extracting → summarizing → completed`（失敗時は `failed`）

`JobDispatcher` は実行環境で差し替える。CLI は完了まで待ち、local の API サーバはバックグラウンドで実行する。
AWS では Web Lambda が Worker Lambda を非同期で呼び出す。

### DynamoDB

単一テーブル `smart-summary`（テーブル名は固定値）。

- `PK = JOB#<jobId>`、`SK = META | INPUT | EXTRACT | SUMMARY`
- 一覧用の GSI1: `GSI1PK = JOBS`、`GSI1SK = <createdAt>#<jobId>`
- キー構成を変える場合は、`createLocalTable.ts` と `infra/` の CDK 定義の両方を揃える

## 注意点

### 公開リポジトリ

このリポジトリは GitHub で public。次の値は git 管理下のファイルに書かない。

- API キー（Gemini、Langfuse）、Slack の Client ID / Secret、セッション署名鍵
- 許可する Slack ワークスペースの名前と team ID
- AWS アカウント ID、Function URL などの実 URL

実値は local では `.env`（git 管理対象外）、AWS では SSM Parameter Store に置く。
コードやドキュメントにはプレースホルダかパラメータ名だけを書く。

### 設計上の決定

- **チャンク分割はしない**。分割すると他の部分の文脈を知らないまま抽出することになるため、
  入力全文を 1 回で LLM に渡す。入力長の上限チェックも入れていない
- **過剰な作り込みをしない**。リリースしない個人ツールなので、起きていない問題への備え
  （上限チェック、環境の切り替え、設定項目の追加など）は足さない
- **設定は最小限**。環境は 1 つだけなので、テーブル名のように変える必要のない値は定数にする
- **local では実 AWS に接続しない**。CLI・local サーバ・テーブル作成は、`DYNAMODB_ENDPOINT` が
  未設定でも DynamoDB Local に接続する。共通の `createDynamoClient` は接続先の指定がなければ
  実 AWS に接続するので、local 用の入口では必ず接続先を渡す
- **既定モデルは `gemini-3.5-flash-lite`**。料金を優先して選んでいる。Gemini 2.5 系は新規プロジェクト
  からの利用が制限されているため使わない

### 認証

- Sign in with Slack（OpenID Connect）。ID トークンの `https://slack.com/team_id` が
  許可する team ID と一致する場合だけログインを許可する。照合は名前ではなく team ID で行う
- Slack の Redirect URL は HTTPS 必須のため、local の画面は認証を通さない。認証の有無は環境変数ではなく
  依存の組み立てで決まる（`localServer.ts` だけが無効にする）。Lambda 側に認証を外す経路を作らないこと
- `/api` 配下はすべてログイン必須。未ログインで返すのは画面の静的ファイルと `/auth` だけ
- シークレットは Lambda の環境変数に入れず、起動時に SSM（`/smart-summary/` 配下）から読む

### Langfuse

- Langfuse Cloud（日本リージョン、Hobby プラン）を使う。プロジェクトと API キーは 1 つで、
  local と AWS は環境名（`LANGFUSE_TRACING_ENVIRONMENT` の `local` / `aws`）で区別する
- 1 ジョブを 1 トレース（`LangfuseJobTracer`）とし、抽出と要約を generation として `GeminiLlm` で記録する
- SDK はバッファして非同期に送るため、すぐ終わるプロセスでは送り切ってから終える。
  CLI は終了前に `tracing.shutdown()`、Worker Lambda はハンドラが返る前に `tracing.flush()` を呼ぶ
- OpenTelemetry のリソース自動検出は無効にしている（`autoDetectResources: false`）。
  有効にするとホスト名・OS ユーザー名・コマンドライン引数がトレースに付いて送られる
- Langfuse の画面の AI 機能（Bedrock へのデータ送信）は使わない。Organization の設定でオフにしておく

### ドキュメント

- ドキュメントは `README.md` と `docs/slack-app-setup.md` の 2 つに絞る。増やさない
- `docs/slack-app-setup.md` には Slack の管理画面で行う作業だけを書く。
  シークレットの登録やアプリの設定方法は README に書く
- 外部サービスの仕様（料金、API、制限など）は、公式ドキュメントで確認してから書く

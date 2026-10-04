# smart-summary

長文を「抽出 → 要約」の 2 段階で要約するツール。抽出と要約は LLM（Gemini）で行い、
入力・抽出した要点・要約を DynamoDB に保存する。個人利用のツールで、リリースはしない。

セットアップと使い方は `README.md` を参照。

## 現状

- 実装済み: 抽出→要約のパイプライン、CLI、HTTP API、React 画面（いずれも local で動作）
- 未実装: Slack 認証、AWS へのデプロイ（`infra/` の CDK）

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
```

DynamoDB リポジトリの結合テストは `DYNAMODB_ENDPOINT=http://localhost:8000 npm test` のときだけ実行される。

変更後は `npm run typecheck`、`npm run lint`、`npm test` を通すこと。
画面や CLI の挙動を変えた場合は、実際に動かして確認すること。

## 構成

npm workspaces。

```
app/     バックエンド（オニオンアーキテクチャ）
web/     画面（React + Vite + Tailwind CSS）
infra/   AWS CDK（未作成。アプリケーションコードとは分ける）
docs/    Slack App 作成手順
tmp/     作業用（.gitkeep 以外は git 管理対象外）
```

### app/src のレイヤ

| レイヤ            | 役割                                                                 |
| ----------------- | -------------------------------------------------------------------- |
| `domain/`         | `SummaryJob`（状態遷移）、生成物の型、リポジトリのインターフェース   |
| `application/`    | ユースケース、ポート（`Extractor` / `Summarizer` / `JobDispatcher`） |
| `infrastructure/` | DynamoDB、Gemini、ジョブ起動、設定                                   |
| `presentation/`   | CLI、HTTP API（Hono）、依存の組み立て（`localComposition.ts`）       |

- 依存は外側から内側への一方向のみ（presentation / infrastructure → application → domain）。
  ESLint の `no-restricted-imports` で強制している
- 外部サービスへの依存は application のポートか domain のリポジトリ IF 越しに使う
- 依存の組み立ては presentation で行う。local 用は `localComposition.ts`。
  Lambda 用を追加するときは別の組み立てを用意する

### 処理の流れ

1. `SubmitSummaryJob`: 入力を保存してジョブを登録し、`JobDispatcher` に実行を依頼する
2. `RunSummaryJob`: 入力全文から要点を抽出 → 要点から要約を生成。各段階の結果を保存する
3. 状態は `pending → extracting → summarizing → completed`（失敗時は `failed`）

`JobDispatcher` は実行環境で差し替える。CLI は完了まで待ち、local の API サーバはバックグラウンドで実行する。
AWS では Worker Lambda の非同期呼び出しにする想定。

### DynamoDB

単一テーブル `smart-summary`（テーブル名は固定値）。

- `PK = JOB#<jobId>`、`SK = META | INPUT | EXTRACT | SUMMARY`
- 一覧用の GSI1: `GSI1PK = JOBS`、`GSI1SK = <createdAt>#<jobId>`
- キー構成を変える場合は、`createLocalTable.ts` と `infra/` の CDK 定義の両方を揃える

## 注意点

### 公開リポジトリ

このリポジトリは GitHub で public。次の値は git 管理下のファイルに書かない。

- API キー、Slack の Client ID / Secret、セッション署名鍵
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

### 認証（未実装・方針）

- Sign in with Slack（OpenID Connect）。ID トークンの `https://slack.com/team_id` が
  許可する team ID と一致する場合だけログインを許可する。照合は名前ではなく team ID で行う
- Slack の Redirect URL は HTTPS 必須のため、local の画面は認証を通さない

### ドキュメント

- ドキュメントは `README.md` と `docs/slack-app-setup.md` の 2 つに絞る。増やさない
- `docs/slack-app-setup.md` には Slack の管理画面で行う作業だけを書く。
  シークレットの登録やアプリの設定方法は README に書く
- 外部サービスの仕様（料金、API、制限など）は、公式ドキュメントで確認してから書く

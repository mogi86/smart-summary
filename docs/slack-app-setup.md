# Slack App 作成手順（Sign in with Slack）

smart-summary のログインに使う Slack App の作成手順です。

> このリポジトリは公開される前提です。Client ID / Client Secret / ワークスペース名 / team ID などの実値は、
> git 管理下のファイルに書かないでください。

参照した一次ソース（2026-10-04 確認）:

- https://docs.slack.dev/authentication/sign-in-with-slack/
- https://docs.slack.dev/authentication/installing-with-oauth/

## 1. App を作成する

1. https://api.slack.com/apps を開き、App を新規作成する
2. App Name を入力する（例: `smart-summary`）
3. Development Workspace に、ログインを許可するワークスペースを選択する

App は配布（distribute）しないでください。未配布の App は、作成元以外のワークスペースでは認可できません
（`invalid_team_for_non_distributed_app` エラーになります）。

また、Sign in with Slack のスコープ（`openid` `profile` `email`）は他のスコープと同じフローで要求できないため、
この App には Bot スコープなどを追加しないでください。

## 2. Client ID / Client Secret を控える

App 設定の **Basic Information** から Client ID と Client Secret を控えます。

## 3. Redirect URL を登録する

App 設定の **OAuth & Permissions** を開き、Redirect URLs に次を追加して保存します。

```
https://<Function URL のホスト>/auth/slack/callback
```

- Redirect URL は HTTPS 必須です（`http://localhost` は登録できません）
- Function URL は初回デプロイ後に確定するため、この手順はデプロイ後に行います

## 4. ワークスペースの team ID を控える

ログインを許可するワークスペースの team ID（`T` で始まる ID）を控えます。
ブラウザで Slack を開いたときの URL `https://app.slack.com/client/<team ID>/...` に含まれます
（この確認方法は一次ソースで未確認です）。

## 控えた値の使い道

Client ID / Client Secret / team ID の設定方法は README を参照してください。

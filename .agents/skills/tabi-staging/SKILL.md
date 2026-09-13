---
name: tabi-staging
description: tabiのPRをstagingへ反映し、Cloudflareのデプロイ結果を確認するときに使う。
---

# staging反映

- main向けPRを開いたまま、変更を最新の`staging`へ統合する。他のPRの内容を保持し、依頼範囲の競合・検証失敗を修正する。
- pushで`Deploy staging`が起動するため、手動デプロイを重ねない。構成変更・失敗調査時だけ、staging側の`.github/workflows/deploy-staging.yml`と`docs/DEPLOYMENT.md`の該当箇所を読む。
- 対象commitの`CI`・`Deploy staging`の成功と[staging](https://tabi-staging.tsito-apps.workers.dev)の応答を確認する。commit・環境と結果を対応づけ、同じ成功結果を取り直さない。PR headと統合後commitの結果を混同しない。
- 実行中の確認は利用可能な待機コマンドや通知を優先し、短間隔のポーリングを避ける。成功ログの全文を読まず、失敗したjob・stepの必要箇所だけ取得する。出力不足があれば範囲を広げる。
- 画面・動作を変えた場合だけ該当フローを確認する。文書・エージェント設定のみなら画面の再検証は不要。ローカルの検証は`AGENTS.md`に従い、既存の成功確認を重ねない。
- 権限・認証・外部障害で進めない場合は迂回せず、完了済みと未確認を区別して報告する。PR・検証・staging状況を簡潔に伝える。本番反映は`AGENTS.md`の条件に従う。

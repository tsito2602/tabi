---
name: tabi-staging
description: tabiのPRをstagingへ反映し、Cloudflareのデプロイ結果を確認するときに使う。
---

# staging反映

- 検証範囲・成功結果の再利用・完了報告・本番反映の条件は`AGENTS.md`に従う。
- main向けPRを開いたまま変更を最新`staging`へ統合する。他のPRを保持し、依頼範囲の競合と失敗を修正する。細かな調整は作業ブランチでまとめ、stagingへのpushを反復しない。
- 標準経路はWorkers Builds。`tabi-staging`が`staging`だけに接続され、非本番ブランチビルドOFF・cache ON・watch pathsが設定済みかを区別する。設定ファイルの存在を接続済みの根拠にしない。
- 対象pushのBuilds内で`npm run check`（ビルド内包）と配信が各1回動く。重複のActions・手動配信・Deploy Hook・一時検証workflowを追加しない。初回移行・構成変更・失敗調査時だけ`docs/DEPLOYMENT.md`の該当箇所を読む。
- PRの差分、統合後SHA、対象WorkerのBuild成功・配信・HTTP応答を確認する。PR headと統合後の結果、ブランチ更新と実配信を混同しない。
- Cloudflare接続や権限・認証・外部通信で止まった場合は迂回せず、コード準備・ブランチ統合・検証・配信のどこまで完了したかを報告する。本番は明示指示後にのみ反映する。

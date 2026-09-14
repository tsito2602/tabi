---
name: tabi-staging
description: tabiのPRをstagingへ反映し、Cloudflareのデプロイ結果を確認するときに使う。
---

# staging反映

- 検証範囲・結果の再利用・ログ取得・完了報告・本番反映の条件は`AGENTS.md`に従う。
- main向けPRを開いたまま、変更を最新の`staging`へ統合する。他のPRの内容を保持し、依頼範囲の競合・検証失敗を修正する。
- pushで`Deploy staging`が起動するため、手動デプロイを重ねない。構成変更・失敗調査時だけ、staging側の`.github/workflows/deploy-staging.yml`と`docs/DEPLOYMENT.md`の該当箇所を読む。
- 対象commitの`CI`・`Deploy staging`の成功と[staging](https://tabi-staging.tsito-apps.workers.dev)の応答を確認する。PR headと統合後commitの結果を混同しない。
- 権限・認証・外部障害で進めない場合は迂回せず、完了済みと未確認を区別して報告する。

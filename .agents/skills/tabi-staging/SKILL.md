---
name: tabi-staging
description: ユーザーがstaging反映を指示し、対象変更の一括統合・Workers Buildsの配信結果を確認するときに使う。
---

# staging反映

- 反映の条件・検証範囲・成功結果の再利用・完了報告・本番反映の条件は`AGENTS.md`に従う。
- main向けPRを開いたまま、指示された対象の変更を最新stagingへ統合する。他のPRの内容・履歴を保持し、依頼範囲の競合を解消する。複数PRでも統合途中ではpushせず、最終差分を確認して1回だけnon-force pushする。
- 標準経路はWorkers Builds。`tabi-staging`の接続先ブランチ、非本番ブランチビルドOFF、cache、watch pathsの適用状態を区別し、ファイルの存在だけで設定済みとしない。初回移行・構成変更・失敗調査時だけ`docs/DEPLOYMENT.md`の該当箇所を読む。
- 配信対象のpushではWorkers Builds内の`npm run check`（ビルド内包）と配信を各1回にする。重複のActions・手動配信・Deploy Hook・一時検証workflowを追加しない。失敗した場合は原因と配信済みかを確認し、同じ操作を反復しない。
- 文書・エージェント設定だけの変更がwatch pathsで除外される場合は、差分・構文・参照の整合性を確認してブランチへ反映し、Buildを手動起動しない。新しいSHAのBuild成功やアプリ再配信とは報告しない。
- PRの差分、統合後SHA、配信対象の場合は対象WorkerのBuild成功・配信・HTTP応答を確認する。PR headと統合後の結果、ブランチ更新と実配信を混同しない。
- 接続・権限・認証・外部通信や未解決の検証失敗で止まった場合は迂回せず、コード準備・ブランチ統合・検証・配信のどこまで完了したかを報告する。本番は明示指示後にのみ反映する。

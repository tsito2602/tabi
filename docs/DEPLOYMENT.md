# デプロイ構成

Web/PWAと共有APIは **Cloudflare Workers Builds** で検証・配信する。GitHubはコード・Issue・PRの管理に使い、Webの自動Actions実行は行わない。ネイティブのExpo/EASビルドは別系統で、明示依頼時だけ実行する。

**この文書やスクリプトが存在するだけではGit連携は有効にならない。** Cloudflare側の接続・対象ブランチ・変数・watch pathsを設定し、実際のBuildと配信先の成功を確認して移行完了とする。

| 環境 | ブランチ | Worker / D1名 | R2 |
| --- | --- | --- | --- |
| staging | `staging` | `tabi-staging` | `tabi-documents-staging` |
| production | `main` | `tabi` | `tabi-documents` |

## 利用枠を浪費しない標準設定

各Workerの **Settings → Builds（Build）** に設定する。既存Workerを使い、新しいWorkerやD1/R2を作り直さない。

| 項目 | staging | production |
| --- | --- | --- |
| Git repository | `tsito2602/tabi` | 同左 |
| Production branch（Cloudflareの項目名） | `staging` | `main` |
| Builds for non-production branches | **OFF** | **OFF** |
| Build command | **空欄** | **空欄** |
| Deploy command | `node scripts/workers-build.mjs staging` | `node scripts/workers-build.mjs production` |
| Non-production branch deploy command | `node -e "process.exit(1)"`（誤って有効にしても配信しない） | 同左 |
| Root directory | リポジトリのルート `/` | 同左 |
| Build cache | **ON** | **ON** |
| Build watch paths: include | `*` | `*` |
| Build watch paths: exclude | `docs/*`, `.agents/*`, `AGENTS.md`, `README.md`, `DESIGN.md`, `.github/*` | 同左 |

Build commandを空にするのは検証を省くためではない。Deploy commandの単一スクリプトが、設定確認・インストール・全検証・ビルド・配信・HTTP確認を順に行い、どこかが失敗すれば停止する。`npm run check`にWebビルドが含まれるため、別の`npm run build:web`を設定しない。

上記ブランチとwatch pathsは**Cloudflareの外部設定**であり、Wrangler設定から自動適用されない。staging用Workerの「Production branch」は`staging`で正しい。非本番ビルドをOFFにすると、feature/PR更新ごとのプレビューは作成しない。

watch pathsは空変更push、20コミット以上または3,000ファイル以上のpushでは評価が省略されるため、完全な課金上限ではない。再実行用の空コミットは作らない。キャッシュはnpmのダウンロードを再利用するもので、Expoのビルド出力が自動キャッシュされると仮定しない。環境ごとにAPI URLとOAuth IDが異なるため、stagingのdistを本番へ流用しない。

## ビルド変数・トークン

**Build variables and secrets** に環境ごとに設定する。Worker実行時のVariables & Secretsとは別。

| 名前 | 値 |
| --- | --- |
| `NODE_VERSION` | `24` |
| `SKIP_DEPENDENCY_INSTALL` | `1`（自動依存導入を止め、スクリプトの`npm ci`1回に限定） |
| `D1_DATABASE_ID` | 対象環境の既存D1のUUID。D1の対象DB → Settingsから確認 |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | 対象環境のWeb OAuth Client ID |
| `GOOGLE_CLIENT_IDS` | 許可するClient IDのカンマ区切り。必ず上のWeb Client IDを含める |

ビルド実行には`CLOUDFLARE_ACCOUNT_ID`と`CLOUDFLARE_API_TOKEN`も必要。BuildsのAPI token選択で環境に合うトークンを選び、対象アカウントを確認する。明示的に登録する場合、tokenは必ずBuild secretへ保存する。GitHub Secretsの値がCloudflareへ自動移行するとは仮定しない。値をチャット・コミット・ログへ貼らない。

必要権限は対象アカウントのWorkers Scripts・D1・Workers R2 StorageのEdit。Buildsが自動作成するトークンにはD1権限が含まれない場合があるため、既存の環境別トークンを選ぶか権限を確認する。Account IDは共用できるが、D1/R2と本番用トークン・OAuth設定は区別する。トークンのアカウント単位の権限はDB単位の隔離を保証しないため、スクリプトでもUUIDに対応するD1名を確認する。

`EXPO_PUBLIC_API_URL`・`EXPO_PUBLIC_ENABLE_DEMO`・`ALLOWED_ORIGINS`はスクリプトが環境別に固定するので通常は設定不要。残っている設定が矛盾すれば依存導入前に停止する。productionはサンプルOFF。`WORKERS_CI`・`WORKERS_CI_BRANCH`・`WORKERS_CI_COMMIT_SHA`はCloudflareの値を使用し、手動で上書きしない。

本番のGoogle JavaScript生成元は`https://tabi.tsito-apps.workers.dev`、リダイレクトURIは`https://tabi.tsito-apps.workers.dev/oauth`。スコープは`openid`・`email`・`profile`。現在の実装にGoogle Client Secret・Gmail token・セッション署名鍵・R2のS3キーは不要。実行時の既存secretsは削除せず、公開のOAuth IDと許可originは生成Wrangler設定から反映する。

## 1回の実行内容

1. 対象ブランチ・checkout SHA・環境変数・Worker/D1/R2の対応を検証し、既存D1のUUIDと名前をAPIで照合する。権限や設定エラーはインストール前に止める。
2. 依存不要の`node --test scripts/test-workers-build.mjs` → `npm ci --include=dev --prefer-offline --no-audit --no-fund` → `npm run check`を各1回実行する。checkには型・lint・既存テスト・Web/PWAビルドが含まれる。
3. 生成設定を用い、既存の`worker/schema.sql`適用 → lockfileのWranglerで配信する。リソースの毎回の一覧探索・作成、別ビルド、配信の自動再試行は行わない。
4. ホームのHTML、未認証`/v1/me`の401 JSON、`/sw.js`を確認する。これはHTTP疎通確認であり、Googleログインや画面操作の実機検証を代替しない。

コマンドには段階ごとのタイムアウト、通信には10秒の上限を設ける。配信後のHTTP確認だけが失敗しても、すでに配信済みの可能性があるため、原因を確認せずBuild全体を再実行しない。DB適用後の配信失敗時も、DDLが自動で戻ったとは扱わない。

## 初回切替の順序

- まず移行PRをレビューする。GitHubの`ci.yml`は手動実行だけにし、旧自動配信workflowを削除する差分を含む。**mainを先にマージせず、Cloudflareを未接続のまま移行完了としない。**
- 作業環境で全検証を完了できない場合は、既存`tabi-staging`を移行ブランチへ一時接続し、Deploy commandを`node scripts/workers-build.mjs staging --check-only`にする。非本番ビルドOFF、上記変数・cache・watch pathsを揃えて1回だけ検証する。この明示モードはfeatureブランチを許容するが、DB書き込み・Worker配信は行わない。通常のコマンドはfeatureからの配信を拒否する。
- 検証後、移行PRを開いたまま変更を最新stagingへ統合する。他のPRを保持し、未検証のUI変更を一緒に入れない。Cloudflareの接続先を`staging`、Deploy commandを標準設定へ変更し、stagingの検証・配信・HTTP応答を確認する。設定変更自体でBuild済みとはみなさず、次の対象pushまたは必要な初回実行を1回だけ行う。
- staging確認後、ユーザーの明示指示を受けて移行PRをmainへマージし、本番WorkerのGit連携を上記設定で有効化する。本番は1回検証・配信する。既存ActionsとBuildsを二重に起動させない。
- GitHubのrequired status checksが旧Actionsの`check`を要求している場合は、管理者が移行する。非本番ビルドOFFではfeature SHAにCloudflareチェックは作られないので、存在しないチェックをPR必須項目に追加しない。staging成功・対応差分・レビューを記録し、検証を偽のsuccessや無条件マージで代替しない。

## 日常運用

細かな修正は作業ブランチでまとめ、確認した一区切りだけをstagingへ反映する。同じ環境・同じ内容の成功を再利用し、ブラウザ検証を毎回両エンジンの総当たりにしない。UIや同期等の変更リスクに応じた確認は省略せず、実行環境がない場合は未確認と明記する。検証のための一時Actions workflow、定期Build、Deploy Hookによる重複起動は作らない。

Freeの月3,000ビルド分はアカウントの他Workerとも共有する利用枠として使用量を確認する。Paidは別の従量条件がある。キャッシュやwatch pathsだけで課金が発生しないことを保証しない。料金・上限設定は勝手に変更しない。

Actionsの手動CIは緊急用で、明示依頼時のみ実行する。既存データ・添付ファイル・セッションは環境間で自動移行しない。PR #151のWebKitクラッシュと全画面化の未完了検証は、配信方式を替えても解決扱いにしない。

### Cloudflare公式資料（設定確認: 2026-09-14）

- [Build configuration / variables / API token](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Branch control](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/)
- [Build watch paths](https://developers.cloudflare.com/workers/ci-cd/builds/build-watch-paths/)
- [Build cache](https://developers.cloudflare.com/workers/ci-cd/builds/build-caching/)
- [Build image / SKIP_DEPENDENCY_INSTALL](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)
- [Limits and pricing](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/)

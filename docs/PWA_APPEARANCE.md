# ログインとホーム画面アイコン

サンプル旅行はローカル開発（`__DEV__`）、ネイティブのpreview、または`EXPO_PUBLIC_ENABLE_DEMO=true`でビルドしたstagingだけで有効。本番のデプロイでは明示的に`false`を指定する。本番では以前保存された`tabi.demo-active`を削除し、サンプルデータを自動で開かない。旅行やログイン済みアカウントの保存データは削除しない。

iOSのホーム画面用アイコンは`/icons/apple-touch-icon.png`（180px、文字なし、不透明な純白背景を持つRGBA PNG）。`npm run icons:export`で、konogoroの書き出しと同じ`density: 384`、`compressionLevel: 9`、`palette: false`を使って再生成する。ネイティブストア用の`removeAlpha()`処理をWeb用画像には適用しない。

初回の白背景への変更だけでは、ユーザーのiPhoneで自動ダーク化しなかった。配信済みkonogoro画像はRGBA・384dpi、tabiの初回修正版はRGB・72dpiだった。またmanifest用192/512pxとmaskableは青みのある背景が残っていた。今回は全Web用PNGの生成方式と白背景を揃え、SVGはライト時に白、ダーク時に黒に切り替える。ICO・16/32px PNG・SVGの候補もkonogoroと同じ構成で指定する。これらは確認できた実装差分であり、どの差分がiOSの自動処理に影響するかは実機でしか断定できない。

新しい画像URLを使用して旧画像と区別する。旧ルートURLのPNGも同じ生成方式で更新し、Webアイコンだけ別形式・別背景になることを防ぐ。既存のTモチーフ、色、配置は保持する。

Appleが案内するWeb Clipの指定は`apple-touch-icon`のPNG。ネイティブ用のダーク画像を置くだけで、インストール済みPWAのホーム画面アイコンが自動的にその画像へ切り替わるわけではない。konogoroの実装にも明暗の切り替え指定はないため、観測された変化はiOS側の自動処理と考えられる。純白化で同じ結果になるかはiOS実機で確認が必要で、カスタムのダーク画像への切り替えは保証しない。

実機ではSafariで更新後のサイトをホーム画面へ追加し、ホーム画面アイコンの外観を自動にしてライト／ダークを確認する。既存アイコンはOS側に保持される場合があるため、反映されない場合は再追加して確認する。

参照: [Apple: Configuring Web Applications](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html)

Webアプリのルートは`100dvh`で表示領域に追従させる。Safariのツールバーが開閉してもアプリ下部にルート背景だけの帯を残さないための設定。ホームインジケーター周辺の操作ボタンの余白は各コンポーネントで維持する。iOS Safari／ホーム画面PWAの双方でスクロール後の下端を確認する。

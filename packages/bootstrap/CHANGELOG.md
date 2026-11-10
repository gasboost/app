# Changelog

## 0.5.0

- Auth 0.12.0の公開DTOに対応。登録APIの戻り値はUser IDだけ使用し、Account追加APIの戻り値には依存しません。
- 登録・Account追加の成功後に同じRepositoryからAccountを読み直し、所有者・provider・メールの整合性を検証。中断後の再試行では既存User・Accountを再利用します。
- Authのpeer依存を `^0.12.0` に変更。0.4.xからはAuthと対応するAuth SheetORM（0.5.1以降）を更新してください。Bootstrapの呼び方・公開状態・リース・通知仕様は維持します。

## 0.4.0

- `@gasboost/bootstrap/react` に `BootstrapProvider` / `useBootstrap` を追加。HTMLの公開状態を初期値にし、`setInitialized(boolean)` の変更を配下のConsumerへ通知します。
- 初期値の未指定・不正形式、Provider外のHook呼び出しを明示エラーにします。
- React 19をoptional peerに追加。サーバー用・errorsサブパスはReactなしで利用可能です。React用サブパスの実行時・型定義からGAS / Authへの依存を分離し、既存の公開状態の形式・サーバーAPIは維持します。

## 0.3.0

- ブラウザ専用の `@gasboost/bootstrap/errors` に `BOOTSTRAP_ERROR_CODES`・`BootstrapErrorCode`・`BootstrapError({ code, message })` を公開。GAS / サーバー / Auth実装には依存しません。
- 無効token・期限切れ・試行上限・処理中・初期化済み・リンク未準備の既知エラーをコード化し、初期化RPCの境界で `AppsScriptError` に変換。未知エラーは共通RPCの `INTERNAL_ERROR` に委譲します。
- App依存を5.5.0以降に更新。HTML handleの同期契約・永続形式・検証や復旧手順は維持します。

## 0.2.0

- 同期 `handle(request)` で公開状態とEffectiveUser宛て初期化リンクを提供。
- 長いランダムtoken、TTL、試行回数、通知状態、通知リースで再送と同時GETを制御。
- 初期化RPCはtokenと非空のActiveUser / EffectiveUser一致を確認してから実行。
- Authと同じAppsScriptAuthRepositoryを注入し、IdentityからUserを復元。登録・Account追加と進捗保存間の中断で二重作成を防止。
- App 5.4.0と公開済みAuth 0.9.0を使用。Clientは既存APIを利用。
- HTML・テンプレート・フロント表示・tokenのURL読取はConsumerが担当。

# Changelog

## 0.2.0

- 同期 `handle(request)` で公開状態とEffectiveUser宛て初期化リンクを提供。
- 長いランダムtoken、TTL、試行回数、通知状態、通知リースで再送と同時GETを制御。
- 初期化RPCはtokenと非空のActiveUser / EffectiveUser一致を確認してから実行。
- Authと同じAppsScriptAuthRepositoryを注入し、IdentityからUserを復元。登録・Account追加と進捗保存間の中断で二重作成を防止。
- App 5.4.0と公開済みAuth 0.9.0を使用。Clientは既存APIを利用。
- HTML・テンプレート・フロント表示・tokenのURL読取はConsumerが担当。

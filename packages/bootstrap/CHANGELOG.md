# Changelog

## 0.2.0

- 同期 `handle(request)` で公開状態とEffectiveUser宛て初期化リンクを提供。
- 長いランダムtoken、TTL、試行回数、通知状態、通知リースで再送と同時GETを制御。
- 初期化RPCはtokenと非空のActiveUser / EffectiveUser一致を確認してから実行。
- 汎用Registrationに固定User IDを渡し、Account追加と再取得で登録・進捗保存間の中断から復旧。
- App 5.4.0と汎用User / Account管理APIを持つAuth 0.10.0を使用。Clientは既存APIを利用。
- HTML・テンプレート・フロント表示・tokenのURL読取はConsumerが担当。

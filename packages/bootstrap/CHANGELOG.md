# Changelog

## 0.2.0

- 同期 `handle(request)` で公開状態とEffectiveUser宛て初期化リンクを提供。
- 長いランダムtoken・発行先固定・通知状態・通知リースで再送と同時GETを制御。
- `handlers().initializeApp({ token })` は検証済みの非同期初期化を継続し、`@gasboost/client` で呼び出す。
- `middleware()` / `KEY` / `settingsUrl` / `tokenDigits` を廃止。HTML・UIはConsumerが生成。
- App 5.4.0、Auth 0.9.0のEffectiveUser管理用登録APIを使用。既存のリース・段階復旧・全認証方式を維持。

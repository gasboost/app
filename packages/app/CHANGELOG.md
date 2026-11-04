# Changelog

## 5.4.0

- `AppsScriptHttpRequest.path(): string | undefined` を追加。GAS `pathInfo` を変換せず取得できます。
- `AppsScriptHttpRequest` クラスを公開exportし、状態ハンドラーへリクエスト型を渡せるようにします。
- GET / POST、query / queries、RPCの既存契約は維持します。GETの非同期対応は含みません。

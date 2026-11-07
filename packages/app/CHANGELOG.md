# Changelog

## 5.5.0

- 公開用の `AppsScriptError({ code, message })` を追加。RPC境界でコードとメッセージを明示的にシリアライズします。
- 未知のRPC例外は `INTERNAL_ERROR` に正規化し、内部メッセージとサーバースタックを公開しません。GET / POSTの動作は維持します。

## 5.4.0

- `AppsScriptHttpRequest.path(): string | undefined` を追加。GAS `pathInfo` を変換せず取得できます。
- `AppsScriptHttpRequest` クラスを公開exportし、状態ハンドラーへリクエスト型を渡せるようにします。
- GET / POST、query / queries、RPCの既存契約は維持します。GETの非同期対応は含みません。

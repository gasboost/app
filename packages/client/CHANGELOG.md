# Changelog

## 0.6.0

- `AppsScriptRpcError` を公開し、GAS / Fetch両transportで任意のRPCエラーコードを復元します。
- コードなし・不正な失敗は安全な `INTERNAL_ERROR` に正規化。従来のサーバーメッセージ・スタックの復元は廃止します。

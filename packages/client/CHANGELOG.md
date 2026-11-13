# Changelog

## 0.7.0

- `RpcCallOptions.label` で RPC Job の表示名を指定できるようになりました。省略時は従来どおり RPC メソッド名を使用します。
- ラベルはローカルの Job 表示にのみ使用し、Transport や RPC metadata には送信しません。再試行時も指定したラベルを維持します。

## 0.6.0

- `AppsScriptRpcError` を公開し、GAS / Fetch両transportで任意のRPCエラーコードを復元します。
- コードなし・不正な失敗は安全な `INTERNAL_ERROR` に正規化。従来のサーバーメッセージ・スタックの復元は廃止します。

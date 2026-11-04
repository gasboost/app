# Issue #66: GAS GETの非同期処理に関する実機検証

検証日: 2026-11-05（Asia/Tokyo）。既存アプリとは別の新規GASプロジェクトで実施しました。
V8 / `USER_DEPLOYING` / `MYSELF`、バージョン付きの `/exec` を使用し、
所有者としてログイン済みのChromeからアクセスしています。メール送信や実DB書き込みは行っていません。
検証後、バージョン付きデプロイを削除し、再アクセスが「ページが見つかりません」となることを確認済みです。

## 結果

| エントリーポイント                           | 期待する本文              | 実際の結果          |
| -------------------------------------------- | ------------------------- | ------------------- |
| 同期 `doGet` → `HtmlOutput`                  | `SYNC_ISSUE_66_OK`        | 正常表示            |
| 同期 `doGet` → async関数のPromise            | `ASYNC_ISSUE_66_OK`       | GASの戻り値型エラー |
| `async function doGet` → await後にHtmlOutput | `ASYNC_ENTRY_ISSUE_66_OK` | 同じ戻り値型エラー  |

エラー画面には次の文言が表示されました。

```text
スクリプトが完了しましたが、返された値はサポートされている戻り値の型ではありませんでした。
```

1件目は同じ検証プロジェクトの対照実験です。Promise内では即時解決する `Promise.resolve()`
だけをawaitしています。ネットワーク待ちやDBの遅延による失敗ではありません。
async関数を宣言しただけのエントリーポイントでも改善しませんでした。
これは、この構成に対する実測結果であり、GASの全機能におけるPromise非対応を主張するものではありません。

公式資料では [V8がasync / awaitを扱えること](https://developers.google.com/apps-script/guides/v8-runtime)
と、[WebアプリのdoGetがHtmlOutput / TextOutputを返すこと](https://developers.google.com/apps-script/guides/web)
は別の条件です。V8の構文サポートだけを理由に `.get()` のPromise戻り値を許容できません。

## 再現

1. このディレクトリの `Code.gs` と `appsscript.json` を、新規の使い捨てGASプロジェクトへコピーします。
2. 実行ユーザーを「自分」、アクセスできるユーザーを「自分のみ」として、バージョン付きWebアプリをデプロイします。
3. `/exec?mode=sync` の正常表示と、`/exec?mode=async` のエラーを比較します。
4. `Code.gs` を `AsyncEntry.gs.txt` の内容で置き換え、別バージョンをデプロイして `/exec` を開きます。
5. 検証用デプロイを削除します。既存アプリのコードやデプロイを流用・上書きしないでください。

`AsyncEntry.gs.txt` はそのままではGASのソースとしてアップロードされません。
`.clasp.json`、所有者のメール、プロジェクトID、デプロイID、OAuth認証情報は収録していません。

## 採用した構成：同期GET + 非同期RPC

この実測結果に基づき、初期化そのものをGET内で行う案は撤回しました。
`bootstrap.handle(request)` は同期処理で状態取得・長いtokenの保存・EffectiveUser宛ての
MailApp通知を行い、公開状態だけを返します。HTMLはConsumerが生成します。

初期化は `.calls(bootstrap.handlers())` の非同期 `initializeApp({ token })` で行います。
フロントはメールリンクのtokenをURLから読み、既存の `@gasboost/client` を使用します。
トークン・TTL・試行回数・発行先EffectiveUser・リース等の検証より前にDB/Auth/Role/通知/hookを実行しません。

現行のPromise APIを同期化したり、PromiseをHtmlOutputへキャストしたりする必要はありません。
AuthのActiveUser検証を迂回せず、Auth 0.9.0の専用管理API `ensureEffectiveUser()` を使用します。
デプロイはUSER_DEPLOYINGを維持し、通常利用者へSpreadsheetの直接権限を求めません。

詳細な利用方法・復旧・依存リリースはパッケージREADMEを参照してください。

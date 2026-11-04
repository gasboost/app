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

## #66の実装に対する制約

現行の `.get()` は同期出力を返す契約です。非同期の `registration.ensure()` や
`password.forgot()` を呼ぶ `bootstrap.handle()` を、そのままGETの戻り値へ接続することはできません。
`.get(async () => ...)` への型変更、PromiseからHtmlOutputへのキャスト、
待機完了を確認せず返すコードでは実機上の問題を解決しません。

同一GETで初期化を完結させるには、Auth / Repository / Password Reset通知まで
同期的に完了する正規APIを用意する必要があります。既存のPromise APIや非同期deliveryを、
戻り値を無視して同期処理として扱うことはできません。

別の制約として、Auth 0.8.0の `registration.ensure()` はApps Script認証が有効な場合、
`Session.getActiveUser().getEmail()` と登録先メールの一致を要求します。
#66の `USER_DEPLOYING` + EffectiveUserでは、この検証も整合させる必要があります。
Bootstrap側だけで `getEffectiveUser()` に切り替えたり、Authに偽のSessionを渡して回避したりしません。

## この変更の状態

- `AppsScriptHttpRequest.path()` は独立して実装・型チェック・単体テストが可能です。
- BootstrapのGETハンドラー、EffectiveUserへの初期化リンク通知、Bootstrap 0.2.0は未実装です。
- 既存のBootstrap 0.1.0の公開APIとリース・復旧処理は維持しています。
- Issue #66全体の完了条件は満たしていません。同期APIの依存対応と実機再検証が終わるまでDraftを維持し、マージしません。

# @gasboost/bootstrap

GAS Webアプリの初期設定を、**同期GET（公開状態と初期化リンク通知）** と
**非同期RPC（トークン検証後のDB migration・管理者登録・ロール付与）** に分けます。
HTML・テンプレート変数・タイトル・UIはConsumerが生成します。BootstrapはHtmlServiceに依存しません。

## インストール

```sh
pnpm add @gasboost/app@^5.4.0 @gasboost/bootstrap@^0.2.0 @gasboost/client@^0.5.0
pnpm add @gasboost/auth@^0.9.0 @gasboost/auth-sheetorm@^0.4.1 @gasboost/auth-app@^0.6.2
```

標準登録は [gasboost/auth#50](https://github.com/gasboost/auth/pull/50) の
`registration.ensureEffectiveUser()` を必要とします。依存リリース後に利用してください。
Auth / DB / Password Resetの非同期APIは変更せず使用します。
Bootstrapは注入された公開APIの構造型に依存し、AuthやClientをruntime importしません。
Clientは既存APIを使用するため、この変更によるversion bumpはありません。

## Backend

`db`・`auth`・`authorization` は設定済みの `SheetDB`・`AppsScriptAuth`・
`AppsScriptAuthorization` です。DBにはAuth / Authorizationのテーブルを含めます。
Email/Password有効時は `emailPassword.passwordReset.delivery` を設定してください。

```ts
import { AppsScript, type InferAppsScript } from "@gasboost/app";
import { authentication, handlers } from "@gasboost/auth-app";
import { AppsScriptBootstrap } from "@gasboost/bootstrap";

const bootstrap = new AppsScriptBootstrap({
  db,
  auth,
  authorization,
  tokenTtlMinutes: 30,
  maxAttempts: 5,
  administrator: { name: "システム管理者", role: "管理者" },
});

const app = new AppsScript()
  .get((request) => {
    const state = bootstrap.handle(request); // Promiseではなく公開状態を返す
    const template = HtmlService.createTemplateFromFile("index");
    template.value = JSON.stringify(state)
      .replace(/</g, "\\u003c")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
    return template.evaluate().setTitle("出張管理システム");
  })
  .calls(bootstrap.handlers()) // 通常のログイン認証より前に登録
  .calls(handlers(auth)) // sign-in / password resetもログイン前に利用可能
  .use(authentication(auth))
  .call("privateExample", () => ({ ok: true }));

export default app;
export type AppType = InferAppsScript<typeof app>;
```

HTMLテンプレートでは、上記でエスケープしたJSONだけをforce-printします。
`value` という変数名や以下の配置はConsumerの選択です。

```html
<script id="app-value" type="application/json">
  <?!= value ?>
</script>
```

公開状態は `BootstrapPublicState = { initialized: boolean }` だけです。
トークン・メール・リース・試行回数・復旧情報はHTMLへ渡しません。
`settingsUrl` は廃止しました。画面のmeta・favicon・title等はすべてConsumerが設定します。

## Frontendとメールリンク

未初期化で通常の `/exec` を開くと、EffectiveUser宛てに
`https://script.google.com/macros/s/<deployment>/exec?token=<長いトークン>` を送ります。
同じ通知済みトークンの期限内GETでは再送しません。
メールを受け取ったデプロイ実行者がリンクを開き、Consumerが次のRPCを実行します。
トークンを返却状態に埋め込んだり、フロントから送信先メールを指定したりしません。

GASのHTMLはiframe内で動くため、親の `/exec` のパラメータには
`google.script.url.getLocation()` を使用します。iframeの `window.location.search` に
親のtokenがあるとは限りません。これはURL読取APIであり、RPCは必ず `@gasboost/client` を使います。
フロントルーターや `pathInfo` に依存しません。

```ts
import { appsScriptClient } from "@gasboost/client";
import type { AppType } from "../backend/main";

const initial = JSON.parse(document.getElementById("app-value")!.textContent!);
const { client } = appsScriptClient<AppType>();

if (!initial.initialized) {
  google.script.url.getLocation(async (location) => {
    const token = location.parameter.token;
    if (!token) return; // Consumerは「初期設定メールを確認してください」等を表示
    try {
      const result = await client.initializeApp({ token });
      // Consumerでresult.initializedに従い通常画面へ切り替える。
      // 状態を更新して再描画するか、アプリの方針に従って再読込する。
      renderApplication(result);
    } catch (error) {
      renderInitializationError(error); // 未完了のまま再試行可能なUIを表示
    }
  });
}
```

`renderApplication` / `renderInitializationError` はConsumerのUI関数です。
フロント環境でGAS URL APIの型が未定義の場合は、Consumerで型を定義してください。
`google.script.run` を直接呼び出す必要はありません。

`handle()` はリンクのtokenを検証して公開状態を返すだけで、**GETでは初期化しません**。
不正・期限切れ・ロックアウト・別EffectiveUserのリンクではエラーになり、追加メールやDB処理は行いません。
RPCは公開入口として扱い、トークン・TTL・試行回数・未初期化・リース・発行時EffectiveUserを
検証してから初期化を始めます。HTMLやGETで検証済みでも、RPCの検証を省略しません。
通常のGETを一度も経ていないRPC、初期化済みのRPC再実行も拒否します。
拒否時にDB migration・Auth登録・Role付与・Password Reset通知・hookは実行しません。
不正トークンの試行回数更新はセキュリティ用のプロパティ更新として行います。

## 実行ユーザーとGAS設定

デプロイは `executeAs: USER_DEPLOYING`（自分として実行）を維持します。
通常利用者へSpreadsheetの直接権限を付与する必要はありません。
GAS OAuthスコープはDB等に必要なものに加え、MailApp送信用の
`https://www.googleapis.com/auth/script.send_mail` と `userinfo.email` を設定します。
初期化リンクのメールは `Session.getEffectiveUser().getEmail()` 宛てに固定です。
空ならエラーにし、ActiveUserへ切り替えません。

EffectiveUserはデプロイ実行者の識別であり、外部訪問者の本人確認ではありません。
初期化権限はメールで受け取ったトークンの所持・照合で確認します。
発行時とGET/RPC時のEffectiveUserが異なれば拒否します。
Authの `ensureEffectiveUser()` も同じメールを独立して照合し、Sessionを偽装しません。
トークン入りURLを第三者へ共有・ログ出力したり、HTMLへ埋め込んだりしないでください。

初期化URLは `ScriptApp.getService().getUrl()` の有効な `/exec` URLを使います。
未デプロイ・`/dev` 等は明示エラーにし、URLを `/exec` へ置換して推測しません。
同じGASプロジェクトのデプロイはScript Propertiesを共有します。更新時は旧Bootstrap版のデプロイを併用せず、リンク先のデプロイを確認してください。

## ロック・通知・復旧

状態はScript Propertiesの `APP_STATE` にJSONとして保存します。
長いトークンは2つのGAS UUIDから生成し、既定TTLは30分、最大失敗回数は5回です。
`tokenTtlMinutes` は1〜1440、`maxAttempts` は1〜100です。短い数値トークンの `tokenDigits` は廃止しました。
失敗上限後は期限まで正しいtokenも拒否します。期限後の通常GETでだけ再発行します。

通知と初期化は、それぞれScript Lock内で10分の実行リースを取得してから開始します。
ネイティブロックはプロパティ操作の間だけ保持し、MailApp / DB / Auth / hookを呼ぶ前に解放します。
同時の通常GETは通知リースを見て重複メールを送らず、同時RPCは初期化リースで拒否されます。
SheetORM v4も同じLockServiceを利用でき、ScriptLockの入れ子取得・途中解放に依存しません。

通常の例外では自分のリースを解放し、すぐ再試行できます。
初期化リンク送信の失敗後は、通常GETで同じtokenのメールを再送します。
送信前に次回試行時刻を保存し、失敗・送信結果不明・チェックポイント失敗時の再送を60秒間抑制します。
メール内リンクで通知未完了エラーになった場合は、tokenを付けない `/exec` を60秒後に開いて再送してください。
通知が完了記録される前のRPCは拒否します。
強制終了やProperties障害でリースが残った場合は、取得から10分後に再試行してください。
リースは [GASの1実行6分の上限](https://developers.google.com/apps-script/guides/services/quotas#current_limitations)
より長く、実行中は延長しません。別ランタイムで6分を超える実行を継続する用途は対象外です。

固定管理者ID・本人メール・有効認証方式はDB操作前に保存します。
migrate → 全有効方式のAccount登録 → Role付与 → Password Reset通知 → hook の段階進捗を保持します。
両方式有効なら1 User / 2 Accounts / 1管理者Roleです。方式設定が変わった復旧は拒否します。
Email有効時は推測困難な仮パスワードを使い、本人へはreset linkのみ送信します。
Password Reset通知が失敗した場合はRPC再試行で新しいreset tokenを発行します。
完了時は `{ "initialized": true }` のみを保存し、token・リース・復旧情報を消去します。
初期化済みGETは公開状態だけを返し、メールや登録等の副作用を起こしません。

Spreadsheet・Properties・メールは原子的なトランザクションではありません。
外部書込後・チェックポイント保存前の停止ではその段階を再実行するため、固定IDでの登録・Role upsert・
冪等なmigrationとhookが必要です。通知送信後・記録前の停止ではメールが重複し得ます。
古い所有者は期限や所有者IDの検証により進捗・完了を更新できず、後続リースも解除できません。
`APP_STATE`破損は明示エラーにし、勝手に別管理者を作り直しません。

## 個別の差し替え

`overrides.migrate` / `registerAdministrator` / `assignRole` / `notify` と
`afterInitialize` を必要な段階だけ指定できます。`notify` はRPC内のPassword Reset通知の差し替えです。
初期化リンクは同期GETのMailApp通知で送信します。
各処理の引数は読み取り専用の `{ id, email, name, role }` で、登録は同じ `id` を返す必要があります。
カスタム処理もトークン検証とリース取得より後にだけ実行され、再実行可能にしてください。

## 0.1.0からの移行と検証

`middleware()` / `KEY` / `settingsUrl` とScript Properties手入力を標準手順から外し、
同期GETで `handle(request)`、ログイン認証の登録前に `.calls(bootstrap.handlers())` を使用します。
`initializeApp` のRPCは引き続き存在します。フロントはメールURLのtokenを読み、型付きClientで呼びます。
旧形式のチャレンジは通常GETで新しいメールリンクへ置き換えます。管理者ID・進捗は維持し、
旧ActiveUserと新EffectiveUserが違う場合は自動的に付け替えず拒否します。
初期化済み状態はそのまま利用できます。復旧のために `APP_STATE` 全体を削除しないでください。

GASの非同期GETを実機検証した記録は `experiments/get-runtime/` に残しています。
この制約を避けるためにGETとRPCを分離しており、Auth / DBを同期化する必要はありません。

`pnpm typecheck` / `pnpm test` / `pnpm build` に加え、次で実Auth・SheetORM・型付きClientを接続します。

```sh
GASBOOST_AUTH_WORKSPACE=/path/to/built/auth pnpm --filter @gasboost/bootstrap test:integration
```

CIはAuthのAPIコミットを固定し、Bootstrap / SheetDBで同一NodeLockServiceを共有して検証します。
App / Bootstrapをルートでpackした後、`pnpm --filter @gasboost/bootstrap smoke` で別Consumerの型を確認できます。

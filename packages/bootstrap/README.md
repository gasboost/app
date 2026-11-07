# @gasboost/bootstrap

GAS Webアプリの初期設定を、**同期GET（公開状態と初期化リンク通知）** と
**非同期RPC（トークン検証後のDB migration・管理者登録・ロール付与）** に分けます。
HTML・テンプレート変数・タイトル・UIはConsumerが生成します。BootstrapはHtmlServiceに依存しません。

## インストール

```sh
pnpm add @gasboost/app@^5.5.0 @gasboost/bootstrap@^0.3.0 @gasboost/client@^0.6.0
pnpm add @gasboost/auth@^0.9.0 @gasboost/auth-sheetorm@^0.4.1 @gasboost/auth-app@^0.6.2
```

標準登録と復旧には公開済みAuth 0.9.0のRegistration / Account APIとRepository APIを使用します。
Auth / DB / Password Resetは非同期の正規APIを使用します。
`authRepository` はAuthが公開する `AppsScriptAuthRepository` 型をそのまま使用します。
AuthやClientをruntime importしません。
Clientは既存APIを使用するためversion bumpはありません。

## Backend

`db`・`auth`・`authorization` は設定済みの `SheetDB`・`AppsScriptAuth`・
`AppsScriptAuthorization` です。DBにはAuth / Authorizationのテーブルを含めます。
Email/Password有効時は `emailPassword.passwordReset.delivery` を設定してください。
`authRepository` は `auth` の生成時に渡したものと同じRepositoryインスタンスを指定します。
初期化完了までは、両方式の `isSignupEnabled: false` 等のサーバー設定で通常の自己登録を禁止してください。
Bootstrapの管理用Registration APIは通常のSignUp RPCを経由しません。

```ts
import { AppsScript, type InferAppsScript } from "@gasboost/app";
import { authentication, handlers } from "@gasboost/auth-app";
import { AppsScriptBootstrap } from "@gasboost/bootstrap";

const bootstrap = new AppsScriptBootstrap({
  db,
  auth,
  authRepository,
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
画面のmeta・favicon・title等はすべてConsumerが設定します。

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
空ならエラーにします。RPCはさらにActiveUserの非空・EffectiveUserとの完全一致を必須にします。
USER_DEPLOYINGでActiveUserが取得できない場合、tokenが正しくても初期化を拒否します。
EffectiveUserで代用したり、USER_ACCESSINGへの変更や一般利用者へのSpreadsheet権限付与を求めたりしません。

EffectiveUserはデプロイ実行者の識別であり、外部訪問者の本人確認ではありません。
初期化権限はメールtokenの照合とRPCの主体チェックの両方で確認します。
発行時とGET/RPC時のEffectiveUserが異なれば拒否します。
Registrationは指定アドレスを登録するサーバー内部APIです。自己登録のSignUp RPCは呼びません。
トークン入りURLを第三者へ共有・ログ出力したり、HTMLへ埋め込んだりしないでください。

初期化URLは `ScriptApp.getService().getUrl()` の有効な `/exec` URLを使います。
未デプロイ・`/dev` 等は明示エラーにし、URLを `/exec` へ置換して推測しません。
同じGASプロジェクトのデプロイはScript Propertiesを共有します。更新時は旧Bootstrap版のデプロイを併用せず、リンク先のデプロイを確認してください。

## ロック・通知・復旧

状態はScript Propertiesの `APP_STATE` にJSONとして保存します。
長いトークンは2つのGAS UUIDから生成し、既定TTLは30分、最大失敗回数は5回です。
`tokenTtlMinutes` は1〜1440、`maxAttempts` は1〜100です。
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

本人メール・有効認証方式はDB操作前に保存し、Authが採番したUser IDは登録完了時に記録します。
migrate → 全有効方式のAccount登録 → Role付与 → Password Reset通知 → hook の段階進捗を保持します。
両方式有効なら1 User / 2 Accounts / 1管理者Roleです。方式設定が変わった復旧は拒否します。
Email有効時は推測困難な仮パスワードを使い、本人へはreset linkのみ送信します。
Password Reset通知が失敗した場合はRPC再試行で新しいreset tokenを発行します。
完了時は `{ "initialized": true }` のみを保存し、token・リース・復旧情報を消去します。
初期化済みGETは公開状態だけを返し、メールや登録等の副作用を起こしません。

Spreadsheet・Properties・メールは原子的なトランザクションではありません。
外部書込後・チェックポイント保存前の停止ではRepositoryから登録済みUserを復元します。
Role upsert・冪等なmigrationとhookが必要です。通知送信後・記録前の停止ではメールが重複し得ます。
古い所有者は期限や所有者IDの検証により進捗・完了を更新できず、後続リースも解除できません。
`APP_STATE`破損は明示エラーにし、勝手に別管理者を作り直しません。

## 個別の差し替え

`overrides.migrate` / `assignRole` / `notify` と
`afterInitialize` を必要な段階だけ指定できます。`notify` はRPC内のPassword Reset通知の差し替えです。
初期化リンクは同期GETのMailApp通知で送信します。
Role・通知・完了hookの引数は読み取り専用の `{ id, email, name, role }` です。
Migration時点では登録前のため `id` は未設定の場合があります。
カスタム処理もトークン検証とリース取得より後にだけ実行され、再実行可能にしてください。

## 登録と復旧に使用する汎用API

RPC入口でtoken・TTL・試行回数・通知状態・発行先・リースと
ActiveUser / EffectiveUserの非空・一致を確認した後にだけ、次を実行します。

1. DB migration。
2. 最初のprovider（Apps Script有効なら `appsScript`、それ以外は `emailPassword`）で
   `authRepository.account.findByIdentity(provider, email)` を検索。
   存在すれば `authRepository.user.find(account.userId)` で前回のUserを復元し、Identityとの整合性を検査。
   なければ `auth.registration.appsScript({ name, email })`、または
   `auth.registration.email({ name, email, password })` で最初のAccountとUserを新規登録。
   User IDはAuthが内部採番します。
3. 両方式が有効なら `authRepository.account.findByIdentity("emailPassword", email)` を検索。
   同じUserなら追加を省略し、別Userならエラー。未登録なら
   `auth.account.add(user.id, { provider: "emailPassword", email, password })` で追加。
4. User IDと登録完了を同じ進捗保存で記録し、`authorization.role.assign()`、
   Email有効時の `auth.password.forgot()`、完了hook、完了状態保存。

未初期化で既存Identityがある場合は、前回Bootstrapの登録後・進捗保存前に停止したものとして扱います。
このため、初期化前に通常のユーザー登録を許さない運用が必須です。
User欠落やAccountとUserの矛盾はエラーにし、User行を自動作成して補修しません。
登録・Account追加直後の停止でも同じUserを復元し、既存の認証情報を上書きしません。
仮パスワードは不足Accountの新規作成時だけ生成し、プロパティや公開状態には保存しません。

## 検証と依存リリース

CIは `integration/package.json` の公開済みレジストリ版をインストールし、
実Auth型とのConsumer型チェックと結合テストを実行します。未マージソースのcheckoutは行いません。
Auth 0.9.0 / Auth SheetORM 0.4.1の公開版で検証します。
App 5.5.0 / Client 0.6.0を先に公開し、その後Bootstrap 0.3.0を公開します。

```sh
npm --prefix packages/bootstrap/integration install --ignore-scripts --no-audit --package-lock=false
pnpm --filter @gasboost/bootstrap exec tsc -p integration/tsconfig.json
pnpm --filter @gasboost/bootstrap test:integration
```

`pnpm typecheck` / `pnpm test` / `pnpm build` で型と単体を検証します。
結合テストではBootstrapとSheetDBで同じNodeLockServiceを共有し、認証3パターンと
不正主体の拒否、登録後・Account追加後・進捗保存時の中断を通じて、1 User / 必要Account / 1 Roleを確認します。
App / Bootstrapをpackし、Clientをbuildした後は `pnpm --filter @gasboost/bootstrap smoke` で配布Consumerを確認できます。


## 型付き初期化エラー（0.3.0以降）

ブラウザでは `@gasboost/bootstrap/errors` を使います。このサブパスはGAS API・
Bootstrapのサーバー実装・Auth実装をimportしません。
`BOOTSTRAP_ERROR_CODES` は読み取り専用の定数、`BootstrapErrorCode` はその値のunion型です。

```ts
import { BOOTSTRAP_ERROR_CODES, type BootstrapErrorCode } from "@gasboost/bootstrap/errors";
import { AppsScriptRpcError } from "@gasboost/client";

try {
  await client.initializeApp({ token });
} catch (error) {
  if (error instanceof AppsScriptRpcError && error.code === BOOTSTRAP_ERROR_CODES.INVALID_TOKEN) {
    // Consumer側で表示や復旧処理を選択します。
  }
}
```

| code | 条件・対処 |
| --- | --- |
| `INVALID_TOKEN` | 無効なtoken、または初期化リンク未発行。通常の `/exec` から有効なメールリンクを取得します。 |
| `TOKEN_EXPIRED` | tokenの期限切れ。通常の `/exec` で再発行します。 |
| `LOCKED` | 試行回数上限。期限後に通常の `/exec` で再発行します。 |
| `IN_PROGRESS` | 通知・初期化リースが有効。既存処理の完了またはリース期限まで待って再試行します。 |
| `ALREADY_INITIALIZED` | 初期化済み。通常のアプリ画面へ進みます。 |
| `LINK_NOT_READY` | リンク送信の完了記録がない。60秒後にtokenなしの `/exec` を開き再送します。 |

`BootstrapError({ code, message })` は上記のコードだけを受け付けるErrorです。
`message` も公開されるため、token・メールアドレス・内部状態を含めないでください。
日本語の表示文言はConsumer / UI側でマッピングします。

`handle(request)` の既知の検証失敗は同期の `BootstrapError` です。HTMLの戻り値や
`BootstrapPublicState`、永続形式は変わりません。
`handlers().initializeApp` は `BootstrapError` だけをAppの `AppsScriptError` に変換し、
App / Clientの共通RPC規約で `code` と安全な `message` を伝搬します。
RPCで受け取る型は `AppsScriptRpcError` であり、`BootstrapError` のinstanceではありません。
内部不整合・DB障害・実行環境や認証設定の問題等は公開コードとして列挙せず、
予期しない例外のまま共通RPC境界へ渡し、安全な `INTERNAL_ERROR` に正規化します。

smokeではtarballを使うサーバーConsumerに加え、GAS型定義なしのブラウザConsumerの型検査と
browser bundleを検証します。bundle入力がConsumerとerrorsモジュールだけであることも確認します。

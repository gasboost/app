# @gasboost/bootstrap

GAS Web アプリの初回起動時に、DB migration → 管理者 User / Account 登録 →
管理者ロール付与 → 初期パスワード設定通知を行います。UI は Consumer 側で実装します。

## インストールと依存リリース

```sh
pnpm add @gasboost/bootstrap @gasboost/auth@^0.8.0 @gasboost/auth-sheetorm@^0.4.0 @gasboost/auth-app@^0.6.1
```

標準登録は [gasboost/auth#49](https://github.com/gasboost/auth/pull/49) の
`registration.methods` / `registration.ensure()` と `user.save()` を必要とします。
Auth 0.8.0 / auth-sheetorm 0.4.0 のリリース後に利用してください。
App は GET local middleware に対応する 5.3.0 以上が必要です。App のAPI変更はありません。
初版は 0.1.0 です。

Auth / DB は Consumer で構築したインスタンスを渡します。パッケージはそれぞれの
公開メソッドの構造型だけに依存し、Auth を実行時にロードしません。
DB は `SheetDB.migrate()`、Auth は `AppsScriptAuth`、Authorization は
`AppsScriptAuthorization` をそのまま利用できます。SheetORM の独自 Repository は
再実行可能な `user.save()` と、同じ User / Role を重複登録しない `role.assign()` を実装してください。

## 最小 Consumer

`db`・`auth`・`authorization` は、Auth / Authorization テーブルを含めた設定済みインスタンスです。
Email/Password を有効にする場合は `emailPassword.passwordReset.delivery` を設定してください。

```ts
import { AppsScript, type InferAppsScript } from "@gasboost/app";
import { authentication, handlers } from "@gasboost/auth-app";
import { AppsScriptBootstrap } from "@gasboost/bootstrap";

const bootstrap = new AppsScriptBootstrap({
  db,
  auth,
  authorization,
  tokenDigits: 6,
  tokenTtlMinutes: 30,
  maxAttempts: 5,
  administrator: { name: "システム管理者", role: "管理者" },
});

const app = new AppsScript()
  .get(
    (_request, context) => {
      const template = HtmlService.createTemplateFromFile("index");
      // force-print する JSON 内で </script> と Unicode line separator を無害化。
      template.value = JSON.stringify({
        bootstrap: context.state.get(bootstrap.KEY),
      })
        .replace(/</g, "\\u003c")
        .replace(/\u2028/g, "\\u2028")
        .replace(/\u2029/g, "\\u2029");
      return template.evaluate();
    },
    [bootstrap.middleware()],
  )
  .calls(bootstrap.handlers()) // 通常認証を掛けずに登録
  .calls(handlers(auth)) // sign-in / password reset もログイン前に利用可能
  .use(authentication(auth))
  .call("privateExample", () => ({ ok: true }));

export default app;
export type AppType = InferAppsScript<typeof app>;
```

HTML テンプレートに次を配置します。JSON は上記のエスケープ後の値だけを force-print します。

```html
<script id="app-value" type="application/json">
  <?!= value ?>
</script>
```

React 起動時に `JSON.parse(document.getElementById("app-value")!.textContent!)`
から公開状態を取得し、`bootstrap.initialized` が false なら初期設定画面、true なら通常画面を描画します。
公開型は `BootstrapPublicState` です。追加の初期状態取得 RPC は不要です。
未完了時には `settingsUrl` のリンクとトークン入力欄を表示してください。
初期設定画面で型付きクライアントの `client.initializeApp({ token })` を呼び、成功したら
戻り値 `{ initialized: true }` に従って切り替えます。パッケージは画面の表示や通常RPCのアクセス制御を行いません。

## 初期設定画面と本人の識別

1. アプリへアクセスすると Script Properties の `APP_STATE` に JSON が作られます。
2. `settingsUrl` から GAS プロジェクト設定を開き、スクリプトプロパティの
   `APP_STATE` 内にある `bootstrap.token` を確認します。編集権限が必要です。
3. 先頭のゼロを含む文字列を入力して初期化します。トークンや `APP_STATE` 全体を共有しないでください。
4. 有効な認証方式ごとに同じ管理者 User に Account を登録し、ロールを付与します。
   Email/Password 有効時は設定済み delivery でパスワードリセット用トークンを送信します。
   仮パスワードは推測困難なUUIDから生成し、返却・保存・メール送信しません。

初期管理者のメールアドレスは常に `Session.getActiveUser().getEmail()` です。
空なら明示的にエラーにし、`getEffectiveUser()` へは切り替えません。
トークン所持はスクリプトプロパティを読めたことの証明であり、Google アカウント本人確認とは別です。
編集者権限をGoogle APIで再検証する仕組みではありません。トークンを漏らした相手も入力できるため厳重に扱ってください。

GAS Web アプリの「次のユーザーとして実行」はアクセスしているユーザーを基本とし、
対象の管理者がログイン・承認した状態で初期化してください。自分として実行するデプロイや
組織のポリシーによって active user のメールが空になる場合があります。
OAuth スコープには利用する DB・通知処理に必要な権限と `userinfo.email` を設定します。
初期化中はアクセス対象を編集者・組織内に制限し、通知先のメールアドレスを確認してください。

## ロック・期限・復旧

`APP_STATE` と初期化全体を Script Lock で排他制御します。GET は同期処理でロックを取り、
RPC は照合・DB書き込み・通知・完了更新まで同じロックを保持します。
ロックの待機上限は30秒です。同時リクエストで待機上限を超えた場合は後で再試行してください。

トークンは GAS UUID と SHA-256・偏りのないサンプリングで生成します。
既定値は6桁・30分・失敗5回です。`tokenDigits` は6〜32、`tokenTtlMinutes` は1〜1440、
`maxAttempts` は1〜100を指定できます。数字トークンは string のまま送信します。
失敗上限到達後は、正しいトークンでも期限まで拒否します。GET の連打では試行回数を戻しません。
期限後の GET だけが新しいトークンと試行枠を発行します。RPC が勝手に再発行することはありません。

初回の有効なトークン照合後、管理者ID・本人メール・認証方式を **DB書き込みより先に** 保存します。
各段階の進捗を保存し、失敗時は initialized=false のまま元の本人で再試行できます。
トークンを更新しても復旧情報を保持します。認証方式が変わった場合は元の設定に戻して再試行します。
完了時は `{ "initialized": true }` だけを保存してトークンと復旧情報を消去し、再実行を拒否します。

Spreadsheet と PropertiesService は原子的トランザクションではありません。
外部書き込み後・進捗保存前に停止した段階は再実行されるため、登録は固定IDで修復、ロールは upsert、
migration と hook は再実行可能にします。通知送信後に停止すると重複メールが届くことがあります。
通知失敗時は同じ `initializeApp` を再実行すると `password.forgot()` が新トークンを再発行します。
仮パスワードや古いリセットトークンを再送しません。通知完了済みの段階は通常の再開では省略します。
完了後のリセット再発行には通常のAuth password-resetフローを利用します。

`APP_STATE` が壊れている場合は勝手に初期化し直さずエラーにします。
既存DBを残して `APP_STATE` を削除すると別の初期化になります。復旧時はプロパティを保持してください。

## 必要な段階だけを差し替える

```ts
const bootstrap = new AppsScriptBootstrap({
  db,
  auth,
  authorization,
  overrides: {
    // 他の段階は標準処理を使用。必ず再実行可能にする。
    migrate: async () => {
      db.migrate();
      await seedIdempotently();
    },
  },
  afterInitialize: async ({ id, email }) => {
    await provisionAdditionalResourcesIdempotently(id, email);
  },
});
```

`overrides` は `migrate`・`registerAdministrator`・`assignRole`・`notify` を個別に差し替えられます。
引数は読み取り専用の `{ id, email, name, role }` です。
登録の差し替えは同じ `id` を持つ User を返す必要があります。
`afterInitialize` が失敗した場合も完了せず、再試行時はその hook から再開します。
カスタム処理でも、本人識別・トークン照合・Script Lock は標準のまま適用します。


## 検証

通常は `pnpm --filter @gasboost/bootstrap typecheck` / `test` / `build` を実行します。
実際の Auth・SheetORM と接続する結合テストは、ビルド済みの auth#49 以降の checkout を指定します。

```sh
GASBOOST_AUTH_WORKSPACE=/path/to/auth pnpm --filter @gasboost/bootstrap test:integration
```

CI では依存PRのコミットを固定してこの結合テストも実行します。
パッケージの配布形式は、ルートで App / Bootstrap を pack 後、
`pnpm --filter @gasboost/bootstrap smoke` で別ディレクトリのConsumerから確認します。

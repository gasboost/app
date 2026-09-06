# @gasboost/app

Google Apps Script アプリケーション向けの軽量な TypeScript ランタイムです。

Google Apps Script 固有のグローバル関数を直接管理する代わりに、GET / POST / RPC ハンドラや middleware を通常の TypeScript API として定義できます。

## インストール

```bash
pnpm add @gasboost/app
```

npm:

```bash
npm install @gasboost/app
```

TypeScript で GAS API を利用する場合は型定義も追加してください。

```bash
pnpm add -D @types/google-apps-script
```

## Quick Start

```ts
import { AppsScript, type InferAppsScript } from "@gasboost/app";

const app = new AppsScript()
  .get((request) => {
    const name = request.query("name") ?? "world";

    return HtmlService.createHtmlOutput(`Hello ${name}`);
  })
  .post((request) => {
    return ContentService.createTextOutput(request.text());
  })
  .call("sum", (a: number, b: number) => a + b)
  .call("getUser", async (id: string) => ({
    id,
    name: "Taro",
  }));

export default app;

export type AppType = InferAppsScript<typeof app>;
```

## GET

`.get()` で `doGet` に対応するハンドラを登録します。

```ts
const app = new AppsScript().get((request) => {
  const id = request.query("id");

  return ContentService.createTextOutput(id ?? "");
});
```

登録すると、GAS から呼び出される `doGet` がグローバルランタイムへ公開されます。

クエリパラメータは以下の API から取得できます。

```ts
request.query();
request.query("id");

request.queries();
request.queries("tag");
```

GET ハンドラは `HtmlOutput` または `TextOutput` を返します。

## POST

`.post()` で `doPost` に対応するハンドラを登録します。

```ts
const app = new AppsScript().post((request) => {
  return ContentService.createTextOutput(request.text());
});
```

Body を文字列として取得できます。

```ts
request.text();
```

JSON としてパースすることもできます。

```ts
const body = request.json<{
  name: string;
}>();
```

POST ハンドラも `HtmlOutput` または `TextOutput` を返します。

## RPC

`.call()` で名前付き RPC を登録します。

```ts
const app = new AppsScript()
  .call("sum", (a: number, b: number) => a + b)
  .call("getUser", async (id: string) => ({
    id,
    name: "Taro",
  }));
```

登録された名前は GAS のグローバルスコープへ公開されます。

同じ名前を複数回登録することはできません。

RPC ハンドラは同期・非同期のどちらにも対応しています。

## Middleware

`.use()` で GET / POST / RPC の実行前後に共通処理を追加できます。

```ts
const app = new AppsScript()
  .use((state, next) => {
    console.log("before");

    const result = next();

    console.log("after");

    return result;
  })
  .call("hello", () => {
    return "Hello";
  });
```

middleware は登録順に実行されます。

`next()` を呼ぶと次の middleware へ進み、最後の middleware から `next()` を呼ぶと対象の GET / POST / RPC ハンドラが実行されます。

```ts
const app = new AppsScript()
  .use((state, next) => {
    console.log("middleware 1 before");

    const result = next();

    console.log("middleware 1 after");

    return result;
  })
  .use((state, next) => {
    console.log("middleware 2 before");

    const result = next();

    console.log("middleware 2 after");

    return result;
  })
  .call("hello", () => {
    console.log("handler");

    return "Hello";
  });
```

実行順は次のようになります。

```text
middleware 1 before
middleware 2 before
handler
middleware 2 after
middleware 1 after
```

### Short circuit

`next()` を呼ばずに値を返すことで、後続の middleware とハンドラの実行を停止できます。

```ts
const app = new AppsScript()
  .use((state, next) => {
    const authenticated = false;

    if (!authenticated) {
      return {
        error: "Unauthorized",
      };
    }

    return next();
  })
  .call("getProfile", () => {
    return {
      name: "Taro",
    };
  });
```

この場合、`getProfile` ハンドラは実行されません。

middleware は GET / POST / RPC のすべてに適用されます。

## State

middleware とハンドラの間で値を共有するために `state` を利用できます。

State の型は `AppsScript` の型引数として定義します。

```ts
interface User {
  id: string;
  name: string;
}

type AppState = {
  user: User;
};

const app = new AppsScript<AppState>();
```

middleware から値を設定できます。

```ts
app.use((state, next) => {
  state.set("user", {
    id: "1",
    name: "Taro",
  });

  return next();
});
```

ハンドラからは `app.state` を通して取得できます。

```ts
app.call("getCurrentUser", () => {
  return app.state.get("user");
});
```

State の key と value は型安全です。

```ts
app.state.set("user", {
  id: "1",
  name: "Taro",
});

const user = app.state.get("user");
// User | undefined
```

存在しない key や異なる型の値は TypeScript の型エラーになります。

State は logging、authentication、authorization、tracing など、middleware から後続処理へ情報を渡す用途に利用できます。

## Middleware をパッケージとして提供する

`Middleware` は public API として利用できます。

これにより、`@gasboost/auth` のような外部パッケージから `@gasboost/app` と互換性のある middleware を提供できます。

```ts
import type { Middleware } from "@gasboost/app";

interface User {
  id: string;
  name: string;
}

type AuthState = {
  user: User;
};

export const auth = (): Middleware<AuthState> => {
  return (state, next) => {
    const user = {
      id: "1",
      name: "Taro",
    };

    state.set("user", user);

    return next();
  };
};
```

利用側では通常の middleware と同じように登録できます。

```ts
import { AppsScript } from "@gasboost/app";
import { auth } from "@gasboost/auth";

type AppState = {
  user: {
    id: string;
    name: string;
  };
};

const app = new AppsScript<AppState>()
  .use(auth())
  .call("getCurrentUser", () => {
    return app.state.get("user");
  });
```

これにより、認証などの個別機能を `@gasboost/app` 本体へ組み込まず、独立した middleware パッケージとして提供できます。

## InferAppsScript

`InferAppsScript` は、登録された RPC からクライアントと共有できる RPC 契約を生成します。

```ts
export type AppType = InferAppsScript<typeof app>;
```

例えば、

```ts
.call("getUser", async (id: string) => ({
  id,
  name: "Taro",
}));
```

から次の型が推論されます。

```ts
type AppType = {
  getUser: {
    args: [id: string];
    result: {
      id: string;
      name: string;
    };
  };
};
```

Promise の戻り値は展開されます。

また、GAS RPC のレスポンスが JSON として転送されることに合わせて、戻り値に含まれる `Date` は型上でも `string` に変換されます。

配列やオブジェクト内に含まれる `Date` についても再帰的に変換されます。

Middleware や State の型は RPC 契約には含まれません。

## フロントエンドとの型共有

バックエンドから RPC 契約だけを import できます。

```ts
import type { AppType } from "../backend/main";
```

`import type` を使用することで、バックエンドのランタイムコードをフロントエンド bundle に含めずに型だけを共有できます。

この型は `@gasboost/client` から利用できます。

### GAS 型を backend のみに限定する

`@types/google-apps-script` が提供する `SpreadsheetApp`、`Utilities`、`HtmlService` などは ambient global 型です。

frontend 側へ GAS 固有の global 型を持ち込まないため、`google-apps-script` の型は backend 側の TypeScript 設定でだけ有効にしてください。

例えば次のような構成にできます。

```text
project/
├── tsconfig.json
└── src/
    ├── backend/
    │   ├── tsconfig.json
    │   └── main.ts
    └── frontend/
        └── main.ts
```

backend の `tsconfig.json` だけに GAS の型を指定します。

```json
{
  "compilerOptions": {
    "types": ["google-apps-script"]
  }
}
```

root や frontend 側では `google-apps-script` を読み込む必要はありません。

frontend では backend が export した RPC 契約を `import type` で参照します。

```ts
import type { AppType } from "../backend/main";
```

`import type` のため、backend の runtime 実装は frontend bundle に含まれません。

また、backend 配下だけで `google-apps-script` の型を有効にしておけば、`SpreadsheetApp`、`Utilities`、`HtmlService` などの GAS 固有 global 型を frontend 側で利用可能にする必要もありません。

TypeScript Project References は、この型共有のための必須要件ではありません。プロジェクト構成上必要な場合には利用できますが、gasboost の標準的な型共有では backend 側に GAS 型のスコープを限定し、frontend から `import type` する構成で十分です。

## 責務

`@gasboost/app` が担当するもの:

- GET ハンドラ登録
- POST ハンドラ登録
- RPC ハンドラ登録
- middleware の登録と実行
- middleware 間およびハンドラとの State 共有
- middleware による処理の short circuit
- GAS リクエストのラップ
- GET / POST dispatch
- RPC dispatch
- ハンドラのグローバルランタイムへの登録
- RPC 契約の型推論
- GAS RPC の JSON シリアライズに対応した戻り値型の変換

認証、認可、logging、tracing などの個別機能は `@gasboost/app` 本体では扱わず、middleware を利用する別パッケージとして実装できます。

Google Apps Script が静的に認識するためのグローバル関数宣言の生成は `@gasboost/vite` が担当します。

## GAS API

GAS API 自体は抽象化しません。

```ts
SpreadsheetApp.getActive();
HtmlService.createHtmlOutput();
ContentService.createTextOutput();
```

通常通り直接利用できます。

## License

MIT

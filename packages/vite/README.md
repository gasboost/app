# @gasboost/vite

`@gasboost/app` で構築した Google Apps Script アプリケーションを、Vite でビルド・ローカル開発するためのプラグインです。

`@gasboost/vite` は用途ごとに2つの Vite Plugin を提供します。

- `build` — Google Apps Script 向けの production build
- `dev` — ローカル開発時の RPC 実行

## インストール

```bash
pnpm add @gasboost/app
pnpm add -D @gasboost/vite vite
```

npm:

```bash
npm install @gasboost/app
npm install -D @gasboost/vite vite
```

## Quick Start

まず `@gasboost/app` でバックエンドを定義します。

```ts
// src/server.ts

import { AppsScript } from "@gasboost/app";

const app = new AppsScript()
  .get(() => {
    return HtmlService.createHtmlOutput("Hello");
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
```

`gasboost()` から `build` と `dev` を取得し、1つの `vite.config.ts` の中で mode に応じて使い分けます。

frontend と backend は成果物と build graph が異なるため、同時に1つの Vite build へ混在させません。

```ts
// vite.config.ts

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { gasboost } from "@gasboost/vite";

const { build, dev } = gasboost({
  entry: "src/server.ts",
  envDir: ".env",
});

export default defineConfig(({ mode }) => {
  if (mode === "server") {
    return {
      plugins: [build],
      build: {
        outDir: "dist",
        emptyOutDir: false,
      },
    };
  }

  return {
    plugins: [react(), viteSingleFile(), dev],
    build: {
      outDir: "dist",
    },
  };
});
```

この例では、frontend build と backend build を mode で分離します。

```json
{
  "scripts": {
    "dev": "vite",
    "build:client": "vite build --mode client",
    "build:server": "vite build --mode server",
    "build": "pnpm build:client && pnpm build:server"
  }
}
```

```text
vite
  ↓
gasboost:dev

vite build --mode client
  ↓
frontend build

vite build --mode server
  ↓
gasboost:build
```

frontend 側の React、single-file 化などの設定は利用側プロジェクトの責務です。

## gasboost()

```ts
const { build, dev } = gasboost({
  entry: "src/server.ts",
  envDir: "config",
});
```

戻り値:

```ts
{
  build: Plugin;
  dev: Plugin;
}
```

### `entry`

必須です。

`AppsScript` を定義して default export している entry file を指定します。

```ts
gasboost({
  entry: "src/server.ts",
});
```

### `envDir`

任意です。

build 時に Vite が環境変数ファイルを読み込むディレクトリを指定します。

```ts
gasboost({
  entry: "src/server.ts",
  envDir: "config",
});
```

---

# Build Plugin

`build` は `vite build` のときだけ動作し、GAS backend build を担当します。

frontend / backend を同じ `vite.config.ts` で扱う場合は、server 用 mode のときだけ `plugins` に含めてください。

```ts
const { build } = gasboost({
  entry: "src/server.ts",
});

export default defineConfig(({ mode }) => {
  if (mode === "server") {
    return {
      plugins: [build],
    };
  }

  return {
    plugins: [],
  };
});
```

`build` plugin は次の処理を担当します。

- entry file の静的解析
- `AppsScript` に登録された GET / POST / RPC の検出
- GAS が認識するグローバル関数宣言の生成
- GAS 向け Vite build configuration
- 環境変数の読み込み

## グローバル関数の生成

例えば次のアプリケーションを定義した場合:

```ts
const app = new AppsScript()
  .get(...)
  .post(...)
  .call("getUser", ...)
  .call("sum", ...);

export default app;
```

build plugin は GAS が認識するためのグローバル関数宣言を生成します。

```js
function doGet() {}
function doPost() {}
function getUser() {}
function sum() {}
```

これらは関数名を Google Apps Script に認識させるための宣言です。

実際のハンドラ登録と dispatch は `@gasboost/app` がランタイム上で行います。

```text
@gasboost/vite
  static analysis
  global function declarations
        ↓
@gasboost/app
  runtime registration
  dispatch
```

## 静的解析

entry file には1つの `AppsScript` インスタンスを定義し、default export します。

```ts
const app = new AppsScript();

app.get(...);
app.call("getUser", ...);

export default app;
```

チェーン形式にも対応しています。

```ts
const app = new AppsScript()
  .get(...)
  .post(...)
  .call("getUser", ...);

export default app;
```

RPC 名は文字列リテラルで指定する必要があります。

```ts
app.call("getUser", handler);
```

次のような動的な名前は静的解析の対象外です。

```ts
const name = "getUser";

app.call(name, handler);
```

build 時に GAS のグローバル関数名を確定する必要があるためです。

## 検証

静的解析時には、曖昧なアプリケーション定義をエラーとして扱います。

- GET ハンドラの重複
- POST ハンドラの重複
- RPC 名の重複
- entry 内の複数 `AppsScript` インスタンス
- default export されていない `AppsScript`

## GAS 向け build configuration

現在の build 設定:

- target: ECMAScript 2019
- output format: CommonJS
- output directory: `dist`
- `entry` を build input として利用

## 環境変数

Vite 標準の環境変数機構を利用します。

```text
config/
├── .env
├── .env.development
└── .env.production
```

```ts
const { build } = gasboost({
  entry: "src/server.ts",
  envDir: "config",
});
```

アプリケーションでは通常の Vite と同様に参照できます。

```ts
const apiUrl = import.meta.env.VITE_API_URL;
```

---

# Dev Plugin

`dev` は Vite Dev Server 上でのみ動作します。

frontend の開発用 Vite config に追加して利用します。

```ts
const { dev } = gasboost({
  entry: "src/server.ts",
});

export default defineConfig({
  plugins: [dev],
});
```

`dev` plugin は、GAS にデプロイしなくてもローカル環境から `AppsScript` の RPC を実行できるエンドポイントを Vite Dev Server に追加します。

## Local RPC

ローカル RPC のエンドポイントは次の形式です。

```text
POST /__gasboost/{rpcName}
```

例えば、

```ts
const app = new AppsScript().call("sum", (a: number, b: number) => a + b);

export default app;
```

に対して、

```http
POST /__gasboost/sum
Content-Type: application/json
```

```json
{
  "args": [1, 2]
}
```

を送信すると、内部では次の dispatch が実行されます。

```ts
app.dispatch("sum", 1, 2);
```

レスポンス:

```json
3
```

## RPC Request

Request Body は次の形式です。

```ts
{
  args: unknown[];
}
```

例えば複数の引数を持つ RPC:

```ts
app.call(
  "example",
  (id: number, name: string, active: boolean, options: { value: number }) => {
    // ...
  },
);
```

に対して、

```json
{
  "args": [
    1,
    "Taro",
    true,
    {
      "value": 4
    }
  ]
}
```

のように送信できます。

### 引数なし RPC

Request Body が空の場合は、引数なし RPC として扱われます。

```http
POST /__gasboost/noArgs
```

内部では次のように dispatch されます。

```ts
app.dispatch("noArgs");
```

明示的に送る場合は次でも構いません。

```json
{
  "args": []
}
```

## RPC Response

`@gasboost/app` の `dispatch()` が返す `AppsScriptResponse.contents` を、そのまま HTTP Response Body として返します。

例えば、

```ts
app.call("getUser", () => ({
  id: 1,
  name: "Taro",
}));
```

に対するレスポンスは:

```json
{
  "id": 1,
  "name": "Taro"
}
```

となります。

Response の Content-Type は:

```text
application/json; charset=utf-8
```

です。

## Async RPC

非同期 RPC にも対応しています。

```ts
app.call("loadUser", async (id: string) => {
  const user = await loadUser(id);

  return user;
});
```

dev plugin は `dispatch()` の完了を待ってからレスポンスを返します。

## 開発中の module loading

RPC リクエストごとに、指定された `entry` を Vite の `ssrLoadModule()` で読み込みます。

```text
POST /__gasboost/sum
        ↓
ssrLoadModule("src/server.ts")
        ↓
AppsScript.dispatch("sum", ...)
```

そのため、Vite Dev Server 上の最新のサーバーコードを利用して RPC を実行できます。

## Error Response

### 不正な Request Body

JSON として不正な body や、`args` が配列でない body は `400` を返します。

```json
{
  "args": "invalid"
}
```

レスポンス例:

```json
{
  "error": {
    "name": "InvalidRpcRequestError",
    "message": "Invalid RPC request body. Expected { args: unknown[] }."
  }
}
```

JSON 自体が不正な場合も `400` です。

### POST 以外

Local RPC endpoint は POST のみ受け付けます。

```http
GET /__gasboost/sum
```

は `405` になります。

```json
{
  "error": {
    "name": "MethodNotAllowedError",
    "message": "Only POST is allowed."
  }
}
```

### 未登録 RPC

存在しない RPC を呼び出した場合は `500` を返します。

```text
POST /__gasboost/unknown
```

```json
{
  "error": {
    "name": "Error",
    "message": "Function unknown is not registered."
  }
}
```

### Handler Error

RPC handler 内で例外が発生した場合も `500` として JSON で返されます。

```json
{
  "error": {
    "name": "TypeError",
    "message": "handler failed"
  }
}
```

## Local RPC の対象 path

次の形式だけを RPC として扱います。

```text
/__gasboost/{rpcName}
```

例えば以下は対象です。

```text
/__gasboost/getUser
/__gasboost/sum
```

一方、次のような path は RPC として扱いません。

```text
/__gasboost/
/__gasboost/foo/bar
/api/users
```

通常の Vite middleware chain に処理を渡します。

query string が付いていても RPC 名は正しく解決されます。

```text
/__gasboost/hello?foo=bar
```

URL encoded な RPC 名も decode されます。

```text
/__gasboost/hello%20world
```

---

# build と dev の責務

```text
gasboost()
   │
   ├─ build
   │    ├─ AppsScript の静的解析
   │    ├─ GAS グローバル関数生成
   │    ├─ GAS 向け build config
   │    └─ backend production build
   │
   └─ dev
        ├─ Vite Dev Server middleware
        ├─ Local RPC endpoint
        ├─ entry の ssrLoadModule
        └─ AppsScript.dispatch
```

frontend と backend を1つの `vite.config.ts` で扱う場合は、mode で分岐します。

```ts
const { build, dev } = gasboost({
  entry: "src/server.ts",
});

export default defineConfig(({ mode }) => {
  if (mode === "server") {
    return {
      plugins: [build],
    };
  }

  return {
    plugins: [dev],
  };
});
```

`build` を通常の frontend build に含めると、server entry が Vite の build input になるため、frontend と backend の build は分離してください。

## 関連パッケージ

- `@gasboost/app` — GAS バックエンドランタイムと RPC 定義
- `@gasboost/client` — フロントエンド側の型安全 RPC クライアント

## License

MIT

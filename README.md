# Gasboost App

Gasboost App は、Google Apps Script のバックエンドを TypeScript で構築するための軽量なアプリケーションフレームワークです。

Google Apps Script では `doGet`、`doPost`、RPC 用関数などをグローバル関数として定義する必要があります。Gasboost App はこの制約を薄く隠蔽し、通常の TypeScript コードとして GET / POST / RPC ハンドラを定義できるようにします。

```ts
import { AppsScript, type InferAppsScript } from "@gasboost/app";

const app = new AppsScript()
  .get((request) => {
    return HtmlService.createHtmlOutput(
      `Hello ${request.query("name") ?? "world"}`,
    );
  })
  .post((request) => {
    return ContentService.createTextOutput(request.text());
  })
  .call("getUser", async (id: string) => {
    return {
      id,
      name: "Taro",
    };
  });

export default app;

export type AppType = InferAppsScript<typeof app>;
```

## パッケージ構成

### `@gasboost/app`

Gasboost アプリケーションのランタイムと型定義を提供します。

主な機能:

- `AppsScript`
- GET ハンドラ登録
- POST ハンドラ登録
- RPC ハンドラ登録
- GAS リクエストのラッパー
- `InferAppsScript` による RPC 契約の型推論

### `@gasboost/vite`

Gasboost アプリケーションを Google Apps Script 向けにビルドするための Vite プラグインです。

主な機能:

- GAS 向け Vite ビルド設定
- `AppsScript` 登録内容の静的解析
- GAS グローバル関数宣言の生成
- Vite の環境変数機構との統合

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

### Backend

```ts
// src/main.ts

import { AppsScript, type InferAppsScript } from "@gasboost/app";

const app = new AppsScript()
  .get((request) => {
    const name = request.query("name") ?? "world";

    return HtmlService.createHtmlOutput(`Hello ${name}`);
  })
  .post((request) => {
    return ContentService.createTextOutput(request.text());
  })
  .call("getUser", async (id: string) => {
    return {
      id,
      name: "Taro",
    };
  })
  .call("sum", (a: number, b: number) => a + b);

export default app;

export type AppType = InferAppsScript<typeof app>;
```

### Vite

```ts
// vite.config.ts

import { defineConfig } from "vite";
import { gasboost } from "@gasboost/vite";

export default defineConfig({
  plugins: [
    gasboost({
      entry: "src/main.ts",
    }),
  ],
});
```

ビルドします。

```bash
vite build
```

`AppsScript` に登録されたハンドラに応じて、Google Apps Script が認識するためのグローバル関数宣言が生成されます。

上記の例では、以下に対応する関数が生成されます。

```js
function doGet() {}
function doPost() {}
function getUser() {}
function sum() {}
```

実際の処理は `@gasboost/app` がランタイム上で登録します。

## GET

`.get()` で Google Apps Script の `doGet` に相当するハンドラを登録します。

```ts
const app = new AppsScript().get((request) => {
  const id = request.query("id");

  return ContentService.createTextOutput(id ?? "");
});
```

クエリパラメータは以下の API から取得できます。

```ts
request.query();
request.query("id");

request.queries();
request.queries("tag");
```

## POST

`.post()` で Google Apps Script の `doPost` に相当するハンドラを登録します。

```ts
const app = new AppsScript().post((request) => {
  return ContentService.createTextOutput(request.text());
});
```

リクエストボディを文字列で取得できます。

```ts
const text = request.text();
```

JSON として取得することもできます。

```ts
const body = request.json<{
  name: string;
}>();
```

## RPC

`.call()` で GAS のグローバル関数として呼び出す RPC ハンドラを登録します。

```ts
const app = new AppsScript()
  .call("sum", (a: number, b: number) => a + b)
  .call("getUser", async (id: string) => ({
    id,
    name: "Taro",
  }));
```

各 RPC ハンドラの引数型と戻り値型は TypeScript 上で保持されます。

## フロントエンドとの RPC 型共有

`InferAppsScript` を使うと、`AppsScript` から RPC 契約だけを型として取り出せます。

```ts
// backend/main.ts

export type AppType = InferAppsScript<typeof app>;
```

フロントエンドでは型だけを import できます。

```ts
import type { AppType } from "../backend/main";
```

例えば `AppType["getUser"]` は次の型として推論されます。

```ts
{
  args: [id: string];
  result: {
    id: string;
    name: string;
  };
}
```

`import type` を利用するため、フロントエンドの JavaScript bundle にバックエンドのランタイム実装は出力されません。

## 環境変数

`@gasboost/vite` は Vite 標準の環境変数機構を利用します。

環境変数ファイルのディレクトリを変更する場合は `envDir` を指定します。

```ts
gasboost({
  entry: "src/main.ts",
  envDir: "config",
});
```

例えば次の構成を利用できます。

```text
config/
├── .env
└── .env.production
```

`VITE_` プレフィックスを持つ値は通常の Vite と同様に利用できます。

```ts
const apiUrl = import.meta.env.VITE_API_URL;
```

## 責務

### `@gasboost/app`

アプリケーションのランタイムを担当します。

- GET / POST ハンドラ登録
- RPC ハンドラ登録
- GET / POST dispatch
- RPC dispatch
- GAS リクエストのラップ
- 登録された処理のグローバルランタイムへの公開
- RPC 契約の型推論

### `@gasboost/vite`

ビルド時の統合を担当します。

- GAS 向け Vite 設定
- 登録されたハンドラの静的解析
- GAS グローバル関数宣言の生成
- 環境変数設定
- production bundle の生成

Vite プラグインはアプリケーションの runtime dispatch 自体は担当しません。

## 現在の対象外

Gasboost は意図的に責務を小さく保っています。

現時点では以下を目的としていません。

- Hono 互換
- Google Apps Script API 全体の抽象化
- URL routing
- middleware
- 高機能な HTTP framework
- `SpreadsheetApp`、`HtmlService`、`ContentService` などの GAS API の置き換え

Gasboost は、Google Apps Script 固有のグローバル関数境界を扱いやすくすることに集中しています。

## License

MIT

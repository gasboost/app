# @gasboost/app

Google Apps Script アプリケーション向けのランタイムと型安全なハンドラ登録 API を提供します。

`@gasboost/app` を使うことで、Google Apps Script 固有のグローバル関数を直接管理せず、通常の TypeScript API として GET / POST / RPC ハンドラを定義できます。

## インストール

```bash
pnpm add @gasboost/app
```

npm:

```bash
npm install @gasboost/app
```

Google Apps Script のバックエンドを型チェックする場合は GAS の型定義も必要です。

```bash
pnpm add -D @types/google-apps-script
```

## AppsScript

`AppsScript` を生成してアプリケーションを定義します。

```ts
import { AppsScript, type InferAppsScript } from "@gasboost/app";

const app = new AppsScript();

export default app;
```

ハンドラはチェーン形式で登録できます。

```ts
const app = new AppsScript()
  .get((request) => {
    return HtmlService.createHtmlOutput("Hello");
  })
  .post((request) => {
    return ContentService.createTextOutput(request.text());
  })
  .call("sum", (a: number, b: number) => a + b);

export default app;
```

## GET

`.get()` で `doGet` に相当するハンドラを登録します。

```ts
const app = new AppsScript().get((request) => {
  const name = request.query("name") ?? "world";

  return HtmlService.createHtmlOutput(`Hello ${name}`);
});
```

リクエストのクエリパラメータを取得できます。

すべての単一値パラメータ:

```ts
request.query();
```

特定のパラメータ:

```ts
request.query("name");
```

複数値パラメータ:

```ts
request.queries();
request.queries("tag");
```

## POST

`.post()` で `doPost` に相当するハンドラを登録します。

```ts
const app = new AppsScript().post((request) => {
  return ContentService.createTextOutput(request.text());
});
```

リクエストボディを文字列として取得できます。

```ts
const text = request.text();
```

JSON としてパースすることもできます。

```ts
const body = request.json<{
  name: string;
}>();
```

## RPC

`.call()` で名前付き RPC ハンドラを登録します。

```ts
const app = new AppsScript()
  .call("sum", (a: number, b: number) => a + b)
  .call("getUser", async (id: string) => ({
    id,
    name: "Taro",
  }));
```

同じ RPC 名を複数回登録することはできません。

登録された RPC はランタイムのグローバルスコープへ公開され、対応する `AppsScript` インスタンスを通じて dispatch されます。

## InferAppsScript

`InferAppsScript` を使うと、アプリケーションから RPC 契約を型として取り出せます。

```ts
const app = new AppsScript().call("getUser", async (id: string) => ({
  id,
  name: "Taro",
}));

export type AppType = InferAppsScript<typeof app>;
```

推論される型は次のようになります。

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

Promise の戻り値は自動的に展開されます。

## フロントエンドとの型共有

アプリケーションの RPC 契約は、型だけをフロントエンドから import できます。

```ts
import type { AppType } from "../backend/main";
```

`import type` を利用することで、バックエンドのランタイム実装をフロントエンドの JavaScript bundle に含めずに RPC 契約だけを共有できます。

## ランタイム上の責務

`@gasboost/app` はアプリケーションの実行時処理を担当します。

主な責務:

- GET ハンドラ登録
- POST ハンドラ登録
- RPC ハンドラ登録
- GAS リクエストのラップ
- GET / POST dispatch
- RPC dispatch
- GAS から呼び出す実体関数のグローバルランタイムへの登録
- RPC 契約の型推論

Google Apps Script が認識するためのグローバル関数宣言の生成は `@gasboost/vite` が担当します。

## GAS API

`@gasboost/app` は Google Apps Script API 自体を抽象化しません。

通常通り GAS API を直接利用できます。

```ts
SpreadsheetApp.getActive();
HtmlService.createHtmlOutput();
ContentService.createTextOutput();
```

## 現在の対象外

現時点では以下を提供しません。

- Hono 互換
- URL routing
- middleware
- nested router
- 高機能な HTTP framework
- Google Apps Script API 全体の抽象化

このパッケージは、TypeScript アプリケーションと Google Apps Script 固有のグローバル関数モデルの境界を扱うことに集中しています。

## 関連パッケージ

Google Apps Script 向けにビルドする場合は `@gasboost/vite` を利用してください。

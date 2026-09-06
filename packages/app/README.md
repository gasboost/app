# @gasboost/app

Google Apps Script アプリケーション向けの軽量な TypeScript ランタイムです。

Google Apps Script 固有のグローバル関数を直接管理する代わりに、GET / POST / RPC ハンドラを通常の TypeScript API として定義できます。

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

## フロントエンドとの型共有

バックエンドから RPC 契約だけを import できます。

```ts
import type { AppType } from "../backend/main";
```

`import type` を使用することで、バックエンドのランタイムコードをフロントエンド bundle に含めずに型だけを共有できます。

この型は `@gasboost/client` から利用できます。

### TypeScript Project References

バックエンドで定義した `AppType` をフロントエンドへ共有する場合は、バックエンドとフロントエンドを分離した monorepo 構成にし、TypeScript の Project References を利用してください。

これは `@gasboost/app` 単体では解決できない TypeScript のプロジェクト境界に関する問題です。

バックエンド側には `google-apps-script` の型が必要ですが、それらをフロントエンドの TypeScript プロジェクトへ直接含めると、GAS 固有のグローバル型がフロントエンド側へ漏れ出します。

そのため、例えば次のようにプロジェクトを分離します。

```text
project/
├── tsconfig.json
├── backend/
│   ├── tsconfig.json
│   └── main.ts
└── frontend/
    ├── tsconfig.json
    └── main.ts
```

root の `tsconfig.json` では、backend と frontend を Project Reference として登録します。

```json
{
  "files": [],
  "references": [
    {
      "path": "./backend"
    },
    {
      "path": "./frontend"
    }
  ]
}
```

backend 側では GAS の型を有効にし、型宣言を生成できる composite project とします。

```json
{
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "emitDeclarationOnly": true,
    "types": ["google-apps-script"]
  }
}
```

frontend 側では GAS の型を含めず、backend を Project Reference として参照します。

```json
{
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "emitDeclarationOnly": true,
    "types": []
  },
  "references": [
    {
      "path": "../backend"
    }
  ]
}
```

これにより、frontend は backend が公開する `AppType` を利用しつつ、`SpreadsheetApp` や `HtmlService` などの GAS 固有のグローバル型を自身の型空間へ取り込みません。

```ts
import type { AppType } from "../backend/main";
```

`@gasboost/app` の consumer test もこの構成で型境界を検証しています。

## 責務

`@gasboost/app` が担当するもの:

- GET ハンドラ登録
- POST ハンドラ登録
- RPC ハンドラ登録
- GAS リクエストのラップ
- GET / POST dispatch
- RPC dispatch
- ハンドラのグローバルランタイムへの登録
- RPC 契約の型推論
- GAS RPC の JSON シリアライズに対応した戻り値型の変換

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

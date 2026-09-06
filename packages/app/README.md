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

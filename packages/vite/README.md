# @gasboost/vite

`@gasboost/app` で構築したアプリケーションを Google Apps Script 向けにビルドするための Vite プラグインです。

アプリケーションの entry file を静的解析し、`AppsScript` に登録されたハンドラを検出して、Google Apps Script が認識するためのグローバル関数宣言を生成します。

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

## 使い方

まず通常の Gasboost アプリケーションを作成します。

```ts
// src/main.ts

import { AppsScript } from "@gasboost/app";

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

Vite を設定します。

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

通常通りビルドできます。

```bash
vite build
```

## オプション

### `entry`

必須です。

`AppsScript` アプリケーションを定義している entry file のパスを指定します。

```ts
gasboost({
  entry: "src/main.ts",
});
```

entry file には1つの `AppsScript` インスタンスを定義し、そのインスタンスを default export する必要があります。

```ts
const app = new AppsScript();

export default app;
```

チェーン形式の登録に対応しています。

```ts
const app = new AppsScript()
  .get(...)
  .post(...)
  .call("getUser", ...);

export default app;
```

インスタンス生成後に登録する形式にも対応しています。

```ts
const app = new AppsScript();

app.get(...);
app.call("getUser", ...);

export default app;
```

### `envDir`

任意です。

Vite が環境変数ファイルを読み込むディレクトリを指定します。

```ts
gasboost({
  entry: "src/main.ts",
  envDir: "config",
});
```

例えば以下の構成を利用できます。

```text
config/
├── .env
├── .env.development
└── .env.production
```

## 生成されるグローバル関数

Google Apps Script はトップレベルのグローバル関数を entry point として認識します。

例えば次のアプリケーションを定義した場合:

```ts
const app = new AppsScript()
  .get(...)
  .post(...)
  .call("getUser", ...)
  .call("sum", ...);

export default app;
```

ビルド結果には以下に対応するグローバル関数宣言が生成されます。

```js
function doGet() {}
function doPost() {}
function getUser() {}
function sum() {}
```

これらの宣言は Google Apps Script に関数名を認識させるためのものです。

実際の dispatch 処理は行いません。

ハンドラの実体は `@gasboost/app` がランタイム上で登録します。

責務は次のように分離されています。

```text
@gasboost/app
  runtime registration
  handler dispatch
  globalThis implementation

@gasboost/vite
  static analysis
  GAS build configuration
  global function declarations
```

## 静的解析

プラグインは指定された entry file を静的解析します。

対象となる `AppsScript` インスタンスに対する登録を検出します。

```ts
app.get(...);
app.post(...);
app.call("getUser", ...);
```

別オブジェクトの同名メソッドは無視されます。

```ts
other.get(...);
other.call("something", ...);
```

### RPC 名

RPC 名は文字列リテラルで指定する必要があります。

対応:

```ts
app.call("getUser", handler);
```

非対応:

```ts
const name = "getUser";

app.call(name, handler);
```

ビルド時に生成する GAS グローバル関数名を静的に確定するため、この制約があります。

### 重複登録

以下の曖昧な登録はエラーになります。

- GET ハンドラの重複
- POST ハンドラの重複
- RPC 名の重複
- entry 内に複数の `AppsScript` インスタンスが存在する場合

`AppsScript` インスタンスは default export されている必要があります。

## GAS 向けビルド設定

`gasboost()` が Google Apps Script 向けの Vite build configuration を提供します。

現在は以下の設定を利用します。

- target: ECMAScript 2019
- output format: CommonJS
- output directory: `dist`
- `entry` で指定されたファイルを build input として利用

利用側の Vite config で GAS 固有の build setting を重複して定義する必要はありません。

## 環境変数

環境変数は Vite 標準の仕組みを利用します。

例えば:

```text
config/.env
```

```env
VITE_API_URL=https://example.com
```

`envDir` を設定します。

```ts
gasboost({
  entry: "src/main.ts",
  envDir: "config",
});
```

アプリケーションから通常通り参照できます。

```ts
const apiUrl = import.meta.env.VITE_API_URL;
```

mode ごとの環境変数ファイルにも対応します。

```bash
vite build --mode production
```

`envDir: "config"` の場合、例えば以下が読み込まれます。

```text
config/.env.production
```

## 責務

`@gasboost/vite` はビルド時の処理のみを担当します。

主な責務:

- `AppsScript` 登録内容の静的解析
- Google Apps Script 向け Vite configuration
- GAS グローバル関数宣言の生成
- Vite 環境変数との統合

以下は担当しません。

- GET ハンドラの実行
- POST ハンドラの実行
- RPC dispatch
- ハンドラ実体のランタイム登録
- Google Apps Script API 自体の抽象化

これらの runtime responsibility は `@gasboost/app` が担当します。

## 現在の制約

Analyzer は、意図的にシンプルな entry file 構造のみを対象としています。

以下のような alias を介した default export は現在対象外です。

```ts
const app = new AppsScript();
const exported = app;

export default exported;
```

別関数の内部に登録処理を隠す形式も対象外です。

```ts
registerHandlers(app);
```

別ファイルに登録処理を分散する形式も現在対象外です。

```ts
import { registerHandlers } from "./handlers";

registerHandlers(app);
```

登録内容を entry file から静的に確定できるようにすることで、生成する GAS グローバル関数を決定的にしています。

## 関連パッケージ

アプリケーションの runtime と handler registration には `@gasboost/app` を利用してください。

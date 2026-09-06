# gasboost/app

Google Apps Script で TypeScript アプリケーションを構築するためのライブラリ群です。

Google Apps Script 固有のグローバル関数、RPC、ビルド、ブラウザとの通信、React との統合を、それぞれ独立したパッケージとして提供します。

## パッケージ

| パッケージ         | 役割                                              |
| ------------------ | ------------------------------------------------- |
| `@gasboost/app`    | GET / POST / RPC を定義するバックエンドランタイム |
| `@gasboost/vite`   | GAS 向けの Vite ビルドと開発環境                  |
| `@gasboost/client` | 型安全な RPC クライアントと非同期 Job 管理        |
| `@gasboost/react`  | React Router / Job 状態との統合                   |

## 全体構成

```text
React
  ↓
@gasboost/react
  ↓
@gasboost/client
  ↓
google.script.run
  ↓
Google Apps Script
  ↓
@gasboost/app
```

ビルドとローカル開発時の統合は `@gasboost/vite` が担当します。

## Backend

```bash
pnpm add @gasboost/app
```

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
  .call("sum", (a: number, b: number) => a + b)
  .call("getUser", async (id: string) => ({
    id,
    name: "Taro",
  }));

export default app;

export type AppType = InferAppsScript<typeof app>;
```

`InferAppsScript` によって RPC の引数と戻り値を型としてフロントエンドへ共有できます。

## Build

```bash
pnpm add -D @gasboost/vite vite
```

```ts
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

`@gasboost/vite` は entry file を静的解析し、Google Apps Script が認識するために必要なグローバル関数宣言を生成します。

## Client

`@gasboost/client` は `InferAppsScript` で生成された RPC 契約を利用して、型安全なクライアントを生成します。

```ts
import { appsScriptClient } from "@gasboost/client";
import type { AppType } from "../backend/main";

const { client, jobs } = appsScriptClient<AppType>();

const result = await client.sum(1, 2);
```

RPC は `google.script.run` を通して GAS 上の対応する関数を呼び出します。

RPC の実行は Job として管理され、実行状態の購読、キャンセル、リトライにも対応しています。

## React

```bash
pnpm add @gasboost/react
```

`@gasboost/react` は `@gasboost/client` と React を統合します。

現在、以下を提供しています。

- `AppsScriptRouter`
- `useAppsScriptJob`

`AppsScriptRouter` は GAS コンテナと iframe の History を同期し、同期準備が完了してから子コンポーネントを描画します。

`useAppsScriptJob` は Job Store を React の External Store として購読します。

## 責務

gasboost/app は Google Apps Script 自体を置き換えるものではありません。

`SpreadsheetApp`、`DriveApp`、`HtmlService`、`ContentService` などの GAS API は通常通り直接利用できます。

このリポジトリは、Google Apps Script と TypeScript アプリケーションの間に存在する開発上の境界を扱います。

## License

MIT

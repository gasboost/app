# @gasboost/client

Google Apps Script Web アプリケーション向けの、フレームワーク非依存クライアントライブラリです。

`@gasboost/app` で定義した RPC 契約を利用して、フロントエンドから型安全に Google Apps Script のサーバー関数を呼び出せます。

また、RPC や任意の非同期処理を Job として管理する仕組みと、Google Apps Script Web アプリケーションの History 同期機能を提供します。

## インストール

```bash
pnpm add @gasboost/client
```

npm:

```bash
npm install @gasboost/client
```

## 型安全な RPC

バックエンドで `@gasboost/app` を使って RPC を定義します。

```ts
// backend/main.ts

import { AppsScript, type InferAppsScript } from "@gasboost/app";

const app = new AppsScript()
  .call("sum", (a: number, b: number) => a + b)
  .call("getUser", async (id: string) => ({
    id,
    name: "Taro",
  }));

export default app;

export type AppType = InferAppsScript<typeof app>;
```

フロントエンドでは `AppType` を型として共有します。

```ts
import { appsScriptClient } from "@gasboost/client";
import type { AppType } from "../backend/main";

const { client } = appsScriptClient<AppType>();
```

これにより、登録された RPC が型安全な関数として利用できます。

```ts
const total = await client.sum(1, 2);

const user = await client.getUser("user-1");
```

引数型と戻り値型は `AppType` から推論されます。

存在しない RPC や不正な引数は TypeScript 上で検出できます。

## RPC Transport

RPC は Google Apps Script が提供する `google.script.run` を利用して実行されます。

例えば、

```ts
await client.sum(1, 2);
```

は内部的には対応する GAS のサーバー関数を、

```text
google.script.run.sum(1, 2)
```

のように呼び出します。

成功時には `AppsScriptResponse.contents` を JSON として parse し、その結果を返します。

GAS 側の失敗は Promise の reject としてそのまま伝播します。

## JSON Response

RPC のレスポンスは JSON として扱われます。

```ts
const user = await client.getUser("user-1");
```

例えばバックエンドが、

```ts
{
  id: "user-1",
  name: "Taro",
}
```

を返した場合、フロントエンドでも同じ構造の object として取得できます。

不正な JSON が返された場合は `JSON.parse` のエラーになります。

### Date

`Date` は JavaScript の `Date` instance には復元されません。

例えばバックエンドが、

```ts
{
  createdAt: new Date("2026-09-04T00:00:00.000Z"),
}
```

を返した場合、クライアントでは、

```ts
{
  createdAt: "2026-09-04T00:00:00.000Z",
}
```

のように string として取得されます。

`@gasboost/app` の `InferAppsScript` も、この JSON シリアライズ後の型に合わせて `Date` を `string` として推論します。

## appsScriptClient

```ts
const { client, jobs } = appsScriptClient<AppType>();
```

`appsScriptClient()` は次の2つを返します。

```ts
{
  client,
  jobs,
}
```

### `client`

`AppType` から生成される型安全な RPC client です。

### `jobs`

RPC と非同期処理の Job を管理します。

現在以下の API を提供します。

```ts
jobs.start(label, execute);
jobs.cancel(jobId);
jobs.retry(jobId);
jobs.subscribe(listener);
jobs.getSnapshot();
```

## Job

`client` 経由で実行した RPC は自動的に Job として管理されます。

```ts
const { client, jobs } = appsScriptClient<AppType>();

const promise = client.getUser("user-1");

const snapshot = jobs.getSnapshot();
```

RPC 名が Job の `label` になります。

```ts
job.label === "getUser";
```

Job には一意な `id` が割り当てられます。

## Job Status

Job は次の状態を持ちます。

```text
pending
running
success
failed
```

状態は `status` から取得できます。

```ts
job.status;
```

個別の判定メソッドも利用できます。

```ts
job.isPending();
job.isRunning();
job.isSuccess();
job.isFailed();
```

Job は次の情報も保持します。

```ts
job.id;
job.label;
job.createdAt;
job.endedAt;
job.result;
job.error;
```

## Job の実行

RPC 以外の任意の非同期処理も、同じ Job Queue で管理できます。

```ts
const { jobs } = appsScriptClient<AppType>();

const result = await jobs.start("load-data", async () => {
  return await loadData();
});
```

`client` から実行された RPC と `jobs.start()` は同じ Queue / Runner を共有します。

## 並列実行

Job Runner は複数 Job の並列実行に対応しています。

現在の最大同時実行数は `30` です。

上限を超えた Job は `pending` として Queue に残り、実行中の Job が完了すると順次実行されます。

## 成功した Job

成功した Job は完了後に Job 一覧から削除されます。

```ts
jobs.getSnapshot();
```

には、実行中・待機中・失敗した Job が主に残ります。

## 失敗した Job

失敗した Job は一覧に `failed` 状態で残ります。

```ts
const failedJob = jobs.getSnapshot().find((job) => job.status === "failed");
```

エラーは `job.error` から取得できます。

## Retry

失敗した Job は ID を指定して再実行できます。

```ts
jobs.retry(job.id);
```

元の Job は一覧から削除され、同じ `label` と `execute` を利用した新しい Job が Queue に追加されます。

そのため、retry 後の Job は新しい ID を持ちます。

## Cancel

`pending` 状態の Job はキャンセルできます。

```ts
jobs.cancel(job.id);
```

キャンセルされた Job は Queue と Job 一覧から削除され、対応する Promise は `AppsScriptJobCancelledError` で reject されます。

すでに `running` になった Job はキャンセルされません。

現在の cancel は、実行開始前の Job を Queue から取り除くための機能です。

## Job の購読

Job 一覧の変更を購読できます。

```ts
const unsubscribe = jobs.subscribe(() => {
  console.log(jobs.getSnapshot());
});
```

購読を解除する場合:

```ts
unsubscribe();
```

`getSnapshot()` は現在の Job 一覧を返します。

```ts
const jobsSnapshot = jobs.getSnapshot();
```

このインターフェースは React の `useSyncExternalStore` から直接利用できる形になっています。

React から利用する場合は `@gasboost/react` の `useAppsScriptJob` を利用できます。

## History

`AppsScriptHistoryPipeline` は Google Apps Script Web アプリケーションの navigation state を同期するための仕組みです。

```ts
import { AppsScriptHistoryPipeline } from "@gasboost/client";
```

Google Apps Script が提供する、

- `google.script.history`
- `google.script.url`

と iframe 側の History を同期します。

```text
GAS Container History
        ↕
AppsScriptHistoryPipeline
        ↕
iframe History
```

通常 React アプリケーションでは、直接利用する代わりに `@gasboost/react` の `AppsScriptRouter` を利用します。

## Export

現在 `@gasboost/client` から公開されている API:

```ts
appsScriptClient;
AppsScriptJob;
AppsScriptJobStore;
AppsScriptHistoryPipeline;
```

## ローカル RPC について

`@gasboost/vite` の `dev` plugin は、Vite Dev Server 上に Local RPC endpoint を提供します。

```text
POST /__gasboost/{rpcName}
```

ただし現在の `@gasboost/client` の RPC transport は `google.script.run` を利用します。

そのため、`@gasboost/vite` の Local RPC endpoint へ自動的に transport を切り替える機能は、現在の `@gasboost/client` には含まれていません。

## 責務

`@gasboost/client` が担当するもの:

- `AppType` に基づく型安全 RPC client
- `google.script.run` を利用した RPC transport
- JSON response の parse
- RPC / 非同期処理の Job Queue
- Job の状態管理
- pending Job の cancel
- Job の retry
- Job Store の購読
- GAS Container と iframe の History 同期

React 固有の処理は `@gasboost/react` が担当します。

## 関連パッケージ

- `@gasboost/app` — バックエンドと RPC 契約の定義
- `@gasboost/vite` — GAS build と Local RPC
- `@gasboost/react` — React integration

## License

MIT

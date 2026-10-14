# @gasboost/react

Google Apps Script Web アプリケーション向けの React integration です。

認証状態と RPC client の提供に加え、`@gasboost/client` の navigation と Job Store を React から利用するためのコンポーネントと Hook を提供します。

現在、以下の API を公開しています。

- `AppsScriptRouter`
- `useAppsScriptJob`
- `AuthProvider` / `useAuth`
- `AppsScriptProvider` / `useAppsScript` / `createAppsScriptContext`
- `AuthStorage` と memory / localStorage / sessionStorage adapter

## インストール

```bash
pnpm add @gasboost/react @gasboost/client react
```

npm:

```bash
npm install @gasboost/react @gasboost/client react
```

現在 React 19 を対象としています。

## AppsScriptRouter

`AppsScriptRouter` は、Google Apps Script Web アプリケーションの Container History と iframe 側の History を同期します。

```tsx
import { AppsScriptRouter } from "@gasboost/react";

export function App() {
  return (
    <AppsScriptRouter>
      <main>Application</main>
    </AppsScriptRouter>
  );
}
```

内部では `@gasboost/client` の `AppsScriptHistoryPipeline` を利用します。

```text
google.script.history / google.script.url
                ↕
     AppsScriptHistoryPipeline
                ↕
          iframe History
                ↕
              React
```

## 初期化

`AppsScriptRouter` は History Pipeline の生成と同期が完了するまで children を描画しません。

```tsx
<AppsScriptRouter>
  <App />
</AppsScriptRouter>
```

概念的には次の順序で初期化されます。

```text
AppsScriptRouter mount
        ↓
AppsScriptHistoryPipeline.create()
        ↓
pipeline.sync()
        ↓
History synchronization ready
        ↓
children render
```

これにより、GAS Container と iframe の navigation state を同期してからアプリケーションを描画します。

## Cleanup

`AppsScriptRouter` が unmount されると、History Pipeline が返した監視解除関数を実行します。

そのため、Router の破棄後に navigation の監視が残り続けることはありません。

## useAppsScriptJob

`useAppsScriptJob` は `AppsScriptJobStore` を React から購読する Hook です。

内部では React の `useSyncExternalStore` を利用します。

```tsx
import { useAppsScriptJob } from "@gasboost/react";
```

例えば `@gasboost/client` の Job Store を渡すと、Job 一覧の変更に合わせて React component を再描画できます。

```tsx
const snapshot = useAppsScriptJob(jobStore);
```

`useAppsScriptJob` は次の interface を持つ Store を受け取ります。

```ts
interface AppsScriptJobStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): AppsScriptJob[];
}
```

Store が変更通知を行うと、最新の snapshot が React に反映されます。

## Store の切り替え

`useAppsScriptJob` に渡す Store が変更された場合、以前の Store の購読を解除し、新しい Store を購読します。

component が unmount された場合も購読解除関数が呼び出されます。

## Job UI

`@gasboost/react` は Job の表示 UI 自体は提供しません。

`useAppsScriptJob` が返す snapshot を利用して、アプリケーション側で自由に UI を構築できます。

例えば:

```tsx
const jobs = useAppsScriptJob(jobStore);

return (
  <ul>
    {jobs.map((job) => (
      <li key={job.id}>
        {job.label}: {job.status}
      </li>
    ))}
  </ul>
);
```

Job の状態管理、cancel、retry などの実体は `@gasboost/client` が担当します。

## 責務

`@gasboost/react` が担当するもの:

- `AppsScriptHistoryPipeline` の React lifecycle への統合
- History 同期完了後の描画制御
- unmount 時の History 監視解除
- `AppsScriptJobStore` と React の同期
- Store の購読と解除
- 認証状態と session token の storage 連携
- 認証状態を利用する RPC client の提供

以下は担当しません。

- RPC transport
- Job Queue / Runner
- RPC 型推論
- Google Apps Script backend
- GAS build

これらはそれぞれ `@gasboost/client`、`@gasboost/app`、`@gasboost/vite` が担当します。

## 関連パッケージ

- `@gasboost/client` — RPC、Job、History
- `@gasboost/app` — backend runtime と RPC 契約
- `@gasboost/vite` — GAS build と Local RPC

## License

MIT

## Typed RPC client と metadata

`createAppsScriptContext(client)` に通常の typed client を渡すと、専用の `AppsScriptProvider` / `useAppsScript()` が得られます。認証対象 RPC 名の指定や input 型の変換はありません。`AuthProvider` がなくても利用できます。

```tsx
// apps-script.ts
import { appsScriptClient } from "@gasboost/client";
import { createAppsScriptContext } from "@gasboost/react";
import type { AppType } from "../backend/main";

const { client } = appsScriptClient<AppType>();
export const { AppsScriptProvider, useAppsScript } = createAppsScriptContext(client);
```

```tsx
import { AppsScriptProvider, useAppsScript } from "./apps-script";

export function Root() {
  return <AppsScriptProvider><App /></AppsScriptProvider>;
}

function App() {
  const appsScript = useAppsScript();
  const create = () => appsScript.createEmployee({ name: "Taro", email: "taro@example.com" });
  return <button onClick={create}>Create</button>;
}
```

React state を metadata provider として接続する場合は `metadataProviders` prop を渡します。合成・Transport への受け渡しは `@gasboost/client` の pipeline が担当します。

```tsx
import { useMemo } from "react";
import type { MetadataProvider } from "@gasboost/client";
import { AppsScriptProvider } from "./apps-script";

function Workspace({ workspaceId }: { workspaceId: string }) {
  const providers = useMemo<MetadataProvider[]>(() => [
    () => ({ "@my-app/workspace": { id: workspaceId } }),
  ], [workspaceId]);
  return <AppsScriptProvider metadataProviders={providers}><App /></AppsScriptProvider>;
}
```

Provider は元の client を変更せず、その Provider に限る scoped client を作ります。元の provider → React provider → per-call metadata の順に合成され、同じキーは後の値を優先します。provider の配列が同一なら client を再利用し、配列が変われば新しい scoped client を Hook から返します。以前取得した client は以前の provider を保持するため、state を閉じ込めた provider を更新した場合は最新の Hook の返り値を使ってください。provider が外部の可変 source を読む場合は、実行時の最新値を参照します。

直接 public API を利用する場合は `AppsScriptProvider` に client を渡し、Hook に client 型を指定します。

```tsx
<AppsScriptProvider client={client} metadataProviders={providers}>
  <App />
</AppsScriptProvider>

const appsScript = useAppsScript<typeof client>();
```

metadata を指定しない Provider は元の client をそのまま提供します。Hook は対応する Provider の内側で使用します。

## AuthProvider と storage

既存の `AuthProvider` / `useAuth()` は認証状態の lifecycle と storage を管理します。認証エンジンや固定の auth RPC contract、認証 metadata の schema はここで定義しません。auth metadata provider と標準 adapter の実装は `gasboost/auth` 側で扱います。

```tsx
import { AuthProvider, localStorageAuthStorage, useAuth } from "@gasboost/react";

<AuthProvider adapter={authAdapter} storage={localStorageAuthStorage}>
  <App />
</AuthProvider>

const { user, token, isAuthenticated, isLoading, error, signIn, signOut } = useAuth();
```

`AuthAdapter<User, Credentials>` は `signIn(credentials): Promise<{ user, token }>`、`restoreSession(token): Promise<User | null>`、任意の `signOut(token): Promise<void>` を持ちます。adapter は component の外で定義するか `useMemo` で安定させてください。adapter または storage が変わるとセッションを復元し直します。`useAuth<User, Credentials>()` で user / signIn の型も利用できます。`useAuth` は RPC client を返しません。

- `AuthStorage` は `get(): string | null`、`set(token): void`、`remove(): void` を公開し、独自 storage も注入できます。
- 未指定時は Provider ごとに独立した memory storage を使い、unmount で破棄します。`memoryAuthStorage` は明示的に共有する adapter、`createMemoryAuthStorage()` は独立した adapter を作ります。
- `localStorageAuthStorage` / `sessionStorageAuthStorage` は opt-in です。キーは `gasboost.sessionToken`（`AUTH_STORAGE_KEY`）です。
- 初期化時に保存済み token を検証して user を復元します。復元中は `isLoading: true`、`token: null` です。期限切れを表す `null` が返れば保存済み token を削除します。通信失敗時は保存済み token を保持して `error` を設定します。
- signIn 成功時に token を保存し、signOut はローカルセッションと storage を先にクリアします。遅れて完了した復元や signIn が signOut 後のセッションを戻すことを防ぎます。
- browser storage は SSR 時に読み取りが `null`、書き込み・削除が no-op です。ブラウザでの storage エラーは復元では `error`、signIn / signOut では rejected Promise として扱います。

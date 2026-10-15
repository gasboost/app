# @gasboost/react

Google Apps Script Web アプリケーション向けの React integration です。

認証状態と RPC client の提供に加え、`@gasboost/client` の navigation と Job Store を React から利用するためのコンポーネントと Hook を提供します。

現在、以下の API を公開しています。

- `AppsScriptRouter`
- `useAppsScriptJob`
- `createAuthContext(auth)` → `AuthProvider` / `useAuth`
- `AppsScriptProvider` / `useAppsScript` / `createAppsScriptContext`

## インストール

```bash
pnpm add @gasboost/react @gasboost/auth-client @gasboost/client react
```

npm:

```bash
npm install @gasboost/react @gasboost/auth-client @gasboost/client react
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
- AuthClient の状態購読と React Context / Hook への接続
- typed RPC client の React Context への提供

以下は担当しません。

- 認証 session lifecycle、token storage、auth metadata（`@gasboost/auth-client` が担当）
- RPC transport
- Job Queue / Runner
- RPC 型推論
- Google Apps Script backend
- GAS build

これらはそれぞれ `@gasboost/client`、`@gasboost/app`、`@gasboost/vite` が担当します。

## 関連パッケージ

- `@gasboost/auth-client` — framework 非依存の認証・storage・Apps Script auth adapter
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

## 認証: AuthClient の React integration

`createAuthContext(auth)` は `@gasboost/auth-client` の framework 非依存 AuthClient を受け取り、その instance 専用の `AuthProvider` / `useAuth()` を返します。module scope で一度生成してください。token の保存・削除、認証 RPC、session validation は AuthClient が担当します。

### 1. `lib/appsscript.ts`: 通常の RPC client

```ts
import { localStorageAuthStorage } from "@gasboost/auth-client";
import { authMetadataProvider } from "@gasboost/auth-client/appsscript";
import { appsScriptClient, AppsScriptTransport } from "@gasboost/client";
import { createAppsScriptContext } from "@gasboost/react";
import type { AppType } from "../../backend/main";

export const authStorage = localStorageAuthStorage();
export const { client, jobs } = appsScriptClient<AppType>({
  transport: new AppsScriptTransport(),
  metadataProviders: [authMetadataProvider(authStorage)],
});
export const { AppsScriptProvider, useAppsScript } = createAppsScriptContext(client);
```

transport は consumer が選択します。BridgeTransport や FetchTransport も同じ構成で利用できます。metadata provider は RPC 実行時に共有 storage の token を読みます。

### 2. `lib/auth.ts`: frontend auth と React 接続

```ts
import { appsScriptAuth } from "@gasboost/auth-client/appsscript";
import { createAuthContext } from "@gasboost/react";
import { authStorage, client } from "./appsscript";

export const auth = appsScriptAuth({ client, storage: authStorage });
export const { AuthProvider, useAuth } = createAuthContext(auth);
```

React を利用しない frontend でも `auth.signIn(...)` / `auth.signOut()` / `auth.restoreSession()` を直接利用できます。独自の `AuthRemote` を渡して生成した `authClient({ remote, storage })` も同じ `createAuthContext(auth)` に接続できます。

### 3. Provider と component

```tsx
import { AuthProvider, useAuth } from "./lib/auth";
import { AppsScriptProvider, useAppsScript } from "./lib/appsscript";

export function Root() {
  return (
    <AuthProvider>
      <AppsScriptProvider><App /></AppsScriptProvider>
    </AuthProvider>
  );
}

function App() {
  const { user, session, isAuthenticated, isLoading, error, signIn, signOut } = useAuth();
  const client = useAppsScript();

  if (isLoading) return <p>Loading...</p>;
  if (!isAuthenticated) {
    return (
      <>
        {error != null && <p>{String(error)}</p>}
        <button onClick={() => {
          void signIn({ email: "taro@example.com", password: "password" }).catch(() => {});
        }}>Sign in</button>
      </>
    );
  }
  return (
    <>
      <p>{user?.name ?? "Signed in"}</p>
      <button onClick={() => {
        void client.createEmployee({ name: "Taro", email: "taro@example.com" });
      }}>Create employee</button>
      <button onClick={() => { void signOut().catch(() => {}); }}>Sign out</button>
    </>
  );
}
```

`user` / `session` の詳細と action の引数・戻り値は AuthClient から推論されます。通常の business RPC は typed client から直接呼びます。component が token を渡す必要はありません。

- Provider は `useSyncExternalStore` で AuthClient の snapshot を購読し、unmount 時に購読を解除します。React の外で AuthClient を更新しても再描画されます。AuthClient 自体は unmount 後も利用できます。
- mount 時は AuthClient の `restoreSession()` を呼びます。同じ context の同時 mount / StrictMode では進行中の初期復元を共有します。復元アルゴリズムは AuthClient が所有します。
- `auth-client@0.2.0` の snapshot は session / user / token / isAuthenticated を持ちます。`isLoading` / `error` は React の表示用状態です。初期復元中、またはその Provider の Hook 経由の action が一つでも進行中なら `isLoading` は true です。action 開始時に error を消去し、失敗時に記録します。直接 `auth.signIn(...)` 等を呼ぶ場合の loading / error は呼び出し元で扱います。
- `signIn` / `signUp` / `signOut` / `restoreSession` に加え、AuthClient に追加された async action も同じ引数・戻り値で公開します。action の rejection は呼び出し元にも伝搬するため、イベントハンドラ等で catch してください。初期復元の rejection は Provider が受け取り `error` へ公開します。
- `useAuth()` は対応する Provider の内側で使います。別々の `createAuthContext` で生成した context は独立しています。
- 永続化と復元後の user の内容は AuthClient の仕様に従います。標準 Apps Script adapter の復元結果は `user: null` のため、必要な user 情報は application RPC で取得します。
- SSR では request ごとの AuthClient と `memoryAuthStorage()`、または custom storage を用意してください。browser storage factory は browser 環境で生成します。

### 0.3.x からの移行

`@gasboost/react@0.4.0` は認証 API を変更します。

- package 直下の `AuthProvider` / `useAuth` を、`createAuthContext(auth)` の返り値へ置き換えます。
- `AuthAdapter` を `@gasboost/auth-client` の `AuthRemote` / `authClient`、または `appsScriptAuth` に置き換えます。
- `AuthSession` / `AuthState` / `AuthStorage` は `@gasboost/auth-client` から import します。
- React の `createMemoryAuthStorage()` / storage singleton / `AUTH_STORAGE_KEY` は削除しました。`@gasboost/auth-client` の `memoryAuthStorage()` / `localStorageAuthStorage()` / `sessionStorageAuthStorage()` を使い、metadata provider と AuthClient に同じ instance を渡します。
- 旧 browser storage key は `gasboost.sessionToken`、新しい標準 key は `@gasboost/auth` です。既存 token を引き継ぐ場合は `localStorageAuthStorage({ key: "gasboost.sessionToken" })` のように key を指定してください。
- signOut の失敗時に session を維持するか、進行中の操作をどう扱うかは AuthClient が決定します。React は独自の session 制御を行いません。

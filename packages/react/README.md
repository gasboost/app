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

## 認証状態と RPC client

`AuthProvider` / `useAuth()` は user、session token、認証状態を管理します。RPC client は `AppsScriptProvider` / `useAppsScript()` が提供します。

バックエンドの認証 RPC はアプリごとに異なるため、`AuthAdapter` で既存の処理を接続します。adapter は component の外で定義するか `useMemo` で安定させてください。adapter または storage が変わるとセッションを復元し直します。

```tsx
// apps-script.ts: 型付き client を一度接続する
import { appsScriptClient } from "@gasboost/client";
import { createAppsScriptContext, type AuthAdapter } from "@gasboost/react";
import type { AppType } from "../backend/main";

const { client } = appsScriptClient<AppType>();
export const { AppsScriptProvider, useAppsScript } = createAppsScriptContext(
  client,
  ["createEmployee"],
);

type User = { id: string; name: string };
type Credentials = { email: string; password: string };

// この例では backend に signIn / getCurrentUser / signOut が定義されている前提。
export const authAdapter: AuthAdapter<User, Credentials> = {
  signIn: (credentials) => client.signIn(credentials), // { user, token } を返す
  restoreSession: (token) => client.getCurrentUser({ token }), // User または null
  signOut: async (token) => { await client.signOut({ token }); },
};
```

```tsx
import { AuthProvider, localStorageAuthStorage, useAuth } from "@gasboost/react";
import { AppsScriptProvider, useAppsScript, authAdapter } from "./apps-script";

export function Root() {
  return (
    <AuthProvider adapter={authAdapter} storage={localStorageAuthStorage}>
      <AppsScriptProvider><App /></AppsScriptProvider>
    </AuthProvider>
  );
}

function App() {
  const { user, isAuthenticated, isLoading, error, signIn, signOut } = useAuth();
  const appsScript = useAppsScript();

  // 認証後、token を明示せずに呼び出せる。
  const create = () => appsScript.createEmployee({ name: "Taro", email: "taro@example.com" });
  return <button disabled={!isAuthenticated || isLoading} onClick={create}>Create</button>;
}
```

`createAppsScriptContext` は client と認証対象の RPC 名を結び付け、型引数の不要な Hook と専用 Provider を返します。RPC の型は実行時には存在しないため、認証対象名を明示します。公開 RPC の入力は変更しません。

直接 public API の `AppsScriptProvider` / `useAppsScript` を利用する場合は、Context が契約を推論できないため Hook に元の client 型と、Provider に指定した認証対象名の union を渡します。

```tsx
<AppsScriptProvider client={client} authenticatedMethods={["createEmployee"]}>
  <App />
</AppsScriptProvider>

const appsScript = useAppsScript<typeof client, "createEmployee">();
```

`useAuth<User, Credentials>()` に型引数を渡すと user / signIn の型も利用できます。`useAuth()` は client を返しません。Hook は対応する Provider の内側で使用します。

### Storage と lifecycle

- `AuthStorage` は `get(): string | null`、`set(token): void`、`remove(): void` を公開します。独自 adapter も注入できます。
- storage 未指定時は Provider ごとに独立した memory storage を使います。unmount で破棄されます。
- `memoryAuthStorage` は明示的に共有する memory adapter です。独立したものは `createMemoryAuthStorage()` で生成できます。
- `localStorageAuthStorage` / `sessionStorageAuthStorage` は opt-in です。共通キー `gasboost.sessionToken`（`AUTH_STORAGE_KEY`）で token を保存します。異なるアプリやアカウントで保存先を分ける場合は独自 `AuthStorage` を注入します。
- 初期化時は保存済み token を `restoreSession` で検証し、user を復元します。復元中は `isLoading: true`、`token: null` です。期限切れを示す `null` が返ると保存済み token を削除します。通信失敗時は token を保持し、`error` に失敗を格納します。
- signIn 成功時に token を保存します。signOut はローカルセッションと storage を先にクリアし、任意の backend signOut を呼びます。進行中の復元や signIn が遅れて完了しても signOut 後のセッションは復活しません。
- 認証対象 RPC に token がなければ送信せず `AuthenticationRequiredError` で reject します。client は現在の認証状態を参照するため、以前取得した client にも signIn / signOut の変更が反映されます。
- browser storage は SSR 時に読み取りが `null`、書き込み・削除が no-op です。ブラウザで storage が利用不可の場合のエラーは隠さず、復元では `error`、signIn / signOut では rejected Promise として扱います。

# @gasboost/react

Google Apps Script Web アプリケーション向けの React integration です。

`@gasboost/client` が提供する navigation と Job Store を React から利用するためのコンポーネントと Hook を提供します。

現在、以下の API を公開しています。

- `AppsScriptRouter`
- `useAppsScriptJob`

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

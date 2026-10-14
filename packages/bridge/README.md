# @gasboost/bridge

`@gasboost/bridge` connects an externally hosted browser frontend to a Google Apps Script HTML Service runtime with `postMessage`.

The package intentionally exposes environment-specific entrypoints:

- `@gasboost/bridge/apps-script` runs on the Apps Script server and creates the HTML Service bridge page.
- `@gasboost/bridge/runtime` runs inside the HTML Service browser document.
- `@gasboost/bridge/transport` runs in the external parent browser and implements the `@gasboost/client` `Transport` contract.

## Apps Script server

```ts
import { AppsScriptBridge } from "@gasboost/bridge/apps-script";

const bridge = new AppsScriptBridge({
  allowedOrigins: ["https://app.example.com", "http://localhost:5173"],
});

export function doGet(event: GoogleAppsScript.Events.DoGet) {
  return bridge.html({
    token: event.parameter.gasboostBridgeToken ?? "",
  });
}
```

`AppsScriptBridge` creates a minimal HTML Service document, sets `XFrameOptionsMode.ALLOWALL`, and embeds the bridge runtime. Apps Script server globals are only used when `html()` is called.

The embedded bundle is generated from `AppsScriptBridgeRuntime` during build, typecheck, and test. Its entrypoint delegates RPC to `appsScriptClient` and the existing `AppsScriptTransport`; the embedded page does not maintain a separate RPC implementation.

## External parent frontend

```ts
import { appsScriptClient } from "@gasboost/client";
import { BridgeTransport } from "@gasboost/bridge/transport";
import type { App } from "./app";

const { client } = appsScriptClient<App>({
  transport: new BridgeTransport({
    deploymentId: "AKfycb...",
  }),
});

const result = await client.someRpc(input);
```

`BridgeTransport` creates the hidden `https://script.google.com/macros/s/<deploymentId>/exec` iframe, waits for the HTML Service runtime to send `gasboost:bridge-ready`, stores `MessageEvent.source`, and sends later RPC traffic directly to that saved `WindowProxy`.

The outer Apps Script iframe is only a bootstrap container. It is not used as the final RPC endpoint.

## HTML Service runtime

```ts
import { AppsScriptBridgeRuntime } from "@gasboost/bridge/runtime";

const runtime = new AppsScriptBridgeRuntime({
  allowedOrigins: ["http://localhost:5173"],
  token: window.__GASBOOST_BRIDGE__.token,
  call: async (method, input) => {
    return { method, input };
  },
});

runtime.start();
```

`start()` registers the `message` listener before sending READY through `window.top.postMessage`.

## Local and real GAS smoke path

For local development, host the parent frontend at `http://localhost:<port>`, deploy the Apps Script web app, allow that localhost origin in `AppsScriptBridge`, and construct `BridgeTransport` with the deployment ID. The expected path is:

```text
localhost parent -> GAS iframe -> HTML Service READY -> saved event.source -> google.script.run -> GAS server -> response
```

The bridge ignores unrelated Google internal messages, invalid origins, invalid tokens, and responses from any source other than the saved READY source.

## RPC metadata

`BridgeTransport.call(name, input?, metadata?)` は `RpcMetadata` を業務 input と別に中継します。`appsScriptClient({ transport, metadataProviders })` と per-call options の両方から利用できます。

```ts
const { client } = appsScriptClient<AppType>({
  transport: new BridgeTransport({ deploymentId }),
  metadataProviders: [() => ({ "@my-app/tracing": { traceId: "trace" } })],
});

await client.createEmployee({ name: "Taro", email: "taro@example.com" });
```

metadata は request envelope → iframe runtime → GAS RPC の第2引数 → `AppsScript.dispatch` → middleware へ渡されます。input に混ぜず、namespace / schema の意味も解釈しません。request の `token` は bridge の通信相関・検証用であり、RPC metadata 内の値とは独立しています。metadata 未指定の既存 request も受け付けます。FetchTransport による Vite Local RPC の受信側対応は別 Issue `gasboost/dev#60` の範囲です。

metadata-only RPC の input は Bridge 内では未指定のまま中継し、最終的な `AppsScriptTransport` が GAS へ送る際に `null` に変換します。GAS 側の `invocation.input` と handler は `null` を受け取り、metadata は独立して保持します。

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

export function doGet() {
  return bridge.html();
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
  token: new URLSearchParams(location.search).get("gasboostBridgeToken") ?? "",
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

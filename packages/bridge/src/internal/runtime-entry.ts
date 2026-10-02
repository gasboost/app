import { appsScriptClient } from "@gasboost/client";
import { AppsScriptBridgeRuntime } from "../runtime";

declare global {
  interface Window {
    __GASBOOST_BRIDGE__: { allowedOrigins: string[] };
  }
}

const { client } = appsScriptClient<
  Record<string, { input: unknown; result: unknown }>
>();

const runtime = new AppsScriptBridgeRuntime({
  allowedOrigins: window.__GASBOOST_BRIDGE__.allowedOrigins,
  token: new URLSearchParams(location.search).get("gasboostBridgeToken") ?? "",
  call: (method, input) => client[method](input),
});

runtime.start();

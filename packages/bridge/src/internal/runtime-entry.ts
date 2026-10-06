import { appsScriptClient } from "@gasboost/client";
import { AppsScriptBridgeRuntime } from "../runtime";

declare global {
  interface Window {
    __GASBOOST_BRIDGE__: { allowedOrigins: string[]; token: string };
  }
}

const { client } = appsScriptClient<
  Record<string, { input: unknown; result: unknown }>
>();

const runtime = new AppsScriptBridgeRuntime({
  allowedOrigins: window.__GASBOOST_BRIDGE__.allowedOrigins,
  token: window.__GASBOOST_BRIDGE__.token,
  call: (method, input) => client[method](input),
});

runtime.start();

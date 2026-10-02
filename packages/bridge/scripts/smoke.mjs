import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const files = await readdir(root);
const client = files.find((file) => /^gasboost-client-.*\.tgz$/.test(file));
const bridge = files.find((file) => /^gasboost-bridge-.*\.tgz$/.test(file));
if (!client || !bridge) {
  throw new Error("Pack client and bridge in the workspace root before running smoke.");
}

const consumer = await mkdtemp(join(tmpdir(), "gasboost-bridge-consumer-"));
try {
  await writeFile(join(consumer, "package.json"), JSON.stringify({
    name: "gasboost-bridge-consumer",
    dependencies: {
      "@gasboost/client": `file:${join(root, client)}`,
      "@gasboost/bridge": `file:${join(root, bridge)}`,
    },
    devDependencies: {
      typescript: "^7.0.2",
      "@types/google-apps-script": "^2.0.12",
      esbuild: "^0.25.0",
    },
    pnpm: { overrides: { "@gasboost/client": `file:${join(root, client)}` } },
  }));
  await writeFile(join(consumer, "index.ts"), `
import { AppsScriptBridge } from "@gasboost/bridge/apps-script";
import { AppsScriptBridgeRuntime } from "@gasboost/bridge/runtime";
import { BridgeTransport } from "@gasboost/bridge/transport";
import { appsScriptClient } from "@gasboost/client";

const bridge = new AppsScriptBridge({ allowedOrigins: ["https://parent.example"] });
if (false) {
  const transport = new BridgeTransport({ deploymentId: "deployment" });
  const { client } = appsScriptClient<{ sum: { input: number; result: number } }>({ transport });
  const result: Promise<number> = client.sum(1);
  const runtime = new AppsScriptBridgeRuntime({
    allowedOrigins: bridge.allowedOrigins, token: "token",
    call: (method, input) => transport.call(method, input),
  });
  void result;
  runtime.start();
}
if (typeof AppsScriptBridgeRuntime !== "function" || typeof BridgeTransport !== "function") {
  throw new Error("Bridge subpath exports are not loadable");
}
`);
  await writeFile(join(consumer, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "ES2022", module: "Node16", moduleResolution: "Node16",
      strict: true, types: ["google-apps-script"], skipLibCheck: true,
    },
    include: ["index.ts"],
  }));
  for (const args of [
    ["install"],
    ["exec", "tsc"],
    ["exec", "esbuild", "index.ts", "--bundle", "--platform=browser", "--outfile=browser.js"],
  ]) {
    execFileSync("pnpm", args, { cwd: consumer, stdio: "inherit" });
  }
  execFileSync("node", ["index.js"], { cwd: consumer, stdio: "inherit" });
  execFileSync("node", ["browser.js"], { cwd: consumer, stdio: "inherit" });
} finally {
  await rm(consumer, { recursive: true, force: true });
}

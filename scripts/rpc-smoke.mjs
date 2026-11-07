import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const consumer = await mkdtemp(join(tmpdir(), "gasboost-rpc-consumer-"));
try {
  const dependencies = {};
  for (const name of ["app", "client"]) {
    const { version } = JSON.parse(
      await readFile(join(root, `packages/${name}/package.json`), "utf8"),
    );
    execFileSync("pnpm", ["--filter", `@gasboost/${name}`, "build"], {
      cwd: root,
      stdio: "inherit",
    });
    execFileSync(
      "pnpm",
      ["--filter", `@gasboost/${name}`, "pack", "--pack-destination", consumer],
      { cwd: root, stdio: "inherit" },
    );
    dependencies[`@gasboost/${name}`] =
      `file:${join(consumer, `gasboost-${name}-${version}.tgz`)}`;
  }
  await writeFile(
    join(consumer, "package.json"),
    JSON.stringify({ private: true, dependencies }),
  );
  execFileSync(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
    ],
    { cwd: consumer, stdio: "inherit" },
  );
  const require = createRequire(join(consumer, "package.json"));
  const { AppsScript, AppsScriptError } = require("@gasboost/app");

  // GAS retains only the thrown message, and may prepend the Error name.
  // Capture callbacks per invocation so concurrent requests cannot share handlers.
  function runner(success, failure) {
    return new Proxy(
      {},
      {
        get(_target, name) {
          if (name === "withSuccessHandler")
            return (callback) => runner(callback, failure);
          if (name === "withFailureHandler")
            return (callback) => runner(success, callback);
          return (...args) => {
            globalThis[name](...args).then(success, (cause) =>
              failure(new Error(`Error: ${cause.message}`)),
            );
          };
        },
      },
    );
  }
  globalThis.google = { script: { run: runner() } };
  const {
    AppsScriptTransport,
    FetchTransport,
    appsScriptClient,
    AppsScriptRpcError,
  } = require("@gasboost/client");
  class DomainError extends Error {}
  const app = new AppsScript()
    .use(async (_context, next) => {
      try {
        return await next();
      } catch (cause) {
        if (cause instanceof DomainError)
          throw new AppsScriptError({
            code: "EMPLOYEE_ALREADY_EXISTS",
            message: "Employee already exists",
          });
        throw cause;
      }
    })
    .calls({
      rpcSmokeKnown: () => {
        throw new DomainError("internal secret");
      },
      rpcSmokeUnknown: () => {
        throw new Error("internal secret");
      },
      rpcSmokeNonError: () => {
        throw { secret: "internal secret" };
      },
      rpcSmokeSerialization: () => ({
        toJSON() {
          throw new Error("internal secret");
        },
      }),
      rpcSmokeSuccess: (input) => ({
        input,
        error: { code: "BUSINESS_DATA", message: "ordinary result" },
      }),
    });

  // Match the current @gasboost/vite endpoint, including its legacy name/message/stack fields.
  globalThis.fetch = async (url, options) => {
    const { input, metadata } = JSON.parse(options.body);
    try {
      return new Response(
        (await app.dispatch(url.split("/").at(-1), input, metadata)).contents,
      );
    } catch (error) {
      const body = JSON.stringify({
        error: { name: error.name, message: error.message, stack: error.stack },
      });
      assert(!body.includes("internal secret"));
      assert(!body.includes('"stack"'));
      return new Response(body, { status: 500 });
    }
  };
  for (const transport of [
    new AppsScriptTransport(),
    new FetchTransport({ endpoint: "/rpc" }),
  ]) {
    const { client } = appsScriptClient({ transport });
    for (const name of [
      "rpcSmokeKnown",
      "rpcSmokeUnknown",
      "rpcSmokeNonError",
      "rpcSmokeSerialization",
    ]) {
      await assert.rejects(client[name](), (error) => {
        assert(error instanceof AppsScriptRpcError);
        assert.equal(
          error.code,
          name === "rpcSmokeKnown"
            ? "EMPLOYEE_ALREADY_EXISTS"
            : "INTERNAL_ERROR",
        );
        assert.equal(
          error.message,
          name === "rpcSmokeKnown"
            ? "Employee already exists"
            : "An unexpected error occurred",
        );
        assert(!String(error.stack).includes("internal secret"));
        return true;
      });
    }
    assert.deepEqual(await client.rpcSmokeSuccess({ value: 42 }), {
      input: { value: 42 },
      error: { code: "BUSINESS_DATA", message: "ordinary result" },
    });
  }

  await writeFile(
    join(consumer, "index.ts"),
    `
import { AppsScript, AppsScriptError, type InferAppsScript } from "@gasboost/app";
import { appsScriptClient, AppsScriptRpcError } from "@gasboost/client";
const app = new AppsScript().call("sum", (input: { a: number; b: number }) => input.a + input.b).calls({ ping: () => true });
const { client } = appsScriptClient<InferAppsScript<typeof app>>();
const result: Promise<number> = client.sum({ a: 1, b: 2 });
const ping: Promise<boolean> = client.ping();
// @ts-expect-error Invalid business input must remain rejected.
client.sum({ a: "invalid", b: 2 });
const server = new AppsScriptError({ code: "ANY_APP_CODE", message: "Safe message" });
// @ts-expect-error The constructor takes a single object.
new AppsScriptError("SAMPLE_CODE", "Safe message");
// @ts-expect-error Public codes are readonly.
server.code = "changed";
function handle(error: unknown) {
  if (error instanceof AppsScriptRpcError) { const code: string = error.code; return code; }
}
void result; void ping; void handle;
`,
  );
  await writeFile(
    join(consumer, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "Node16",
        moduleResolution: "Node16",
        strict: true,
        skipLibCheck: true,
        noEmit: true,
      },
      include: ["index.ts"],
    }),
  );
  execFileSync(
    join(root, "node_modules/.bin/tsc"),
    ["-p", join(consumer, "tsconfig.json")],
    { cwd: consumer, stdio: "inherit" },
  );
  console.log(
    "Packed RPC smoke passed: GAS, existing Vite endpoint, public exports and inferred client types.",
  );
} finally {
  await rm(consumer, { recursive: true, force: true });
}

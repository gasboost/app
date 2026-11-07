import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const appVersion = JSON.parse(
  await readFile(join(root, "packages/app/package.json"), "utf8"),
).version;
const bootstrapVersion = JSON.parse(
  await readFile(join(root, "packages/bootstrap/package.json"), "utf8"),
).version;
const clientVersion = JSON.parse(
  await readFile(join(root, "packages/client/package.json"), "utf8"),
).version;
const app = `gasboost-app-${appVersion}.tgz`;
const bootstrap = `gasboost-bootstrap-${bootstrapVersion}.tgz`;

const consumer = await mkdtemp(join(tmpdir(), "gasboost-bootstrap-consumer-"));
try {
  execFileSync(
    "pnpm",
    ["--filter", "@gasboost/client", "pack", "--pack-destination", consumer],
    { cwd: root, stdio: "inherit" },
  );
  const client = `file:${join(consumer, `gasboost-client-${clientVersion}.tgz`)}`;
  await writeFile(
    join(consumer, "package.json"),
    JSON.stringify({
      name: "gasboost-bootstrap-consumer",
      dependencies: {
        "@gasboost/app": `file:${join(root, app)}`,
        "@gasboost/bootstrap": `file:${join(root, bootstrap)}`,
        "@gasboost/client": client,
        "@gasboost/auth": "0.9.0",
      },
      devDependencies: {
        typescript: "^7.0.2",
        esbuild: "^0.25.0",
        "@types/google-apps-script": "^2.0.12",
      },
      pnpm: {
        overrides: {
          "@gasboost/app": `file:${join(root, app)}`,
          "@gasboost/client": client,
        },
      },
    }),
  );
  await writeFile(
    join(consumer, "index.ts"),
    `
import { AppsScript, type InferAppsScript } from "@gasboost/app";
import { AppsScriptBootstrap, type BootstrapPublicState } from "@gasboost/bootstrap";
import { appsScriptClient } from "@gasboost/client";
import type { AppsScriptAuthRepository } from "@gasboost/auth";

const authRepository: AppsScriptAuthRepository = {
  user: { async find(_id) { return null; }, async create(user) { return user; } },
  account: { async findByIdentity(_provider, _email) { return null; } },
  passwordCredential: { async findByResetTokenHash(_hash) { return null; }, async save(_credential) {} },
};
const bootstrap = new AppsScriptBootstrap({
  authRepository,
  db: { migrate() {} },
  auth: {
    registration: {
      methods: { emailPassword: false, appsScript: true },
      async appsScript(input) { return { id: "generated", accounts: [] }; },
      async email(input) { return { id: "generated", accounts: [] }; },
    },
    account: {
      async add(userId, input) { return { userId, identity: { providerName: input.provider, accountId: input.email } }; },
    },
  },
  authorization: { role: { async assign(_id: string, _role: "管理者") {} } },
});
const app = new AppsScript().get(request => {
  const state: BootstrapPublicState = bootstrap.handle(request);
  void state;
  return {} as GoogleAppsScript.HTML.HtmlOutput;
}).calls(bootstrap.handlers());
type API = InferAppsScript<typeof app>;
const input: API["initializeApp"]["input"] = { token: "from-email" };
if (false) {
  const { client } = appsScriptClient<API>();
  const result: Promise<BootstrapPublicState> = client.initializeApp(input);
  void result;
}
if (typeof AppsScriptBootstrap !== "function") throw new Error("Bootstrap export is not loadable");
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
        types: ["google-apps-script"],
        skipLibCheck: true,
      },
      include: ["index.ts"],
    }),
  );
  for (const args of [["install"], ["exec", "tsc"]]) {
    execFileSync("pnpm", args, { cwd: consumer, stdio: "inherit" });
  }
  execFileSync("node", ["index.js"], { cwd: consumer, stdio: "inherit" });

  await writeFile(
    join(consumer, "browser.ts"),
    `
import { BOOTSTRAP_ERROR_CODES, BootstrapError, type BootstrapErrorCode } from "@gasboost/bootstrap/errors";
const code: BootstrapErrorCode = BOOTSTRAP_ERROR_CODES.INVALID_TOKEN;
const error = new BootstrapError({ code, message: "Invalid bootstrap token" });
if (!(error instanceof Error) || error.code !== code || error.message !== "Invalid bootstrap token") {
  throw new Error("Browser error exports are not usable");
}
// @ts-expect-error Only known bootstrap codes are accepted.
new BootstrapError({ code: "UNKNOWN_CODE", message: "invalid" });
`,
  );
  await writeFile(
    join(consumer, "tsconfig.browser.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "Node16",
        moduleResolution: "Node16",
        strict: true,
        types: [],
        lib: ["ES2022", "DOM"],
        noEmit: true,
      },
      include: ["browser.ts"],
    }),
  );
  execFileSync("pnpm", ["exec", "tsc", "-p", "tsconfig.browser.json"], {
    cwd: consumer,
    stdio: "inherit",
  });
  execFileSync(
    "pnpm",
    [
      "exec",
      "esbuild",
      "browser.ts",
      "--bundle",
      "--platform=browser",
      "--metafile=browser.meta.json",
      "--outfile=browser.bundle.js",
    ],
    { cwd: consumer, stdio: "inherit" },
  );
  const meta = JSON.parse(
    await readFile(join(consumer, "browser.meta.json"), "utf8"),
  );
  const inputs = Object.keys(meta.inputs);
  assert.equal(
    inputs.length,
    2,
    "Browser bundle must contain only the consumer and errors module",
  );
  assert(
    inputs.some((input) =>
      input.endsWith("@gasboost/bootstrap/dist/errors.js"),
    ),
  );
  assert(inputs.includes("browser.ts"));
  // No GAS globals or server setup exist in this fresh process.
  execFileSync("node", ["browser.bundle.js"], {
    cwd: consumer,
    stdio: "inherit",
  });
  const packed = JSON.parse(
    await readFile(
      join(consumer, "node_modules/@gasboost/bootstrap/package.json"),
      "utf8",
    ),
  );
  assert.equal(packed.version, bootstrapVersion);
  assert.equal(packed.dependencies["@gasboost/app"], "^5.5.0");
  console.log(
    "Bootstrap smoke passed: server consumer and browser-only error exports.",
  );
} finally {
  await rm(consumer, { recursive: true, force: true });
}

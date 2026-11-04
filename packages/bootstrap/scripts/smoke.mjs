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
const app = `gasboost-app-${appVersion}.tgz`;
const bootstrap = `gasboost-bootstrap-${bootstrapVersion}.tgz`;

const consumer = await mkdtemp(join(tmpdir(), "gasboost-bootstrap-consumer-"));
try {
  await writeFile(
    join(consumer, "package.json"),
    JSON.stringify({
      name: "gasboost-bootstrap-consumer",
      dependencies: {
        "@gasboost/app": `file:${join(root, app)}`,
        "@gasboost/bootstrap": `file:${join(root, bootstrap)}`,
        "@gasboost/client": "^0.5.0",
      },
      devDependencies: {
        typescript: "^7.0.2",
        "@types/google-apps-script": "^2.0.12",
      },
      pnpm: { overrides: { "@gasboost/app": `file:${join(root, app)}` } },
    }),
  );
  await writeFile(
    join(consumer, "index.ts"),
    `
import { AppsScript, type InferAppsScript } from "@gasboost/app";
import { AppsScriptBootstrap, type BootstrapPublicState } from "@gasboost/bootstrap";
import { appsScriptClient } from "@gasboost/client";

const bootstrap = new AppsScriptBootstrap({
  db: { migrate() {} },
  auth: { registration: {
    methods: { emailPassword: false, appsScript: true },
    async ensureEffectiveUser(input) { return { id: input.id }; },
  } },
  authorization: { role: { async assign(_id: string, _role: "管理者") {} } },
});
const app = new AppsScript().get(request => {
  const state: BootstrapPublicState = bootstrap.handle(request);
  void state;
  return {} as GoogleAppsScript.HTML.HtmlOutput;
}).calls(bootstrap.handlers());
type API = InferAppsScript<typeof app>;
const input: API["initializeApp"]["input"] = { token: "000001" };
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
} finally {
  await rm(consumer, { recursive: true, force: true });
}

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const consumer = await mkdtemp(join(tmpdir(), "gasboost-react-consumer-"));
const manifest = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

try {
  for (const name of ["client", "react"]) {
    execFileSync("pnpm", ["--filter", `@gasboost/${name}`, "build"], {
      cwd: root,
      stdio: "inherit",
    });
  }
  execFileSync(
    "pnpm",
    ["--filter", "@gasboost/react", "pack", "--pack-destination", consumer],
    { cwd: root, stdio: "inherit" },
  );
  const archive = join(consumer, `gasboost-react-${manifest.version}.tgz`);
  const packedManifest = JSON.parse(
    execFileSync("tar", ["-xOf", archive, "package/package.json"], {
      encoding: "utf8",
    }),
  );
  assert.equal(packedManifest.dependencies["@gasboost/client"], "0.7.0");
  const declaration = execFileSync(
    "tar",
    ["-xOf", archive, "package/dist/useAppsScriptJob.d.ts"],
    { encoding: "utf8" },
  );
  assert.match(declaration, /jobStore: AppsScriptJobStore/);
  assert.match(declaration, /from ["']@gasboost\/client["']/);

  await writeFile(
    join(consumer, "package.json"),
    JSON.stringify({
      private: true,
      dependencies: {
        "@gasboost/client": "0.7.0",
        "@gasboost/react": `file:${archive}`,
        react: "^19",
      },
      devDependencies: {
        "@types/react": manifest.devDependencies["@types/react"],
      },
    }),
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
  const reactRequire = createRequire(require.resolve("@gasboost/react"));
  const installedClient = JSON.parse(
    await readFile(
      join(consumer, "node_modules/@gasboost/client/package.json"),
      "utf8",
    ),
  );
  assert.equal(installedClient.version, "0.7.0");
  assert.equal(
    require.resolve("@gasboost/client"),
    reactRequire.resolve("@gasboost/client"),
  );
  assert.equal(typeof require("@gasboost/react").useAppsScriptJob, "function");

  await writeFile(
    join(consumer, "index.tsx"),
    `import { appsScriptClient, type AppsScriptJob } from "@gasboost/client";
import { useAppsScriptJob } from "@gasboost/react";
type AppType = { ping: { input: undefined; result: boolean } };
const { jobs } = appsScriptClient<AppType>();
export function ServerJobList() {
  const items: AppsScriptJob<unknown>[] = useAppsScriptJob(jobs);
  return <span>{items.length}</span>;
}
`,
  );
  await writeFile(
    join(consumer, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "Node16",
        moduleResolution: "Node16",
        jsx: "react-jsx",
        strict: true,
        noEmit: true,
      },
      include: ["index.tsx"],
    }),
  );
  execFileSync(join(root, "node_modules/.bin/tsc"), ["-p", consumer], {
    cwd: consumer,
    stdio: "inherit",
  });
  console.log(
    "Packed React smoke passed with published client 0.7.0: shared types, hook argument and Job results.",
  );
} finally {
  await rm(consumer, { recursive: true, force: true });
}

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { build } from "vite";
import { afterEach, describe, expect, test } from "vitest";

import { gasboost } from "../src/gasboost";
import { getBuildOutputs } from "./helper";

const directories: string[] = [];

const appsScriptPath = resolve(
  import.meta.dirname,
  "../../app/src/AppsScript.ts",
);

afterEach(() => {
  for (const directory of directories) {
    rmSync(directory, {
      recursive: true,
      force: true,
    });
  }

  directories.length = 0;
});

async function buildEnvFixture({
  mode,
  envFile,
  envContent,
}: {
  mode?: string;
  envFile: string;
  envContent: string;
}) {
  const directory = mkdtempSync(join(tmpdir(), "gasboost-env-"));

  directories.push(directory);

  const envDir = join(directory, "config");

  const entry = join(directory, "main.ts");

  mkdirSync(envDir);

  writeFileSync(join(envDir, envFile), envContent);

  writeFileSync(
    entry,
    `
      import { AppsScript } from ${JSON.stringify(appsScriptPath)};

      const app = new AppsScript()
        .call("envTest", () => {
          return import.meta.env.VITE_TEST_VALUE;
        });

      export default app;
    `,
  );

  const result = await build({
    root: directory,
    mode,
    logLevel: "silent",

    plugins: [
      gasboost({
        entry,
        envDir,
      }).build,
    ],

    build: {
      minify: false,
      write: false,
    },
  });

  return getBuildOutputs(result)
    .filter((item) => item.type === "chunk")
    .map((item) => item.code)
    .join("\n");
}

describe("environment variables", () => {
  test("envDirの.envを読み込める", async () => {
    const code = await buildEnvFixture({
      envFile: ".env",
      envContent: "VITE_TEST_VALUE=hello",
    });

    expect(code).toContain("hello");

    expect(code).not.toContain("process.env");
  });

  test("mode別envを読み込める", async () => {
    const code = await buildEnvFixture({
      mode: "production",
      envFile: ".env.production",
      envContent: "VITE_TEST_VALUE=production-value",
    });

    expect(code).toContain("production-value");
  });
});

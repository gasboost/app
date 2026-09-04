import { readFile, readdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { afterEach, expect, test } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const frontendDir = resolve(testDir, "consumer/frontend");
const entry = resolve(frontendDir, "main.ts");
const outDir = resolve(frontendDir, ".build");

afterEach(async () => {
  await rm(outDir, {
    recursive: true,
    force: true,
  });
});

test("frontend bundleにbackend runtimeを含めない", async () => {
  await build({
    logLevel: "silent",

    build: {
      outDir,
      emptyOutDir: true,
      minify: false,

      lib: {
        entry,
        formats: ["es"],
        fileName: "frontend",
      },
    },
  });

  const files = await readdir(outDir);

  const output = (
    await Promise.all(
      files
        .filter((file) => file.endsWith(".js"))
        .map((file) => readFile(resolve(outDir, file), "utf8")),
    )
  ).join("\n");

  expect(output).not.toContain("SpreadsheetApp");
  expect(output).not.toContain("Utilities");
  expect(output).not.toContain("__GASBOOST_BACKEND_ONLY__");
});

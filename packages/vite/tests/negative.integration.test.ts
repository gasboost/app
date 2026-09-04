import { afterEach, describe, expect, test } from "vitest";

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { build } from "vite";

import { gasboost } from "../src/gasboost";

const directories: string[] = [];

function createEntry(source: string): string {
  const directory = mkdtempSync(join(tmpdir(), "gasboost-vite-"));

  directories.push(directory);

  const entry = join(directory, "main.ts");

  writeFileSync(entry, source);

  return entry;
}

afterEach(() => {
  for (const directory of directories) {
    rmSync(directory, {
      recursive: true,
      force: true,
    });
  }

  directories.length = 0;
});

async function buildEntry(source: string) {
  const entry = createEntry(source);

  return build({
    logLevel: "silent",

    plugins: [
      gasboost({
        entry,
      }),
    ],

    build: {
      write: false,
    },
  });
}

describe("gasboost negative integration", () => {
  test("非literal call名ではbuild失敗", async () => {
    await expect(
      buildEntry(`
        const name = "getUser";

        const app = new AppsScript()
          .call(name, () => {});

        export default app;
      `),
    ).rejects.toThrow();
  });

  test("重複RPC名ではbuild失敗", async () => {
    await expect(
      buildEntry(`
        const app = new AppsScript()
          .call("getUser", () => {})
          .call("getUser", () => {});

        export default app;
      `),
    ).rejects.toThrow();
  });

  test("存在しないentryではbuild失敗", async () => {
    await expect(
      build({
        logLevel: "silent",

        plugins: [
          gasboost({
            entry: "/does/not/exist.ts",
          }),
        ],

        build: {
          write: false,
        },
      }),
    ).rejects.toThrow();
  });

  test("AppsScript定義が存在しなければbuild失敗", async () => {
    await expect(
      buildEntry(`
        export const foo = 1;
      `),
    ).rejects.toThrow();
  });

  test("複数AppsScript定義ではbuild失敗", async () => {
    await expect(
      buildEntry(`
        const first =
          new AppsScript();

        const second =
          new AppsScript();

        export default first;
      `),
    ).rejects.toThrow();
  });

  test("default exportがなければbuild失敗", async () => {
    await expect(
      buildEntry(`
        const app =
          new AppsScript();
      `),
    ).rejects.toThrow();
  });

  test("get複数登録ではbuild失敗", async () => {
    await expect(
      buildEntry(`
        const app =
          new AppsScript()
            .get(() => {})
            .get(() => {});

        export default app;
      `),
    ).rejects.toThrow();
  });

  test("post複数登録ではbuild失敗", async () => {
    await expect(
      buildEntry(`
        const app =
          new AppsScript()
            .post(() => {})
            .post(() => {});

        export default app;
      `),
    ).rejects.toThrow();
  });
});

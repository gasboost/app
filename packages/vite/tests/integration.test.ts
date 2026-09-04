import { resolve } from "node:path";
import { build } from "vite";
import { describe, expect, test } from "vitest";
import { gasboost } from "../src/gasboost";
import { getBuildOutputs } from "./helper";

async function buildFixture(minify: boolean) {
  const entry = resolve(process.cwd(), "tests/fixtures/basic/main.ts");

  const result = await build({
    logLevel: "silent",

    plugins: [
      gasboost({
        entry,
      }),
    ],

    build: {
      minify,
      write: false,
    },
  });

  const outputs = getBuildOutputs(result);

  return outputs
    .filter((output) => output.type === "chunk")
    .map((output) => output.code)
    .join("\n");
}

describe("gasboost integration", () => {
  test("doGetを最終bundleへ生成する", async () => {
    const output = await buildFixture(false);

    expect(output).toContain("doGet");
  });

  test("doPostを最終bundleへ生成する", async () => {
    const output = await buildFixture(false);

    expect(output).toContain("doPost");
  });

  test("RPC global functionを最終bundleへ生成する", async () => {
    const output = await buildFixture(false);

    expect(output).toContain("getUser");

    expect(output).toContain("sum");
  });

  test("ES module importを最終bundleへ残さない", async () => {
    const output = await buildFixture(false);

    expect(output).not.toMatch(/^\s*import\s/m);
  });

  test("ES module exportを最終bundleへ残さない", async () => {
    const output = await buildFixture(false);

    expect(output).not.toMatch(/^\s*export\s/m);
  });

  test("minify falseでもglobal functionが存在する", async () => {
    const output = await buildFixture(false);

    expect(output).toContain("doGet");

    expect(output).toContain("doPost");

    expect(output).toContain("getUser");
  });

  test("minify trueでもglobal functionが消えない", async () => {
    const output = await buildFixture(true);

    expect(output).toContain("doGet");

    expect(output).toContain("doPost");

    expect(output).toContain("getUser");
  });

  test("tree shaking後もglobal functionが残る", async () => {
    const output = await buildFixture(true);

    expect(output).toContain("getUser");

    expect(output).toContain("sum");
  });
});

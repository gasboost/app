import { expect, expectTypeOf, test } from "vitest";

import { gasboost, type GasboostOptions } from "../src";

test("@gasboost/viteからgasboostをexportする", () => {
  expect(gasboost).toBeTypeOf("function");
});

test("GasboostOptionsのentryは必須", () => {
  expectTypeOf<GasboostOptions["entry"]>().toEqualTypeOf<string>();
});

test("GasboostOptionsのenvDirはoptional", () => {
  const options: GasboostOptions = {
    entry: "src/main.ts",
  };

  expect(options.envDir).toBeUndefined();
});

test("envDirを指定できる", () => {
  const options: GasboostOptions = {
    entry: "src/main.ts",
    envDir: "config",
  };

  expect(options.envDir).toBe("config");
});

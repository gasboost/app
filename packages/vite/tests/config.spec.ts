import { describe, expect, test } from "vitest";

import { resolve } from "node:path";

import { createGasboostConfig } from "../src/config";

describe("createGasboostConfig", () => {
  test("entryをbuild inputに設定する", () => {
    const config = createGasboostConfig({
      entry: "src/main.ts",
    });

    expect(config.build?.rollupOptions?.input).toBe(resolve("src/main.ts"));
  });

  test("envDirを設定できる", () => {
    const config = createGasboostConfig({
      entry: "src/main.ts",
      envDir: "config",
    });

    expect(config.envDir).toBe("config");
  });

  test("envDir未指定ならVite標準設定を阻害しない", () => {
    const config = createGasboostConfig({
      entry: "src/main.ts",
    });

    expect(config.envDir).toBeUndefined();
  });

  test("GAS互換build targetを設定する", () => {
    const config = createGasboostConfig({
      entry: "src/main.ts",
    });

    expect(config.build?.target).toBeDefined();
  });

  test("outDirを設定する", () => {
    const config = createGasboostConfig({
      entry: "src/main.ts",
    });

    expect(config.build?.outDir).toBeDefined();
  });

  test("output file nameを設定する", () => {
    const config = createGasboostConfig({
      entry: "src/main.ts",
    });

    const output = config.build?.rollupOptions?.output;

    expect(output).toBeDefined();
  });

  test("entryは絶対パスへ解決される", () => {
    const config = createGasboostConfig({
      entry: "./src/main.ts",
    });

    expect(config.build?.rollupOptions?.input).toBe(resolve("./src/main.ts"));
  });
});

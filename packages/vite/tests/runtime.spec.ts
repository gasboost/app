import { afterEach, describe, expect, test } from "vitest";
import { installGasRuntime } from "../src/runtime";

describe("installGasRuntime", () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).CustomRuntime;
    installGasRuntime();
  });

  test("default GAS runtimeをglobalThisへ登録する", () => {
    installGasRuntime();

    expect(globalThis.Utilities).toBeDefined();
    expect(globalThis.Session).toBeDefined();
    expect(globalThis.CacheService).toBeDefined();
    expect(globalThis.PropertiesService).toBeDefined();
  });

  test("ユーザーruntimeでdefault runtimeをoverrideできる", () => {
    const utilities = {
      getUuid: () => "custom-uuid",
    };

    installGasRuntime({
      Utilities: utilities,
    });

    expect(globalThis.Utilities).toBe(utilities);
  });

  test("任意のruntimeを追加できる", () => {
    const customRuntime = {};

    installGasRuntime({
      CustomRuntime: customRuntime,
    });

    expect((globalThis as Record<string, unknown>).CustomRuntime).toBe(
      customRuntime,
    );
  });
});

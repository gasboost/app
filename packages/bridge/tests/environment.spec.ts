import { describe, expect, it } from "vitest";

describe("environment entrypoints", () => {
  it("transport entrypointはHtmlServiceやgoogle.script.runなしでimportできる", async () => {
    await expect(import("../src/transport")).resolves.toBeDefined();
  });

  it("runtime entrypointはHtmlServiceなしでimportできる", async () => {
    await expect(import("../src/runtime")).resolves.toBeDefined();
  });
});

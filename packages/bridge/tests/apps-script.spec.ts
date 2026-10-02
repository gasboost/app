import { describe, expect, it, vi } from "vitest";

describe("AppsScriptBridge", () => {
  it("module import時にはHtmlServiceへアクセスしない", async () => {
    vi.unstubAllGlobals();

    await expect(import("../src/apps-script")).resolves.toBeDefined();
  });

  it("html()でALLOWALLのHtmlOutputを生成する", async () => {
    const output = {
      setXFrameOptionsMode: vi.fn(),
    };
    output.setXFrameOptionsMode.mockReturnValue(output);
    const createHtmlOutput = vi.fn(() => output);

    vi.stubGlobal("HtmlService", {
      createHtmlOutput,
      XFrameOptionsMode: {
        ALLOWALL: "ALLOWALL",
      },
    });

    const { AppsScriptBridge } = await import("../src/apps-script");
    const bridge = new AppsScriptBridge({
      allowedOrigins: ["http://localhost:5173"],
    });

    bridge.html();

    expect(createHtmlOutput).toHaveBeenCalledWith(
      expect.stringContaining("http://localhost:5173"),
    );
    expect(createHtmlOutput).toHaveBeenCalledWith(
      expect.stringContaining("window.top.postMessage"),
    );
    expect(output.setXFrameOptionsMode).toHaveBeenCalledWith("ALLOWALL");
  });
});

import { describe, expect, it, vi } from "vitest";
import { BridgeProtocol } from "../src/core/protocol";

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
      expect.stringContaining(".postMessage"),
    );
    expect(output.setXFrameOptionsMode).toHaveBeenCalledWith("ALLOWALL");
  });

  it("生成HTMLのbundleがREADY、検証、client経由のRPC、errorを処理する", async () => {
    let html = "";
    const output = { setXFrameOptionsMode: vi.fn() };
    output.setXFrameOptionsMode.mockReturnValue(output);
    vi.stubGlobal("HtmlService", {
      createHtmlOutput: (contents: string) => {
        html = contents;
        return output;
      },
      XFrameOptionsMode: { ALLOWALL: "ALLOWALL" },
    });
    const { AppsScriptBridge } = await import("../src/apps-script");
    new AppsScriptBridge({ allowedOrigins: ["https://parent.example"] }).html();

    const calls: string[] = [];
    const postMessage = vi.fn(() => calls.push("ready"));
    const listeners: Array<(event: MessageEvent) => void> = [];
    const fakeWindow = {
      top: { postMessage },
      addEventListener: (_type: string, listener: (event: MessageEvent) => void) => {
        listeners.push(listener);
        calls.push("listener");
      },
    };
    const requests: Array<{
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      input: unknown[];
    }> = [];
    const run = {
      withSuccessHandler: (resolve: (value: unknown) => void) => ({
        withFailureHandler: (reject: (error: Error) => void) => ({
          sum: (...input: unknown[]) => requests.push({ resolve, reject, input }),
        }),
      }),
    };
    const page = new DOMParser().parseFromString(html, "text/html");
    for (const script of page.querySelectorAll("script")) {
      new Function("window", "location", "globalThis", script.textContent ?? "")(
        fakeWindow,
        { search: "?gasboostBridgeToken=token" },
        { google: { script: { run } } },
      );
    }

    expect(calls).toEqual(["listener", "ready"]);
    expect(postMessage).toHaveBeenCalledWith(
      BridgeProtocol.ready("token"), "https://parent.example",
    );

    for (const [origin, token] of [
      ["https://evil.example", "token"],
      ["https://parent.example", "wrong-token"],
    ]) {
      listeners[0](new MessageEvent("message", {
        origin,
        data: BridgeProtocol.request("ignored", token, "sum", { a: 1 }),
      }));
    }
    expect(requests).toHaveLength(0);

    listeners[0](new MessageEvent("message", {
      origin: "https://parent.example",
      data: BridgeProtocol.request("1", "token", "sum", { a: 1, b: 2 }),
    }));
    listeners[0](new MessageEvent("message", {
      origin: "https://parent.example",
      data: BridgeProtocol.request("2", "token", "sum"),
    }));
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[0].input).toEqual([{ a: 1, b: 2 }]);
    expect(requests[1].input).toEqual([]);

    requests[1].reject(new Error("server failure"));
    requests[0].resolve({ contents: "3" });
    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith(
        BridgeProtocol.success("1", "token", 3), "https://parent.example",
      );
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "2", token: "token", ok: false,
          error: expect.objectContaining({ message: "server failure" }),
        }), "https://parent.example",
      );
    });
  });
});

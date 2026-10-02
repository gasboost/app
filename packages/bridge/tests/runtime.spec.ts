import { describe, expect, it, vi } from "vitest";
import { BridgeProtocol } from "../src/core/protocol";
import { AppsScriptBridgeRuntime } from "../src/runtime";

describe("AppsScriptBridgeRuntime", () => {
  it("listener登録後にwindow.topへREADYを送る", () => {
    const calls: string[] = [];
    const top = {
      postMessage: vi.fn(() => {
        calls.push("ready");
      }),
    };
    const fakeWindow = {
      top,
      addEventListener: vi.fn(() => {
        calls.push("listener");
      }),
      removeEventListener: vi.fn(),
    } as unknown as Window;

    const runtime = new AppsScriptBridgeRuntime({
      allowedOrigins: ["http://localhost:5173"],
      token: "token",
      call: vi.fn(),
      window: fakeWindow,
    });

    runtime.start();

    expect(calls).toEqual(["listener", "ready"]);
    expect(top.postMessage).toHaveBeenCalledWith(
      BridgeProtocol.ready("token"),
      "http://localhost:5173",
    );
  });

  it("許可originのrequestを委譲してsuccess responseをwindow.topへ返す", async () => {
    const top = {
      postMessage: vi.fn(),
    };
    const fakeWindow = {
      top,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Window;
    const call = vi.fn().mockResolvedValue({ ok: true });
    const runtime = new AppsScriptBridgeRuntime({
      allowedOrigins: ["http://localhost:5173"],
      token: "token",
      call,
      window: fakeWindow,
    });

    await runtime.handleMessage(
      new MessageEvent("message", {
        origin: "http://localhost:5173",
        data: BridgeProtocol.request("1", "token", "getUser", { id: "1" }),
      }),
    );

    expect(call).toHaveBeenCalledWith("getUser", { id: "1" });
    expect(top.postMessage).toHaveBeenCalledWith(
      BridgeProtocol.success("1", "token", { ok: true }),
      "http://localhost:5173",
    );
  });

  it("invalid originと無関係なmessageを無視する", async () => {
    const top = {
      postMessage: vi.fn(),
    };
    const fakeWindow = {
      top,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Window;
    const call = vi.fn();
    const runtime = new AppsScriptBridgeRuntime({
      allowedOrigins: ["http://localhost:5173"],
      token: "token",
      call,
      window: fakeWindow,
    });

    await runtime.handleMessage(
      new MessageEvent("message", {
        origin: "https://evil.example",
        data: BridgeProtocol.request("1", "token", "getUser"),
      }),
    );
    await runtime.handleMessage(
      new MessageEvent("message", {
        origin: "http://localhost:5173",
        data: { type: "google:internal" },
      }),
    );

    expect(call).not.toHaveBeenCalled();
    expect(top.postMessage).not.toHaveBeenCalled();
  });

  it("handler failureをerror responseへserializeする", async () => {
    const top = {
      postMessage: vi.fn(),
    };
    const fakeWindow = {
      top,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Window;
    const runtime = new AppsScriptBridgeRuntime({
      allowedOrigins: ["http://localhost:5173"],
      token: "token",
      call: vi.fn().mockRejectedValue(new Error("boom")),
      window: fakeWindow,
    });

    await runtime.handleMessage(
      new MessageEvent("message", {
        origin: "http://localhost:5173",
        data: BridgeProtocol.request("1", "token", "fail"),
      }),
    );

    expect(top.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "gasboost:response",
        id: "1",
        token: "token",
        ok: false,
        error: expect.objectContaining({
          name: "Error",
          message: "boom",
        }),
      }),
      "http://localhost:5173",
    );
  });
});

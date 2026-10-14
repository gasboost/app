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
        data: BridgeProtocol.request(
          "1",
          "token",
          "getUser",
          { id: "1" },
          { trace: "runtime" },
        ),
      }),
    );

    expect(call).toHaveBeenCalledWith(
      "getUser",
      { id: "1" },
      { trace: "runtime" },
    );
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

it("keeps bridge tokens separate and rejects malformed metadata envelopes", () => {
  const metadata = {
    "@example/opaque": { token: "different-value", arbitrary: [1, 2] },
  };
  const request = BridgeProtocol.request(
    "id",
    "bridge-token",
    "business",
    {},
    metadata,
  );
  expect(request.token).toBe("bridge-token");
  expect(request.metadata).toBe(metadata);
  expect(BridgeProtocol.isRequest(request, "bridge-token")).toBe(true);
  expect(BridgeProtocol.isRequest(request, "different-value")).toBe(false);
  for (const invalid of [null, [], "text", 1]) {
    expect(BridgeProtocol.isRequest({ ...request, metadata: invalid })).toBe(
      false,
    );
  }
  expect(
    BridgeProtocol.isRequest(
      BridgeProtocol.request("id", "bridge-token", "business"),
    ),
  ).toBe(true);
});

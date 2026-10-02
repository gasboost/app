import { beforeEach, describe, expect, it, vi } from "vitest";
import { BridgeProtocol } from "../src/core/protocol";
import { BridgeTransport } from "../src/transport";

describe("BridgeTransport", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("listenerを登録してからiframeを起動する", async () => {
    const calls: string[] = [];
    const addEventListener = vi
      .spyOn(window, "addEventListener")
      .mockImplementation(() => {
        calls.push("listener");
      });
    const appendChild = vi
      .spyOn(document.body, "appendChild")
      .mockImplementation((node) => {
        calls.push("iframe");
        return node;
      });
    const transport = new BridgeTransport({
      deploymentId: "deployment",
      readyTimeoutMs: 1000,
    });

    const ready = transport.start().catch(() => undefined);

    expect(calls).toEqual(["listener", "iframe"]);

    transport.dispose();
    await ready;
    addEventListener.mockRestore();
    appendChild.mockRestore();
  });

  it("deploymentIdからApps Script Web App URLを構築してtokenを付ける", () => {
    const transport = new BridgeTransport({
      deploymentId: "abc/def",
    });
    const url = new URL(transport.webAppUrl());

    expect(url.origin).toBe("https://script.google.com");
    expect(url.pathname).toBe("/macros/s/abc%2Fdef/exec");
    expect(url.searchParams.get("gasboostBridgeToken")).toBe(transport.token);
  });

  it("READYのevent.sourceを保存しRPCはiframe.contentWindowではなく保存sourceへ送る", async () => {
    const bridgeWindow = {
      postMessage: vi.fn(),
    };
    const outerWindow = {
      postMessage: vi.fn(),
    };
    const transport = new BridgeTransport({
      deploymentId: "deployment",
      requestTimeoutMs: 1000,
    });

    const ready = transport.start();
    Object.defineProperty(transport.iframe, "contentWindow", {
      configurable: true,
      value: outerWindow,
    });

    const readyEvent = new MessageEvent("message", {
      data: BridgeProtocol.ready(transport.token),
    });
    Object.defineProperty(readyEvent, "source", {
      value: bridgeWindow,
    });

    transport.handleMessage(readyEvent);

    await ready;

    const promise = transport.call("sum", { a: 1 });
    await Promise.resolve();

    expect(bridgeWindow.postMessage).toHaveBeenCalledWith(
      BridgeProtocol.request("1", transport.token, "sum", { a: 1 }),
      "*",
    );
    expect(outerWindow.postMessage).not.toHaveBeenCalled();

    const responseEvent = new MessageEvent("message", {
      data: BridgeProtocol.success("1", transport.token, 3),
    });
    Object.defineProperty(responseEvent, "source", {
      value: bridgeWindow,
    });

    transport.handleMessage(responseEvent);

    await expect(promise).resolves.toEqual({
      contents: "3",
    });

    transport.dispose();
  });

  it("同時requestの順不同responseをそれぞれresolveする", async () => {
    const bridgeWindow = {
      postMessage: vi.fn(),
    };
    const transport = new BridgeTransport({
      deploymentId: "deployment",
      requestTimeoutMs: 1000,
    });

    const ready = transport.start();
    const readyEvent = new MessageEvent("message", {
      data: BridgeProtocol.ready(transport.token),
    });
    Object.defineProperty(readyEvent, "source", {
      value: bridgeWindow,
    });

    transport.handleMessage(readyEvent);
    await ready;

    const first = transport.call("get", { id: "1" });
    const second = transport.call("get", { id: "2" });
    const third = transport.call("get", { id: "3" });
    await Promise.resolve();

    const secondEvent = new MessageEvent("message", {
      data: BridgeProtocol.success("2", transport.token, "two"),
    });
    Object.defineProperty(secondEvent, "source", {
      value: bridgeWindow,
    });
    transport.handleMessage(secondEvent);

    const thirdEvent = new MessageEvent("message", {
      data: BridgeProtocol.success("3", transport.token, "three"),
    });
    Object.defineProperty(thirdEvent, "source", {
      value: bridgeWindow,
    });
    transport.handleMessage(thirdEvent);

    const firstEvent = new MessageEvent("message", {
      data: BridgeProtocol.success("1", transport.token, "one"),
    });
    Object.defineProperty(firstEvent, "source", {
      value: bridgeWindow,
    });
    transport.handleMessage(firstEvent);

    await expect(first).resolves.toEqual({ contents: '"one"' });
    await expect(second).resolves.toEqual({ contents: '"two"' });
    await expect(third).resolves.toEqual({ contents: '"three"' });

    transport.dispose();
  });

  it("RpcResponse resultはTransport responseとしてそのまま返す", async () => {
    const bridgeWindow = {
      postMessage: vi.fn(),
    };
    const transport = new BridgeTransport({
      deploymentId: "deployment",
      requestTimeoutMs: 1000,
    });

    const ready = transport.start();
    const readyEvent = new MessageEvent("message", {
      data: BridgeProtocol.ready(transport.token),
    });
    Object.defineProperty(readyEvent, "source", {
      value: bridgeWindow,
    });

    transport.handleMessage(readyEvent);
    await ready;

    const promise = transport.call("getUser");
    await Promise.resolve();

    const responseEvent = new MessageEvent("message", {
      data: BridgeProtocol.success("1", transport.token, {
        contents: '{"id":"user-1"}',
      }),
    });
    Object.defineProperty(responseEvent, "source", {
      value: bridgeWindow,
    });

    transport.handleMessage(responseEvent);

    await expect(promise).resolves.toEqual({
      contents: '{"id":"user-1"}',
    });

    transport.dispose();
  });

  it("invalid token/source/unrelated messageを無視する", async () => {
    const bridgeWindow = {
      postMessage: vi.fn(),
    };
    const otherWindow = {
      postMessage: vi.fn(),
    };
    const transport = new BridgeTransport({
      deploymentId: "deployment",
      requestTimeoutMs: 1000,
    });

    const ready = transport.start();
    const readyEvent = new MessageEvent("message", {
      data: BridgeProtocol.ready(transport.token),
    });
    Object.defineProperty(readyEvent, "source", {
      value: bridgeWindow,
    });

    transport.handleMessage(readyEvent);
    await ready;

    const promise = transport.call("sum");
    await Promise.resolve();

    const wrongTokenEvent = new MessageEvent("message", {
      data: BridgeProtocol.success("1", "other-token", "wrong"),
    });
    Object.defineProperty(wrongTokenEvent, "source", {
      value: bridgeWindow,
    });
    transport.handleMessage(wrongTokenEvent);

    const wrongSourceEvent = new MessageEvent("message", {
      data: BridgeProtocol.success("1", transport.token, "wrong"),
    });
    Object.defineProperty(wrongSourceEvent, "source", {
      value: otherWindow,
    });
    transport.handleMessage(wrongSourceEvent);

    const unrelatedEvent = new MessageEvent("message", {
      data: { type: "google:internal" },
    });
    Object.defineProperty(unrelatedEvent, "source", {
      value: bridgeWindow,
    });
    transport.handleMessage(unrelatedEvent);

    const okEvent = new MessageEvent("message", {
      data: BridgeProtocol.success("1", transport.token, "ok"),
    });
    Object.defineProperty(okEvent, "source", {
      value: bridgeWindow,
    });
    transport.handleMessage(okEvent);

    await expect(promise).resolves.toEqual({ contents: '"ok"' });

    transport.dispose();
  });

  it("runtime error responseをrejectする", async () => {
    const bridgeWindow = {
      postMessage: vi.fn(),
    };
    const transport = new BridgeTransport({
      deploymentId: "deployment",
      requestTimeoutMs: 1000,
    });

    const ready = transport.start();
    const readyEvent = new MessageEvent("message", {
      data: BridgeProtocol.ready(transport.token),
    });
    Object.defineProperty(readyEvent, "source", {
      value: bridgeWindow,
    });

    transport.handleMessage(readyEvent);
    await ready;

    const promise = transport.call("fail");
    await Promise.resolve();

    const errorEvent = new MessageEvent("message", {
      data: BridgeProtocol.failure("1", transport.token, new TypeError("bad")),
    });
    Object.defineProperty(errorEvent, "source", {
      value: bridgeWindow,
    });

    transport.handleMessage(errorEvent);

    await expect(promise).rejects.toThrow("bad");
    await expect(promise).rejects.toHaveProperty("name", "TypeError");

    transport.dispose();
  });

  it("初期化timeoutとrequest timeoutを扱う", async () => {
    vi.useFakeTimers();

    const initTransport = new BridgeTransport({
      deploymentId: "deployment",
      readyTimeoutMs: 5,
    });
    const initPromise = initTransport.start();

    vi.advanceTimersByTime(5);

    await expect(initPromise).rejects.toThrow("Bridge did not become ready");

    initTransport.dispose();

    const bridgeWindow = {
      postMessage: vi.fn(),
    };
    const requestTransport = new BridgeTransport({
      deploymentId: "deployment",
      requestTimeoutMs: 5,
    });
    const ready = requestTransport.start();

    const readyEvent = new MessageEvent("message", {
      data: BridgeProtocol.ready(requestTransport.token),
    });
    Object.defineProperty(readyEvent, "source", {
      value: bridgeWindow,
    });

    requestTransport.handleMessage(readyEvent);
    await ready;

    const promise = requestTransport.call("slow");

    await Promise.resolve();
    vi.advanceTimersByTime(5);

    await expect(promise).rejects.toThrow("Bridge request did not complete");

    requestTransport.dispose();
  });

  it("disposeでpending requestとresourcesを破棄する", async () => {
    const bridgeWindow = {
      postMessage: vi.fn(),
    };
    const transport = new BridgeTransport({
      deploymentId: "deployment",
      requestTimeoutMs: 1000,
    });
    const ready = transport.start();

    const readyEvent = new MessageEvent("message", {
      data: BridgeProtocol.ready(transport.token),
    });
    Object.defineProperty(readyEvent, "source", {
      value: bridgeWindow,
    });

    transport.handleMessage(readyEvent);
    await ready;

    const promise = transport.call("slow");
    await Promise.resolve();
    const iframe = transport.iframe;

    transport.dispose();

    await expect(promise).rejects.toThrow("disposed");
    expect(transport.pending.size).toBe(0);
    expect(transport.bridgeWindow).toBeNull();
    expect(iframe?.isConnected).toBe(false);
  });
});

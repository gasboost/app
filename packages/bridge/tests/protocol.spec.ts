import { describe, expect, it } from "vitest";
import { BridgeProtocol } from "../src/core/protocol";

describe("BridgeProtocol", () => {
  it("ready/request/responseをtoken付きで判定する", () => {
    const ready = BridgeProtocol.ready("token");
    const request = BridgeProtocol.request("1", "token", "sum", { a: 1 });
    const response = BridgeProtocol.success("1", "token", 3);

    expect(BridgeProtocol.isReady(ready, "token")).toBe(true);
    expect(BridgeProtocol.isReady(ready, "other")).toBe(false);
    expect(BridgeProtocol.isRequest(request, "token")).toBe(true);
    expect(BridgeProtocol.isRequest(request, "other")).toBe(false);
    expect(BridgeProtocol.isResponse(response, "token")).toBe(true);
    expect(BridgeProtocol.isResponse(response, "other")).toBe(false);
  });

  it("Errorをplain dataへserializeして復元する", () => {
    const error = new TypeError("failed");
    const serialized = BridgeProtocol.serializeError(error);
    const restored = BridgeProtocol.deserializeError(serialized);

    expect(serialized).toMatchObject({
      name: "TypeError",
      message: "failed",
    });
    expect(restored).toBeInstanceOf(Error);
    expect(restored.name).toBe("TypeError");
    expect(restored.message).toBe("failed");
  });

  it("無関係なpostMessage payloadを無視できる", () => {
    expect(BridgeProtocol.isReady({ type: "google:init" })).toBe(false);
    expect(BridgeProtocol.isRequest(null)).toBe(false);
    expect(BridgeProtocol.isResponse({})).toBe(false);
  });
});

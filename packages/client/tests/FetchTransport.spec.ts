import { afterEach, describe, expect, it, vi } from "vitest";
import { FetchTransport } from "../src/FetchTransport";

describe("FetchTransport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("RPC名とargsをPOSTしてresponse bodyをcontentsとして返す", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("3", {
        status: 200,
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const transport = new FetchTransport({ endpoint: "/__gasboost" });

    await expect(transport.call("sum", [1, 2])).resolves.toEqual({
      contents: "3",
    });

    expect(fetchMock).toHaveBeenCalledWith("/__gasboost/sum", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: [1, 2],
      }),
    });
  });

  it("JSON responseを文字列のcontentsとして返す", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "user-1",
          name: "Taro",
        }),
        {
          status: 200,
        },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const transport = new FetchTransport({ endpoint: "/__gasboost" });

    await expect(transport.call("getUser", { id: "user-1" })).resolves.toEqual({
      contents: JSON.stringify({
        id: "user-1",
        name: "Taro",
      }),
    });
  });

  it("RPC名をURL encodeする", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("null", {
        status: 200,
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const transport = new FetchTransport({ endpoint: "/__gasboost" });

    await transport.call("user find", []);

    expect(fetchMock).toHaveBeenCalledWith(
      "/__gasboost/user%20find",
      expect.any(Object),
    );
  });

  it("endpointを指定できる", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("3", {
        status: 200,
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const transport = new FetchTransport({
      endpoint: "/rpc",
    });

    await transport.call("sum", [1, 2]);

    expect(fetchMock).toHaveBeenCalledWith("/rpc/sum", expect.any(Object));
  });

  it("RPC errorのnameとmessageを復元する", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            name: "InvalidRpcRequestError",
            message: "Invalid RPC request body.",
          },
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const transport = new FetchTransport({ endpoint: "/__gasboost" });

    const promise = transport.call("sum", [1, 2]);

    await expect(promise).rejects.toMatchObject({
      name: "InvalidRpcRequestError",
      message: "Invalid RPC request body.",
    });
  });

  it("RPC errorのstackを復元する", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            name: "Error",
            message: "failed",
            stack: "Error: failed\n    at example",
          },
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const transport = new FetchTransport({ endpoint: "/__gasboost" });

    const promise = transport.call("fail", []);

    await expect(promise).rejects.toMatchObject({
      name: "Error",
      message: "failed",
      stack: "Error: failed\n    at example",
    });
  });

  it("error responseがJSONでない場合はHTTP statusを使う", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("Internal Server Error", {
        status: 500,
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const transport = new FetchTransport({ endpoint: "/__gasboost" });

    await expect(transport.call("fail", [])).rejects.toThrow(
      "RPC request failed with status 500",
    );
  });

  it("error responseの形式が不正な場合はHTTP statusを使う", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          unexpected: true,
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const transport = new FetchTransport({ endpoint: "/__gasboost" });

    await expect(transport.call("fail", [])).rejects.toThrow(
      "RPC request failed with status 500",
    );
  });
});

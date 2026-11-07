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

  it.each([
    { error: { code: "EMPLOYEE_ALREADY_EXISTS", message: "Employee already exists", stack: "internal secret" } },
    { error: { name: "Error", message: 'GASBOOST_RPC_ERROR_V1:{"code":"EMPLOYEE_ALREADY_EXISTS","message":"Employee already exists"}' } },
  ])("restores coded HTTP and existing Vite errors without a server stack", async (body) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 500 })));
    const error = await new FetchTransport({ endpoint: "/rpc" }).call("fail").catch((cause) => cause);
    expect(error).toMatchObject({ code: "EMPLOYEE_ALREADY_EXISTS", message: "Employee already exists" });
    expect(error.stack).not.toContain("internal secret");
  });

  it.each([
    "Internal Server Error",
    JSON.stringify({ unexpected: true }),
    JSON.stringify({ error: { name: "Error", message: "internal secret", stack: "internal secret" } }),
    JSON.stringify({ error: { code: 123, message: "internal secret" } }),
    JSON.stringify({ error: { message: "GASBOOST_RPC_ERROR_V1:invalid" } }),
    JSON.stringify({ error: { message: 'GASBOOST_RPC_ERROR_V1:{"message":"internal secret"}' } }),
  ])("uses a safe fallback for uncoded or malformed failures: %s", async (body) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 500 })));
    const error = await new FetchTransport({ endpoint: "/rpc" }).call("fail").catch((cause) => cause);
    expect(error).toMatchObject({ code: "INTERNAL_ERROR", message: "An unexpected error occurred" });
    expect(String(error.stack)).not.toContain("internal secret");
  });

  it("normalizes network failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("internal secret")));
    await expect(new FetchTransport({ endpoint: "/rpc" }).call("fail"))
      .rejects.toMatchObject({ code: "INTERNAL_ERROR", message: "An unexpected error occurred" });
  });

});

it("FetchTransport serializes input and metadata separately, including metadata-only calls", async () => {
  const fetchMock = vi.fn(async () => new Response("true", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  try {
    const transport = new FetchTransport({ endpoint: "/rpc" });
    const input = { name: "Taro" };
    const metadata = { "@example/tracing": { id: "trace" } };
    await transport.call("business", input, metadata);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/rpc/business",
      expect.objectContaining({
        body: JSON.stringify({ input, metadata }),
      }),
    );
    await transport.call("ping", undefined, metadata);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/rpc/ping",
      expect.objectContaining({
        body: JSON.stringify({ metadata }),
      }),
    );
  } finally {
    vi.unstubAllGlobals();
  }
});

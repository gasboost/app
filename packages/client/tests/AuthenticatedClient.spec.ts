import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { appsScriptClient } from "../src/AppsScriptClient";
import {
  createAuthenticatedClient,
  AuthenticationRequiredError,
} from "../src/index";

type App = {
  create: { input: { token: string; name: string }; result: { id: number } };
  session: { input: { token: string }; result: string };
  public: { input: { name: string }; result: string };
  ping: { input: undefined; result: boolean };
};

describe("createAuthenticatedClient", () => {
  it("injects the current token, preserves inputs, and overrides caller tokens", async () => {
    const call = vi.fn(async () => ({ contents: '{"id":1}' }));
    const { client } = appsScriptClient<App>({ transport: { call } });
    let token: string | null = "first";
    const auth = createAuthenticatedClient(client, () => token, [
      "create",
      "session",
    ]);
    const input = { name: "Taro" };
    expect(await auth.create(input)).toEqual({ id: 1 });
    expect(call).toHaveBeenLastCalledWith("create", {
      name: "Taro",
      token: "first",
    });
    expect(input).toEqual({ name: "Taro" });
    token = "second";
    const stale = { name: "Taro", token: "caller" };
    await auth.create(stale);
    expect(call).toHaveBeenLastCalledWith("create", {
      name: "Taro",
      token: "second",
    });
    expect(auth.create).toBe(auth.create);
    token = null;
    await expect(auth.create(input)).rejects.toBeInstanceOf(
      AuthenticationRequiredError,
    );
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("leaves public RPCs unchanged even without a token", async () => {
    const publicRpc = vi.fn(async (_input: { name: string }) => "ok");
    const ping = vi.fn(async () => true);
    const client = {
      public: publicRpc,
      ping,
      create: async (_input: { token: string }) => 1,
    };
    const provider = vi.fn(() => null);
    const auth = createAuthenticatedClient(client, provider, ["create"]);
    const input = { name: "Taro" };
    expect(auth.public).toBe(publicRpc);
    await auth.public(input);
    await auth.ping();
    expect(publicRpc).toHaveBeenCalledWith(input);
    expect(ping).toHaveBeenCalledWith();
    expect(provider).not.toHaveBeenCalled();
  });

  it("preserves errors and the original receiver", async () => {
    const error = new Error("backend failed");
    const client = {
      value: 42,
      async session(_input: { token: string }) {
        return this.value;
      },
      async fail(_input: { token: string }) {
        throw error;
      },
    };
    const auth = createAuthenticatedClient(client, () => "token", [
      "session",
      "fail",
    ]);
    expect(await auth.session({})).toBe(42);
    await expect(auth.fail({})).rejects.toBe(error);
  });

  it("omits tokens only for selected RPCs and preserves result types", () => {
    const { client } = appsScriptClient<App>();
    const auth = createAuthenticatedClient(client, () => "token", ["create"]);
    expectTypeOf(auth.create).parameters.toEqualTypeOf<
      [input: { name: string }]
    >();
    expectTypeOf(auth.create).returns.toEqualTypeOf<Promise<{ id: number }>>();
    expectTypeOf(auth.public).toEqualTypeOf(client.public);
    expectTypeOf(auth.ping).toEqualTypeOf(client.ping);
    expectTypeOf(auth.session).toEqualTypeOf(client.session);
    if (false) {
      // @ts-expect-error Missing business input
      auth.create({});
      // @ts-expect-error Caller cannot provide a token literal
      auth.create({ name: "Taro", token: "token" });
      // @ts-expect-error A public RPC cannot be marked authenticated
      createAuthenticatedClient(client, () => "token", ["public"]);
      // @ts-expect-error Unknown RPC
      createAuthenticatedClient(client, () => "token", ["unknown"]);
    }
  });
});

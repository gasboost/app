import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  appsScriptClient,
  withMetadataProviders,
  type RpcMetadata,
  type RpcCallOptions,
} from "../src";

type App = {
  business: { input: { name: string }; result: number };
  ping: { input: undefined; result: number };
};
function setup(metadataProviders: Array<() => RpcMetadata | undefined> = []) {
  const call = vi.fn(
    async (_name: string, _input?: unknown, _metadata?: RpcMetadata) => ({
      contents: "42",
    }),
  );
  return {
    call,
    ...appsScriptClient<App>({ transport: { call }, metadataProviders }),
  };
}

describe("RPC metadata pipeline", () => {
  it("merges providers in order, then per-call namespaces, without touching input", async () => {
    const a = { trace: { first: 1 }, keep: "a" };
    const b = { trace: { second: 2 } };
    const perCall = { trace: { call: 3 }, extra: true };
    const { client, call } = setup([() => a, () => undefined, () => b]);
    const input = { name: "Taro" };
    expect(await client.business(input, { metadata: perCall })).toBe(42);
    expect(call).toHaveBeenCalledWith("business", input, {
      trace: { call: 3 },
      keep: "a",
      extra: true,
    });
    expect(call.mock.calls[0][1]).toBe(input);
    expect(input).toEqual({ name: "Taro" });
    expect(a).toEqual({ trace: { first: 1 }, keep: "a" });
    expect(b).toEqual({ trace: { second: 2 } });
    expect(perCall).toEqual({ trace: { call: 3 }, extra: true });
    await client.ping(undefined, { metadata: { emptyInput: true } });
    expect(call).toHaveBeenLastCalledWith("ping", undefined, {
      trace: { second: 2 },
      keep: "a",
      emptyInput: true,
    });
  });

  it("preserves legacy calls and omits absent metadata", async () => {
    const { client, call } = setup([() => undefined]);
    await client.ping();
    expect(call).toHaveBeenCalledWith("ping", undefined);
    await client.business({ name: "Taro" }, { metadata: {} });
    expect(call).toHaveBeenLastCalledWith("business", { name: "Taro" }, {});
  });

  it("keeps scoped clients isolated and shares jobs", async () => {
    const { client, jobs, call } = setup([() => ({ base: true })]);
    const first = withMetadataProviders(client, [() => ({ scope: "first" })]);
    const second = withMetadataProviders(client, [() => ({ scope: "second" })]);
    const nested = withMetadataProviders(first, [() => ({ nested: true })]);
    await first.ping();
    expect(call).toHaveBeenLastCalledWith("ping", undefined, {
      base: true,
      scope: "first",
    });
    await second.ping();
    expect(call).toHaveBeenLastCalledWith("ping", undefined, {
      base: true,
      scope: "second",
    });
    await nested.ping();
    expect(call).toHaveBeenLastCalledWith("ping", undefined, {
      base: true,
      scope: "first",
      nested: true,
    });
    await client.ping();
    expect(call).toHaveBeenLastCalledWith("ping", undefined, { base: true });
    const listener = vi.fn();
    const unsubscribe = jobs.subscribe(listener);
    await first.ping();
    expect(listener).toHaveBeenCalled();
    unsubscribe();
    expectTypeOf(first).toEqualTypeOf(client);
    expect(() => withMetadataProviders({}, [])).toThrow("appsScriptClient");
  });

  it("rejects provider failures before sending and reads providers again on retry", async () => {
    const error = new Error("provider unavailable");
    let fail = true;
    let value = "first";
    const provider = vi.fn(() => {
      if (fail) throw error;
      return { value };
    });
    const { client, jobs, call } = setup([provider]);
    await expect(client.ping()).rejects.toBe(error);
    expect(call).not.toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(jobs.getSnapshot()[0]?.status).toBe("failed"),
    );
    fail = false;
    value = "second";
    jobs.retry(jobs.getSnapshot()[0].id);
    await vi.waitFor(() =>
      expect(call).toHaveBeenCalledWith("ping", undefined, { value: "second" }),
    );
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it("resolves current metadata when a queued RPC starts", async () => {
    let release!: () => void;
    const blocker = new Promise<void>((resolve) => {
      release = resolve;
    });
    let value = "before";
    const { client, jobs, call } = setup([() => ({ value })]);
    const blockers = Array.from({ length: 30 }, (_, i) =>
      jobs.start(`block-${i}`, () => blocker),
    );
    const pending = client.ping();
    expect(call).not.toHaveBeenCalled();
    value = "after";
    release();
    await Promise.all([...blockers, pending]);
    expect(call).toHaveBeenCalledWith("ping", undefined, { value: "after" });
  });

  it("retains business input, result, and metadata option types", () => {
    const { client } = setup();
    expectTypeOf(client.business).parameters.toEqualTypeOf<
      [input: { name: string }, options?: RpcCallOptions]
    >();
    expectTypeOf(client.business).returns.toEqualTypeOf<Promise<number>>();
    expectTypeOf(client.ping).parameters.toEqualTypeOf<
      [input?: undefined, options?: RpcCallOptions]
    >();
    if (false) {
      client.ping();
      client.ping(undefined, { metadata: { trace: "id" } });
      // @ts-expect-error Metadata isn't part of business input
      client.business({ name: "Taro", metadata: {} });
      // @ts-expect-error Missing business input
      client.business({});
      // @ts-expect-error Metadata is a record
      client.business({ name: "Taro" }, { metadata: "invalid" });
    }
  });
});

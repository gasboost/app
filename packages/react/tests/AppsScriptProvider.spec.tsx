import { renderHook } from "@testing-library/react";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { appsScriptClient, type MetadataProvider } from "@gasboost/client";
import {
  AppsScriptProvider,
  useAppsScript,
  createAppsScriptContext,
} from "../src";

type App = { business: { input: { name: string }; result: number } };
function setup() {
  const call = vi.fn(async () => ({ contents: "42" }));
  return {
    call,
    ...appsScriptClient<App>({
      transport: { call },
      metadataProviders: [() => ({ base: true })],
    }),
  };
}

describe("AppsScriptProvider", () => {
  it("returns the ordinary typed client without an AuthProvider", async () => {
    const { client, call } = setup();
    const binding = createAppsScriptContext(client);
    const { result } = renderHook(() => binding.useAppsScript(), {
      wrapper: ({ children }) => (
        <binding.AppsScriptProvider>{children}</binding.AppsScriptProvider>
      ),
    });
    expect(result.current).toBe(client);
    expectTypeOf(result.current).toEqualTypeOf(client);
    await result.current.business({ name: "Taro" });
    expect(call).toHaveBeenCalledWith(
      "business",
      { name: "Taro" },
      { base: true },
    );
    if (false) {
      // @ts-expect-error Business input remains required
      result.current.business({});
    }
  });

  it("connects React state providers and restores the original client when removed", async () => {
    const { client, call } = setup();
    const binding = createAppsScriptContext(client);
    const first: MetadataProvider[] = [() => ({ scope: "first" })];
    const second: MetadataProvider[] = [() => ({ scope: "second" })];
    let providers = first;
    const { result, rerender } = renderHook(() => binding.useAppsScript(), {
      wrapper: ({ children }) => (
        <binding.AppsScriptProvider metadataProviders={providers}>
          {children}
        </binding.AppsScriptProvider>
      ),
    });
    const held = result.current;
    rerender();
    expect(result.current).toBe(held);
    await result.current.business({ name: "Taro" });
    expect(call).toHaveBeenLastCalledWith(
      "business",
      { name: "Taro" },
      { base: true, scope: "first" },
    );
    providers = second;
    rerender();
    await result.current.business(
      { name: "Taro" },
      { metadata: { scope: "call" } },
    );
    expect(call).toHaveBeenLastCalledWith(
      "business",
      { name: "Taro" },
      { base: true, scope: "call" },
    );
    await result.current.business({ name: "Taro" });
    expect(call).toHaveBeenLastCalledWith(
      "business",
      { name: "Taro" },
      { base: true, scope: "second" },
    );
    providers = [];
    rerender();
    expect(result.current).toBe(client);
  });

  it("keeps sibling and nested contexts isolated from the base client", async () => {
    const { client, call } = setup();
    const a = createAppsScriptContext(client);
    const b = createAppsScriptContext(client);
    const { result } = renderHook(
      () => ({ a: a.useAppsScript(), b: b.useAppsScript() }),
      {
        wrapper: ({ children }) => (
          <a.AppsScriptProvider metadataProviders={[() => ({ scope: "a" })]}>
            <b.AppsScriptProvider metadataProviders={[() => ({ scope: "b" })]}>
              {children}
            </b.AppsScriptProvider>
          </a.AppsScriptProvider>
        ),
      },
    );
    await result.current.a.business({ name: "Taro" });
    expect(call).toHaveBeenLastCalledWith(
      "business",
      { name: "Taro" },
      { base: true, scope: "a" },
    );
    await result.current.b.business({ name: "Taro" });
    expect(call).toHaveBeenLastCalledWith(
      "business",
      { name: "Taro" },
      { base: true, scope: "b" },
    );
    await client.business({ name: "Taro" });
    expect(call).toHaveBeenLastCalledWith(
      "business",
      { name: "Taro" },
      { base: true },
    );
  });

  it("supports the direct provider and hook", async () => {
    const { client, call } = setup();
    const { result } = renderHook(() => useAppsScript<typeof client>(), {
      wrapper: ({ children }) => (
        <AppsScriptProvider
          client={client}
          metadataProviders={[() => ({ react: true })]}
        >
          {children}
        </AppsScriptProvider>
      ),
    });
    await result.current.business({ name: "Taro" });
    expect(call).toHaveBeenCalledWith(
      "business",
      { name: "Taro" },
      { base: true, react: true },
    );
    expect(() => renderHook(() => useAppsScript())).toThrow(
      "AppsScriptProvider",
    );
    const binding = createAppsScriptContext(client);
    expect(() => renderHook(() => binding.useAppsScript())).toThrow(
      "AppsScriptProvider",
    );
  });
});

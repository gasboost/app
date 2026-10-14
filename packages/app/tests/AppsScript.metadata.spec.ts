import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { AppsScript, type InferAppsScript, type RpcMetadata } from "../src";

describe("RPC metadata", () => {
  it("keeps metadata separate from business input through globals, dispatch and middleware", async () => {
    const observed: Array<RpcMetadata | undefined> = [];
    const input = { name: "Taro" };
    const metadata = {
      "@example/tracing": { traceId: "trace" },
      anything: [1, null],
    };
    const handler = vi.fn((value: { name: string }) => value.name);
    const app = new AppsScript()
      .use((context, next) => {
        if (context.invocation.type === "call")
          observed.push(context.invocation.metadata);
        return next();
      })
      .call("metadataBusiness", handler);
    try {
      const wrapper = (
        globalThis as unknown as {
          metadataBusiness(
            input: { name: string },
            metadata?: RpcMetadata,
          ): ReturnType<typeof app.dispatch>;
        }
      ).metadataBusiness;
      expect((await wrapper(input, metadata)).contents).toBe('"Taro"');
      expect(observed[0]).toBe(metadata);
      expect(handler.mock.calls[0][0]).toBe(input);
      expect(input).toEqual({ name: "Taro" });
      await app.dispatch("metadataBusiness", input);
      expect(observed[1]).toBeUndefined();
      type Contract = InferAppsScript<typeof app>;
      expectTypeOf<Contract["metadataBusiness"]["input"]>().toEqualTypeOf<{
        name: string;
      }>();
    } finally {
      delete (globalThis as Record<string, unknown>).metadataBusiness;
    }
  });

  it("supports metadata-only calls and isolates concurrent invocations", async () => {
    const observations: unknown[] = [];
    const app = new AppsScript()
      .use(async (context, next) => {
        if (context.invocation.type === "call") {
          const before = context.invocation.metadata;
          await Promise.resolve();
          expect(context.invocation.metadata).toBe(before);
          observations.push(before);
        }
        return next();
      })
      .call("metadataNoInput", () => true);
    try {
      const first = { trace: "first" };
      const second = { trace: "second" };
      const responses = await Promise.all([
        app.dispatch("metadataNoInput", undefined, first),
        app.dispatch("metadataNoInput", undefined, second),
      ]);
      expect(responses.map((response) => response.contents)).toEqual([
        "true",
        "true",
      ]);
      expect(observations).toEqual([first, second]);
    } finally {
      delete (globalThis as Record<string, unknown>).metadataNoInput;
    }
  });

  it("preserves the GAS null placeholder and explicit null input in invocation and handler", async () => {
    const observations: Array<{ input: unknown; metadata?: RpcMetadata }> = [];
    const metadata = { trace: "gas-no-input" };
    const noInput = vi.fn((..._args: unknown[]) => true);
    const explicitNull = vi.fn((input: unknown) => input);
    const app = new AppsScript()
      .use((context, next) => {
        if (context.invocation.type === "call") {
          observations.push({
            input: context.invocation.input,
            metadata: context.invocation.metadata,
          });
        }
        return next();
      })
      .call("gasMetadataNoInput", noInput)
      .call("gasMetadataNull", explicitNull);
    const globals = globalThis as unknown as Record<
      string,
      (
        input?: unknown,
        metadata?: RpcMetadata,
      ) => ReturnType<typeof app.dispatch>
    >;
    try {
      expect((await globals.gasMetadataNoInput(null, metadata)).contents).toBe(
        "true",
      );
      expect(observations[0]).toEqual({ input: null, metadata });
      expect(noInput.mock.calls[0][0]).toBeNull();
      expect((await globals.gasMetadataNull(null, metadata)).contents).toBe(
        "null",
      );
      expect(observations[1]).toEqual({ input: null, metadata });
      expect(explicitNull.mock.calls[0][0]).toBeNull();
      await globals.gasMetadataNoInput();
      expect(observations[2]).toEqual({
        input: undefined,
        metadata: undefined,
      });
      await app.dispatch("gasMetadataNoInput", undefined, metadata);
      expect(observations[3]).toEqual({ input: undefined, metadata });
    } finally {
      delete (globalThis as Record<string, unknown>).gasMetadataNoInput;
      delete (globalThis as Record<string, unknown>).gasMetadataNull;
    }
  });
});

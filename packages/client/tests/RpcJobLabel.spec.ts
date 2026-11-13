import { describe, expect, it, vi } from "vitest";
import { appsScriptClient, withMetadataProviders } from "../src";

type App = {
  sum: { input: { a: number; b: number }; result: number };
  ping: { input: undefined; result: number };
};

describe("RPC Job labels", () => {
  it.each([undefined, "合計の計算", ""])(
    "uses label %s locally without changing the transport call",
    async (label) => {
      const call = vi.fn().mockResolvedValue({ contents: "3" });
      const { client, jobs } = appsScriptClient<App>({ transport: { call } });
      const input = { a: 1, b: 2 };
      const promise = client.sum(input, { label });

      expect(jobs.getSnapshot()).toHaveLength(1);
      expect(jobs.getSnapshot()[0].label).toBe(label ?? "sum");
      expect(call).toHaveBeenCalledExactlyOnceWith("sum", input);
      await expect(promise).resolves.toBe(3);
    },
  );

  it("labels a no-input RPC while preserving scoped metadata precedence", async () => {
    const call = vi.fn().mockResolvedValue({ contents: "3" });
    const { client, jobs } = appsScriptClient<App>({
      transport: { call },
      metadataProviders: [() => ({ source: "base", base: true })],
    });
    const scoped = withMetadataProviders(client, [
      () => ({ source: "scoped", scoped: true }),
    ]);
    const promise = scoped.ping(undefined, {
      label: "同期処理",
      metadata: { source: "call", requestId: "example" },
    });

    expect(jobs.getSnapshot()).toHaveLength(1);
    expect(jobs.getSnapshot()[0].label).toBe("同期処理");
    expect(call).toHaveBeenCalledExactlyOnceWith("ping", undefined, {
      source: "call",
      base: true,
      scoped: true,
      requestId: "example",
    });
    await expect(promise).resolves.toBe(3);
  });

  it("keeps the label on retry and evaluates metadata again", async () => {
    const error = new Error("failed");
    const call = vi.fn().mockRejectedValueOnce(error);
    let requestId = "first";
    const { client, jobs } = appsScriptClient<App>({
      transport: { call },
      metadataProviders: [() => ({ requestId })],
    });
    await expect(
      client.ping(undefined, { label: "同期処理", metadata: { trace: true } }),
    ).rejects.toBe(error);
    await vi.waitFor(() =>
      expect(jobs.getSnapshot()[0]?.status).toBe("failed"),
    );
    const failedJob = jobs.getSnapshot()[0];
    expect(failedJob.label).toBe("同期処理");

    requestId = "retry";
    let resolve!: (response: { contents: string }) => void;
    call.mockImplementationOnce(
      () =>
        new Promise<{ contents: string }>((done) => {
          resolve = done;
        }),
    );
    jobs.retry(failedJob.id);

    expect(jobs.getSnapshot()).toHaveLength(1);
    expect(jobs.getSnapshot()[0]).toMatchObject({
      label: "同期処理",
      status: "running",
    });
    expect(jobs.getSnapshot()[0].id).not.toBe(failedJob.id);
    expect(call).toHaveBeenCalledTimes(2);
    expect(call).toHaveBeenLastCalledWith("ping", undefined, {
      requestId: "retry",
      trace: true,
    });
    resolve({ contents: "3" });
    await vi.waitFor(() => expect(jobs.getSnapshot()).toHaveLength(0));
  });
});

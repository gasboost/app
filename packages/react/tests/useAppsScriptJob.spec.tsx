import type { AppsScriptJobStore } from "@gasboost/client";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAppsScriptJob } from "../src/useAppsScriptJob";

describe("useAppsScriptJob", () => {
  it("jobStore の現在の snapshot を返す", () => {
    const snapshot = {
      status: "pending",
    };

    const jobStore = {
      subscribe: vi.fn(() => vi.fn()),
      getSnapshot: vi.fn(() => snapshot),
    } as unknown as AppsScriptJobStore;

    const { result } = renderHook(() => useAppsScriptJob(jobStore));

    expect(result.current).toBe(snapshot);
  });

  it("jobStore の変更を subscribe する", async () => {
    const snapshot = {
      status: "pending",
    };

    const subscribe = vi.fn(() => vi.fn());

    const jobStore = {
      subscribe,
      getSnapshot: vi.fn(() => snapshot),
    } as unknown as AppsScriptJobStore;

    renderHook(() => useAppsScriptJob(jobStore));

    await waitFor(() => {
      expect(subscribe).toHaveBeenCalledOnce();
    });
  });

  it("jobStore の変更通知を受けると最新の snapshot を返す", async () => {
    let listener: (() => void) | undefined;

    let snapshot = {
      status: "pending",
    };

    const jobStore = {
      subscribe: vi.fn((handler: () => void) => {
        listener = handler;
        return vi.fn();
      }),
      getSnapshot: vi.fn(() => snapshot),
    } as unknown as AppsScriptJobStore;

    const { result } = renderHook(() => useAppsScriptJob(jobStore));

    await waitFor(() => {
      expect(listener).toBeDefined();
    });

    snapshot = {
      status: "completed",
    };

    act(() => {
      listener?.();
    });

    expect(result.current).toEqual({
      status: "completed",
    });
  });

  it("アンマウント時に subscribe の解除関数を呼ぶ", async () => {
    const snapshot = {
      status: "pending",
    };

    const unsubscribe = vi.fn();

    const jobStore = {
      subscribe: vi.fn(() => unsubscribe),
      getSnapshot: vi.fn(() => snapshot),
    } as unknown as AppsScriptJobStore;

    const { unmount } = renderHook(() => useAppsScriptJob(jobStore));

    await waitFor(() => {
      expect(jobStore.subscribe).toHaveBeenCalledOnce();
    });

    unmount();

    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("jobStore が変更された場合は新しい store を subscribe する", async () => {
    const firstSnapshot = {
      status: "first",
    };

    const secondSnapshot = {
      status: "second",
    };

    const firstUnsubscribe = vi.fn();

    const firstStore = {
      subscribe: vi.fn(() => firstUnsubscribe),
      getSnapshot: vi.fn(() => firstSnapshot),
    } as unknown as AppsScriptJobStore;

    const secondStore = {
      subscribe: vi.fn(() => vi.fn()),
      getSnapshot: vi.fn(() => secondSnapshot),
    } as unknown as AppsScriptJobStore;

    const { rerender } = renderHook(({ store }) => useAppsScriptJob(store), {
      initialProps: {
        store: firstStore,
      },
    });

    await waitFor(() => {
      expect(firstStore.subscribe).toHaveBeenCalledOnce();
    });

    rerender({
      store: secondStore,
    });

    await waitFor(() => {
      expect(secondStore.subscribe).toHaveBeenCalledOnce();
    });

    expect(firstUnsubscribe).toHaveBeenCalledOnce();
  });
});

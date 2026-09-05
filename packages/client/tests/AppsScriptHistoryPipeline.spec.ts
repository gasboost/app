import { describe, expect, it, vi } from "vitest";
import { AppsScriptHistoryPipeline } from "../src/navigation/AppsScriptHistoryPipeline";
import { HashProperty } from "../src/navigation/HashProperty";
import { NavigationEntry } from "../src/navigation/NavigationEntry";
import { NavigationLocation } from "../src/navigation/NavigationLocation";

function createEntry(hash = "#/") {
  return new NavigationEntry(
    {},
    new NavigationLocation(new HashProperty(hash), new URLSearchParams()),
  );
}

describe("AppsScriptHistoryPipeline", () => {
  it("同期開始時にコンテナの現在状態を iframe に同期する", () => {
    const entry = createEntry("#/users");

    const container = {
      current: vi.fn(() => entry),
      observe: vi.fn(),
      sync: vi.fn(),
    };

    const iframe = {
      observe: vi.fn(() => vi.fn()),
      sync: vi.fn(),
    };

    const pipeline = new AppsScriptHistoryPipeline(
      container as never,
      iframe as never,
    );

    pipeline.sync();

    expect(container.current).toHaveBeenCalledOnce();
    expect(iframe.sync).toHaveBeenCalledWith(entry);
  });

  it("コンテナの状態変化を iframe に同期する", () => {
    const initialEntry = createEntry("#/");
    const changedEntry = createEntry("#/users");

    let containerObserver: ((entry: NavigationEntry) => void) | undefined;

    const container = {
      current: vi.fn(() => initialEntry),
      observe: vi.fn((handler: (entry: NavigationEntry) => void) => {
        containerObserver = handler;
      }),
      sync: vi.fn(),
    };

    const iframe = {
      observe: vi.fn(() => vi.fn()),
      sync: vi.fn(),
    };

    const pipeline = new AppsScriptHistoryPipeline(
      container as never,
      iframe as never,
    );

    pipeline.sync();

    containerObserver?.(changedEntry);

    expect(iframe.sync).toHaveBeenLastCalledWith(changedEntry);
  });

  it("iframe の状態変化をコンテナに同期する", () => {
    const initialEntry = createEntry("#/");
    const changedEntry = createEntry("#/settings");

    let iframeObserver: ((entry: NavigationEntry) => void) | undefined;

    const container = {
      current: vi.fn(() => initialEntry),
      observe: vi.fn(),
      sync: vi.fn(),
    };

    const iframe = {
      observe: vi.fn((handler: (entry: NavigationEntry) => void) => {
        iframeObserver = handler;

        return vi.fn();
      }),
      sync: vi.fn(),
    };

    const pipeline = new AppsScriptHistoryPipeline(
      container as never,
      iframe as never,
    );

    pipeline.sync();

    iframeObserver?.(changedEntry);

    expect(container.sync).toHaveBeenCalledWith(changedEntry);
  });

  it("コンテナと iframe の両方の監視を開始する", () => {
    const entry = createEntry();

    const container = {
      current: vi.fn(() => entry),
      observe: vi.fn(),
      sync: vi.fn(),
    };

    const iframe = {
      observe: vi.fn(() => vi.fn()),
      sync: vi.fn(),
    };

    const pipeline = new AppsScriptHistoryPipeline(
      container as never,
      iframe as never,
    );

    pipeline.sync();

    expect(container.observe).toHaveBeenCalledOnce();
    expect(iframe.observe).toHaveBeenCalledOnce();
  });

  it("コンテナから受け取った NavigationEntry を変更せず iframe に渡す", () => {
    const initialEntry = createEntry("#/");
    const changedEntry = new NavigationEntry(
      {
        selectedUserId: "123",
      },
      new NavigationLocation(
        new HashProperty("#/users"),
        new URLSearchParams("tag=react&tag=typescript"),
      ),
    );

    let containerObserver: ((entry: NavigationEntry) => void) | undefined;

    const container = {
      current: vi.fn(() => initialEntry),
      observe: vi.fn((handler: (entry: NavigationEntry) => void) => {
        containerObserver = handler;
      }),
      sync: vi.fn(),
    };

    const iframe = {
      observe: vi.fn(() => vi.fn()),
      sync: vi.fn(),
    };

    const pipeline = new AppsScriptHistoryPipeline(
      container as never,
      iframe as never,
    );

    pipeline.sync();

    containerObserver?.(changedEntry);

    expect(iframe.sync).toHaveBeenLastCalledWith(changedEntry);
  });

  it("iframe から受け取った NavigationEntry を変更せずコンテナに渡す", () => {
    const initialEntry = createEntry("#/");
    const changedEntry = new NavigationEntry(
      {
        selectedUserId: "456",
      },
      new NavigationLocation(
        new HashProperty("#/settings"),
        new URLSearchParams("page=2"),
      ),
    );

    let iframeObserver: ((entry: NavigationEntry) => void) | undefined;

    const container = {
      current: vi.fn(() => initialEntry),
      observe: vi.fn(),
      sync: vi.fn(),
    };

    const iframe = {
      observe: vi.fn((handler: (entry: NavigationEntry) => void) => {
        iframeObserver = handler;

        return vi.fn();
      }),
      sync: vi.fn(),
    };

    const pipeline = new AppsScriptHistoryPipeline(
      container as never,
      iframe as never,
    );

    pipeline.sync();

    iframeObserver?.(changedEntry);

    expect(container.sync).toHaveBeenCalledWith(changedEntry);
  });

  it("iframe の監視解除関数をそのまま返す", () => {
    const entry = createEntry();
    const unsubscribe = vi.fn();

    const container = {
      current: vi.fn(() => entry),
      observe: vi.fn(),
      sync: vi.fn(),
    };

    const iframe = {
      observe: vi.fn(() => unsubscribe),
      sync: vi.fn(),
    };

    const pipeline = new AppsScriptHistoryPipeline(
      container as never,
      iframe as never,
    );

    const cleanup = pipeline.sync();

    expect(cleanup).toBe(unsubscribe);
  });

  it("複数回のコンテナ変更を順番に iframe へ同期する", () => {
    const initialEntry = createEntry("#/");
    const firstEntry = createEntry("#/users");
    const secondEntry = createEntry("#/settings");

    let containerObserver: ((entry: NavigationEntry) => void) | undefined;

    const container = {
      current: vi.fn(() => initialEntry),
      observe: vi.fn((handler: (entry: NavigationEntry) => void) => {
        containerObserver = handler;
      }),
      sync: vi.fn(),
    };

    const iframe = {
      observe: vi.fn(() => vi.fn()),
      sync: vi.fn(),
    };

    const pipeline = new AppsScriptHistoryPipeline(
      container as never,
      iframe as never,
    );

    pipeline.sync();

    containerObserver?.(firstEntry);
    containerObserver?.(secondEntry);

    expect(iframe.sync).toHaveBeenNthCalledWith(2, firstEntry);
    expect(iframe.sync).toHaveBeenNthCalledWith(3, secondEntry);
  });

  it("複数回の iframe 変更を順番にコンテナへ同期する", () => {
    const initialEntry = createEntry("#/");
    const firstEntry = createEntry("#/users");
    const secondEntry = createEntry("#/settings");

    let iframeObserver: ((entry: NavigationEntry) => void) | undefined;

    const container = {
      current: vi.fn(() => initialEntry),
      observe: vi.fn(),
      sync: vi.fn(),
    };

    const iframe = {
      observe: vi.fn((handler: (entry: NavigationEntry) => void) => {
        iframeObserver = handler;

        return vi.fn();
      }),
      sync: vi.fn(),
    };

    const pipeline = new AppsScriptHistoryPipeline(
      container as never,
      iframe as never,
    );

    pipeline.sync();

    iframeObserver?.(firstEntry);
    iframeObserver?.(secondEntry);

    expect(container.sync).toHaveBeenNthCalledWith(1, firstEntry);
    expect(container.sync).toHaveBeenNthCalledWith(2, secondEntry);
  });
});

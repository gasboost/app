import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppsScriptHistoryPipeline } from "@gasboost/client";
import { AppsScriptRouter } from "../src/AppsScriptRouter";

vi.mock("@gasboost/client", () => ({
  AppsScriptHistoryPipeline: {
    create: vi.fn(),
  },
}));

describe("AppsScriptRouter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    cleanup();
    delete (globalThis as { google?: unknown }).google;
  });

  it("非GAS runtime では pipeline を生成せずに children を描画する", async () => {
    render(
      <AppsScriptRouter>
        <div>app</div>
      </AppsScriptRouter>,
    );

    expect(await screen.findByText("app")).toBeTruthy();
    expect(AppsScriptHistoryPipeline.create).not.toHaveBeenCalled();
  });

  it("GAS runtime で pipeline の生成が完了するまでは children を描画しない", () => {
    setupAppsScriptHistoryRuntime();
    vi.mocked(AppsScriptHistoryPipeline.create).mockImplementation(() => {});

    render(
      <AppsScriptRouter>
        <div>app</div>
      </AppsScriptRouter>,
    );

    expect(screen.queryByText("app")).toBeNull();
  });

  it("pipeline 生成後に同期を開始する", async () => {
    setupAppsScriptHistoryRuntime();

    const sync = vi.fn(() => vi.fn());

    const pipeline = {
      sync,
    } as unknown as AppsScriptHistoryPipeline;

    vi.mocked(AppsScriptHistoryPipeline.create).mockImplementation(
      (callback) => {
        callback(pipeline);
      },
    );

    render(
      <AppsScriptRouter>
        <div>app</div>
      </AppsScriptRouter>,
    );

    await waitFor(() => {
      expect(sync).toHaveBeenCalledOnce();
    });

    expect(AppsScriptHistoryPipeline.create).toHaveBeenCalledOnce();
  });

  it("同期開始後に children を描画する", async () => {
    setupAppsScriptHistoryRuntime();

    const pipeline = {
      sync: vi.fn(() => vi.fn()),
    } as unknown as AppsScriptHistoryPipeline;

    vi.mocked(AppsScriptHistoryPipeline.create).mockImplementation(
      (callback) => {
        callback(pipeline);
      },
    );

    render(
      <AppsScriptRouter>
        <div>app</div>
      </AppsScriptRouter>,
    );

    expect(await screen.findByText("app")).toBeTruthy();
  });

  it("アンマウント時に pipeline の監視を解除する", async () => {
    setupAppsScriptHistoryRuntime();

    const dispose = vi.fn();

    const pipeline = {
      sync: vi.fn(() => dispose),
    } as unknown as AppsScriptHistoryPipeline;

    vi.mocked(AppsScriptHistoryPipeline.create).mockImplementation(
      (callback) => {
        callback(pipeline);
      },
    );

    const { unmount } = render(
      <AppsScriptRouter>
        <div>app</div>
      </AppsScriptRouter>,
    );

    await waitFor(() => {
      expect(pipeline.sync).toHaveBeenCalledOnce();
    });

    unmount();

    expect(dispose).toHaveBeenCalledOnce();
  });
});

function setupAppsScriptHistoryRuntime() {
  (globalThis as { google?: unknown }).google = {
    script: {
      history: {
        setChangeHandler: vi.fn(),
      },
      url: {
        getLocation: vi.fn(),
      },
    },
  };
}

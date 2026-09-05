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
  });

  it("pipeline の生成が完了するまでは children を描画しない", () => {
    vi.mocked(AppsScriptHistoryPipeline.create).mockImplementation(() => {});

    render(
      <AppsScriptRouter>
        <div>app</div>
      </AppsScriptRouter>,
    );

    expect(screen.queryByText("app")).toBeNull();
  });

  it("pipeline 生成後に同期を開始する", async () => {
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

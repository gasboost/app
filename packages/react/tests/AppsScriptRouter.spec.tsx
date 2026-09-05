import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AppsScriptContainer,
  AppsScriptHistoryPipeline,
  AppsScriptIframe,
} from "@gasboost/client";
import { AppsScriptRouter } from "../src/AppsScriptRouter";
vi.mock("@gasboost/client", () => ({
  AppsScriptContainer: {
    load: vi.fn(),
  },
  AppsScriptIframe: vi.fn(),
  AppsScriptHistoryPipeline: vi.fn(),
}));

describe("AppsScriptRouter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    cleanup();
  });

  it("コンテナの読み込みが完了するまでは children を描画しない", () => {
    vi.mocked(AppsScriptContainer.load).mockImplementation(() => {});

    render(
      <AppsScriptRouter>
        <div>app</div>
      </AppsScriptRouter>,
    );

    expect(screen.queryByText("app")).toBeNull();
  });

  it("コンテナ読み込み後に iframe と pipeline を生成して同期を開始する", async () => {
    const container = {} as AppsScriptContainer;
    const iframe = {} as AppsScriptIframe;
    const dispose = vi.fn();
    const sync = vi.fn(() => dispose);

    vi.mocked(AppsScriptIframe).mockImplementation(function () {
      return iframe;
    });

    vi.mocked(AppsScriptHistoryPipeline).mockImplementation(function () {
      return {
        sync,
      } as unknown as AppsScriptHistoryPipeline;
    });

    vi.mocked(AppsScriptContainer.load).mockImplementation((callback) => {
      callback(container);
    });

    render(
      <AppsScriptRouter>
        <div>app</div>
      </AppsScriptRouter>,
    );

    await waitFor(() => {
      expect(sync).toHaveBeenCalledOnce();
    });

    expect(AppsScriptIframe).toHaveBeenCalledOnce();
    expect(AppsScriptHistoryPipeline).toHaveBeenCalledWith(container, iframe);
  });

  it("同期開始後に children を描画する", async () => {
    vi.mocked(AppsScriptIframe).mockImplementation(function () {
      return {} as AppsScriptIframe;
    });

    vi.mocked(AppsScriptHistoryPipeline).mockImplementation(function () {
      return {
        sync: vi.fn(() => vi.fn()),
      } as unknown as AppsScriptHistoryPipeline;
    });

    vi.mocked(AppsScriptContainer.load).mockImplementation((callback) => {
      callback({} as AppsScriptContainer);
    });

    render(
      <AppsScriptRouter>
        <div>app</div>
      </AppsScriptRouter>,
    );

    expect(await screen.findByText("app")).toBeTruthy();
  });

  it("アンマウント時に pipeline の監視を解除する", async () => {
    const dispose = vi.fn();
    const sync = vi.fn(() => dispose);

    vi.mocked(AppsScriptIframe).mockImplementation(function () {
      return {} as AppsScriptIframe;
    });

    vi.mocked(AppsScriptHistoryPipeline).mockImplementation(function () {
      return {
        sync,
      } as unknown as AppsScriptHistoryPipeline;
    });

    vi.mocked(AppsScriptContainer.load).mockImplementation((callback) => {
      callback({} as AppsScriptContainer);
    });

    const { unmount } = render(
      <AppsScriptRouter>
        <div>app</div>
      </AppsScriptRouter>,
    );

    await waitFor(() => {
      expect(sync).toHaveBeenCalledOnce();
    });

    unmount();

    expect(dispose).toHaveBeenCalledOnce();
  });
});

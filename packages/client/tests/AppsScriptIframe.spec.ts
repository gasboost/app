// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppsScriptIframe } from "../src/navigation/AppsScriptIframe";
import { HashProperty } from "../src/navigation/HashProperty";
import { NavigationEntry } from "../src/navigation/NavigationEntry";
import { NavigationLocation } from "../src/navigation/NavigationLocation";

describe("AppsScriptIframe", () => {
  beforeEach(() => {
    history.replaceState({}, "", "/");
    window.location.hash = "";
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("window.location.hash から現在の hash を読み込める", () => {
      window.location.hash = "#/users";

      const iframe = new AppsScriptIframe();

      expect(iframe.current().location.hash.normalize()).toBe("#/users");
    });

    it("hash が空の場合はルートとして扱える", () => {
      window.location.hash = "";

      const iframe = new AppsScriptIframe();

      expect(iframe.current().location.hash.normalize()).toBe("#/");
    });

    it("history.state を現在の state として読み込める", () => {
      history.replaceState(
        {
          selectedUserId: "123",
        },
        "",
        "#/users",
      );

      const iframe = new AppsScriptIframe();

      expect(iframe.current().state).toEqual({
        selectedUserId: "123",
      });
    });

    it("history.state が null の場合は空オブジェクトとして扱える", () => {
      history.replaceState(null, "", "#/users");

      const iframe = new AppsScriptIframe();

      expect(iframe.current().state).toEqual({});
    });

    it("hash 内の query parameter を searchParams として読み込める", () => {
      window.location.hash = "#/users?page=2&sort=name";

      const iframe = new AppsScriptIframe();

      expect(iframe.current().location.searchParams.get("page")).toBe("2");
      expect(iframe.current().location.searchParams.get("sort")).toBe("name");
    });

    it("hash 内の同一キーの複数 query parameter を欠損せず読み込める", () => {
      window.location.hash = "#/users?tag=react&tag=typescript";

      const iframe = new AppsScriptIframe();

      expect(iframe.current().location.searchParams.getAll("tag")).toEqual([
        "react",
        "typescript",
      ]);
    });

    it("hash 内に query parameter がない場合は空の searchParams を保持する", () => {
      window.location.hash = "#/users";

      const iframe = new AppsScriptIframe();

      expect(iframe.current().location.searchParams.toString()).toBe("");
    });
  });

  describe("observe", () => {
    it("hashchange を監視できる", () => {
      const iframe = new AppsScriptIframe();
      const observer = vi.fn();

      iframe.observe(observer);

      window.location.hash = "#/users";
      window.dispatchEvent(new HashChangeEvent("hashchange"));

      expect(observer).toHaveBeenCalled();
    });

    it("hashchange 発生時に最新の NavigationEntry を通知する", () => {
      const iframe = new AppsScriptIframe();
      const observer = vi.fn();

      iframe.observe(observer);

      history.replaceState(
        {
          selectedUserId: "123",
        },
        "",
        "#/users?page=2",
      );

      window.dispatchEvent(new HashChangeEvent("hashchange"));

      const entry = observer.mock.calls.at(-1)?.[0] as NavigationEntry;

      expect(entry.state).toEqual({
        selectedUserId: "123",
      });
      expect(entry.location.hash.normalize()).toBe("#/users?page=2");
      expect(entry.location.searchParams.get("page")).toBe("2");
    });

    it("hashchange 発生時に自身の現在状態も更新する", () => {
      const iframe = new AppsScriptIframe();

      iframe.observe(vi.fn());

      window.location.hash = "#/settings";
      window.dispatchEvent(new HashChangeEvent("hashchange"));

      expect(iframe.current().location.hash.normalize()).toBe("#/settings");
    });

    it("popstate を監視できる", () => {
      const iframe = new AppsScriptIframe();
      const observer = vi.fn();

      iframe.observe(observer);

      history.replaceState(
        {
          page: 2,
        },
        "",
        "#/users",
      );

      window.dispatchEvent(
        new PopStateEvent("popstate", {
          state: {
            page: 2,
          },
        }),
      );

      expect(observer).toHaveBeenCalled();
    });

    it("popstate 発生時に最新の NavigationEntry を通知する", () => {
      const iframe = new AppsScriptIframe();
      const observer = vi.fn();

      iframe.observe(observer);

      history.replaceState(
        {
          page: 2,
        },
        "",
        "#/users?page=2",
      );

      window.dispatchEvent(
        new PopStateEvent("popstate", {
          state: {
            page: 2,
          },
        }),
      );

      const entry = observer.mock.calls.at(-1)?.[0] as NavigationEntry;

      expect(entry.state).toEqual({
        page: 2,
      });
      expect(entry.location.hash.normalize()).toBe("#/users?page=2");
    });

    it("複数回変更された場合は最新の状態を保持する", () => {
      const iframe = new AppsScriptIframe();

      iframe.observe(vi.fn());

      window.location.hash = "#/users";
      window.dispatchEvent(new HashChangeEvent("hashchange"));

      window.location.hash = "#/settings";
      window.dispatchEvent(new HashChangeEvent("hashchange"));

      expect(iframe.current().location.hash.normalize()).toBe("#/settings");
    });

    it("監視解除後は hashchange を通知しない", () => {
      const iframe = new AppsScriptIframe();
      const observer = vi.fn();

      const unsubscribe = iframe.observe(observer);

      unsubscribe();

      window.location.hash = "#/users";
      window.dispatchEvent(new HashChangeEvent("hashchange"));

      expect(observer).not.toHaveBeenCalled();
    });

    it("監視解除後は popstate を通知しない", () => {
      const iframe = new AppsScriptIframe();
      const observer = vi.fn();

      const unsubscribe = iframe.observe(observer);

      unsubscribe();

      window.dispatchEvent(
        new PopStateEvent("popstate", {
          state: {},
        }),
      );

      expect(observer).not.toHaveBeenCalled();
    });
  });

  describe("sync", () => {
    it("異なる NavigationEntry を受け取った場合は iframe に同期する", () => {
      const iframe = new AppsScriptIframe();

      const entry = createEntry("#/users");

      iframe.sync(entry);

      expect(window.location.hash).toBe("#/users");
    });

    it("同期時に state を iframe history に反映する", () => {
      const iframe = new AppsScriptIframe();

      const entry = new NavigationEntry(
        {
          selectedUserId: "123",
        },
        new NavigationLocation(
          new HashProperty("#/users"),
          new URLSearchParams(),
        ),
      );

      iframe.sync(entry);

      expect(history.state).toEqual({
        selectedUserId: "123",
      });
    });

    it("同期時に query parameter を hash 内へ反映する", () => {
      const iframe = new AppsScriptIframe();

      const entry = new NavigationEntry(
        {},
        new NavigationLocation(
          new HashProperty("#/users"),
          new URLSearchParams("page=2&tag=react&tag=typescript"),
        ),
      );

      iframe.sync(entry);

      expect(window.location.hash).toBe(
        "#/users?page=2&tag=react&tag=typescript",
      );
    });

    it("同期時に同一キーの複数 query parameter の順序を保持する", () => {
      const iframe = new AppsScriptIframe();

      const entry = new NavigationEntry(
        {},
        new NavigationLocation(
          new HashProperty("#/users"),
          new URLSearchParams("tag=typescript&tag=react"),
        ),
      );

      iframe.sync(entry);

      expect(window.location.hash).toBe("#/users?tag=typescript&tag=react");
    });

    it("同期時に hash を正規化する", () => {
      const iframe = new AppsScriptIframe();

      iframe.sync(createEntry("/users"));

      expect(window.location.hash).toBe("#/users");
    });

    it("同期後に自身の現在状態を更新する", () => {
      const iframe = new AppsScriptIframe();
      const entry = createEntry("#/settings");

      iframe.sync(entry);

      expect(iframe.current()).toBe(entry);
    });

    it("同一の NavigationEntry を受け取った場合は history を更新しない", () => {
      history.replaceState({}, "", "#/users");

      const iframe = new AppsScriptIframe();

      const replaceState = vi.spyOn(history, "replaceState");

      iframe.sync(
        new NavigationEntry(
          {},
          new NavigationLocation(
            new HashProperty("/users"),
            new URLSearchParams(),
          ),
        ),
      );

      expect(replaceState).not.toHaveBeenCalled();
    });

    it("同じ状態を複数回同期しても history を重複して更新しない", () => {
      const iframe = new AppsScriptIframe();

      const replaceState = vi.spyOn(history, "replaceState");

      const entry = createEntry("#/users");

      iframe.sync(entry);
      iframe.sync(entry);

      expect(replaceState).toHaveBeenCalledOnce();
    });

    it("state が異なる場合は location が同じでも同期する", () => {
      history.replaceState(
        {
          page: 1,
        },
        "",
        "#/users",
      );

      const iframe = new AppsScriptIframe();

      const replaceState = vi.spyOn(history, "replaceState");

      iframe.sync(
        new NavigationEntry(
          {
            page: 2,
          },
          new NavigationLocation(
            new HashProperty("#/users"),
            new URLSearchParams(),
          ),
        ),
      );

      expect(replaceState).toHaveBeenCalledOnce();
      expect(history.state).toEqual({
        page: 2,
      });
    });

    it("query parameter が異なる場合は hash path が同じでも同期する", () => {
      history.replaceState({}, "", "#/users?page=1");

      const iframe = new AppsScriptIframe();

      const replaceState = vi.spyOn(history, "replaceState");

      iframe.sync(
        new NavigationEntry(
          {},
          new NavigationLocation(
            new HashProperty("#/users"),
            new URLSearchParams("page=2"),
          ),
        ),
      );

      expect(replaceState).toHaveBeenCalledOnce();
      expect(window.location.hash).toBe("#/users?page=2");
    });

    it("query parameter のキー順だけが異なる場合は同期しない", () => {
      history.replaceState({}, "", "#/users?page=1&sort=name");

      const iframe = new AppsScriptIframe();

      const replaceState = vi.spyOn(history, "replaceState");

      iframe.sync(
        new NavigationEntry(
          {},
          new NavigationLocation(
            new HashProperty("#/users"),
            new URLSearchParams("sort=name&page=1"),
          ),
        ),
      );

      expect(replaceState).not.toHaveBeenCalled();
    });

    it("同一キーの複数値の順序が異なる場合は同期する", () => {
      history.replaceState({}, "", "#/users?tag=react&tag=typescript");

      const iframe = new AppsScriptIframe();

      const replaceState = vi.spyOn(history, "replaceState");

      iframe.sync(
        new NavigationEntry(
          {},
          new NavigationLocation(
            new HashProperty("#/users"),
            new URLSearchParams("tag=typescript&tag=react"),
          ),
        ),
      );

      expect(replaceState).toHaveBeenCalledOnce();
    });
  });
});

function createEntry(hash = "#/") {
  return new NavigationEntry(
    {},
    new NavigationLocation(new HashProperty(hash), new URLSearchParams()),
  );
}

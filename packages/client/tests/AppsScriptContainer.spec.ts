import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  google,
  type GoogleScriptHistoryEvent,
  type GoogleScriptUrlLocation,
} from "../src/google";
import { AppsScriptContainer } from "../src/navigation/AppsScriptContainer";
import { HashProperty } from "../src/navigation/HashProperty";
import { NavigationEntry } from "../src/navigation/NavigationEntry";
import { NavigationLocation } from "../src/navigation/NavigationLocation";

describe("AppsScriptContainer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("load", () => {
    it("google.script.url.getLocation を使って現在のコンテナ状態を読み込める", () => {
      const getLocation = vi
        .spyOn(google.script.url, "getLocation")
        .mockImplementation((callback) => {
          callback({
            hash: "/users",
            parameter: {
              page: "1",
            },
            parameters: {
              page: ["1"],
            },
          });
        });

      const callback = vi.fn();

      AppsScriptContainer.load(callback);

      expect(getLocation).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledOnce();

      const container = callback.mock.calls[0][0];

      expect(container.current().location.hash.normalize()).toBe("#/users");
      expect(container.current().location.searchParams.get("page")).toBe("1");
      expect(container.current().state).toEqual({});
    });

    it("複数値の query parameter を欠損せず読み込める", () => {
      mockLocation({
        hash: "/users",
        parameter: {
          tag: "react",
        },
        parameters: {
          tag: ["react", "typescript"],
        },
      });

      AppsScriptContainer.load((container) => {
        expect(container.current().location.searchParams.getAll("tag")).toEqual(
          ["react", "typescript"],
        );
      });
    });
  });

  describe("observe", () => {
    it("google.script.history.setChangeHandler でコンテナの変更監視を開始する", () => {
      mockLocation();

      const setChangeHandler = vi
        .spyOn(google.script.history, "setChangeHandler")
        .mockImplementation(() => {});

      AppsScriptContainer.load((container) => {
        container.observe(vi.fn());

        expect(setChangeHandler).toHaveBeenCalledOnce();
      });
    });

    it("コンテナの history が変更された時に NavigationEntry を通知する", () => {
      mockLocation();

      let changeHandler:
        | ((event: GoogleScriptHistoryEvent) => void)
        | undefined;

      vi.spyOn(google.script.history, "setChangeHandler").mockImplementation(
        (handler) => {
          changeHandler = handler;
        },
      );

      const observer = vi.fn();

      AppsScriptContainer.load((container) => {
        container.observe(observer);

        changeHandler?.({
          state: {
            selectedUserId: "123",
          },
          location: {
            hash: "/users/123",
            parameter: {
              page: "2",
            },
            parameters: {
              page: ["2"],
            },
          },
        });

        expect(observer).toHaveBeenCalledOnce();

        const entry = observer.mock.calls[0][0];

        expect(entry.state).toEqual({
          selectedUserId: "123",
        });
        expect(entry.location.hash.normalize()).toBe("#/users/123");
        expect(entry.location.searchParams.get("page")).toBe("2");
      });
    });

    it("コンテナの history が変更された時に自身の現在状態も更新する", () => {
      mockLocation();

      let changeHandler:
        | ((event: GoogleScriptHistoryEvent) => void)
        | undefined;

      vi.spyOn(google.script.history, "setChangeHandler").mockImplementation(
        (handler) => {
          changeHandler = handler;
        },
      );

      AppsScriptContainer.load((container) => {
        container.observe(vi.fn());

        changeHandler?.({
          state: {
            selectedUserId: "456",
          },
          location: {
            hash: "/settings",
            parameter: {},
            parameters: {},
          },
        });

        expect(container.current().state).toEqual({
          selectedUserId: "456",
        });
        expect(container.current().location.hash.normalize()).toBe(
          "#/settings",
        );
      });
    });

    it("複数回変更された場合は最新の状態を保持する", () => {
      mockLocation();

      let changeHandler:
        | ((event: GoogleScriptHistoryEvent) => void)
        | undefined;

      vi.spyOn(google.script.history, "setChangeHandler").mockImplementation(
        (handler) => {
          changeHandler = handler;
        },
      );

      AppsScriptContainer.load((container) => {
        container.observe(vi.fn());

        changeHandler?.({
          state: {},
          location: {
            hash: "/users",
            parameter: {},
            parameters: {},
          },
        });

        changeHandler?.({
          state: {},
          location: {
            hash: "/settings",
            parameter: {},
            parameters: {},
          },
        });

        expect(container.current().location.hash.normalize()).toBe(
          "#/settings",
        );
      });
    });
  });

  describe("sync", () => {
    it("異なる NavigationEntry を受け取った場合は親コンテナの history に同期する", () => {
      mockLocation({
        hash: "/users",
        parameter: {},
        parameters: {},
      });

      const push = vi
        .spyOn(google.script.history, "push")
        .mockImplementation(() => {});

      AppsScriptContainer.load((container) => {
        container.sync(createEntry("#/settings"));

        expect(push).toHaveBeenCalledOnce();
      });
    });

    it("同期時に state を google.script.history.push に渡す", () => {
      mockLocation();

      const push = vi
        .spyOn(google.script.history, "push")
        .mockImplementation(() => {});

      AppsScriptContainer.load((container) => {
        container.sync(
          new NavigationEntry(
            {
              selectedUserId: "123",
              filters: {
                active: true,
              },
            },
            new NavigationLocation(
              new HashProperty("#/users"),
              new URLSearchParams(),
            ),
          ),
        );

        expect(push).toHaveBeenCalledWith(
          {
            selectedUserId: "123",
            filters: {
              active: true,
            },
          },
          expect.anything(),
          expect.anything(),
        );
      });
    });

    it("同期時に query parameter を google.script.history.push に渡す", () => {
      mockLocation();

      const push = vi
        .spyOn(google.script.history, "push")
        .mockImplementation(() => {});

      AppsScriptContainer.load((container) => {
        container.sync(
          new NavigationEntry(
            {},
            new NavigationLocation(
              new HashProperty("#/users"),
              new URLSearchParams("page=2&tag=react&tag=typescript"),
            ),
          ),
        );

        expect(push).toHaveBeenCalledWith({}, expect.anything(), "#/users");

        const params = push.mock.calls[0][1];

        expect(params).toEqual({
          page: ["2"],
          tag: ["react", "typescript"],
        });
      });
    });

    it("同期時に正規化した hash を google.script.history.push に渡す", () => {
      mockLocation();

      const push = vi
        .spyOn(google.script.history, "push")
        .mockImplementation(() => {});

      AppsScriptContainer.load((container) => {
        container.sync(createEntry("/users"));

        expect(push).toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          "#/users",
        );
      });
    });

    it("同期後に自身の現在状態を更新する", () => {
      mockLocation();

      vi.spyOn(google.script.history, "push").mockImplementation(() => {});

      AppsScriptContainer.load((container) => {
        const entry = createEntry("#/settings");

        container.sync(entry);

        expect(container.current()).toBe(entry);
      });
    });

    it("同一の NavigationEntry を受け取った場合は history を更新しない", () => {
      mockLocation({
        hash: "/users",
        parameter: {},
        parameters: {},
      });

      const push = vi
        .spyOn(google.script.history, "push")
        .mockImplementation(() => {});

      AppsScriptContainer.load((container) => {
        container.sync(
          new NavigationEntry(
            {},
            new NavigationLocation(
              new HashProperty("#/users"),
              new URLSearchParams(),
            ),
          ),
        );

        expect(push).not.toHaveBeenCalled();
      });
    });

    it("同じ状態を複数回同期しても history.push を重複して呼ばない", () => {
      mockLocation();

      const push = vi
        .spyOn(google.script.history, "push")
        .mockImplementation(() => {});

      AppsScriptContainer.load((container) => {
        const entry = createEntry("#/users");

        container.sync(entry);
        container.sync(entry);

        expect(push).toHaveBeenCalledOnce();
      });
    });

    it("state が異なる場合は location が同じでも同期する", () => {
      mockLocation({
        hash: "/users",
        parameter: {},
        parameters: {},
      });

      const push = vi
        .spyOn(google.script.history, "push")
        .mockImplementation(() => {});

      AppsScriptContainer.load((container) => {
        container.sync(
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

        expect(push).toHaveBeenCalledOnce();
      });
    });

    it("query parameter が異なる場合は hash が同じでも同期する", () => {
      mockLocation({
        hash: "/users",
        parameter: {
          page: "1",
        },
        parameters: {
          page: ["1"],
        },
      });

      const push = vi
        .spyOn(google.script.history, "push")
        .mockImplementation(() => {});

      AppsScriptContainer.load((container) => {
        container.sync(
          new NavigationEntry(
            {},
            new NavigationLocation(
              new HashProperty("#/users"),
              new URLSearchParams("page=2"),
            ),
          ),
        );

        expect(push).toHaveBeenCalledOnce();
      });
    });

    it("query parameter のキー順だけが異なる場合は同期しない", () => {
      mockLocation({
        hash: "/users",
        parameter: {
          page: "1",
          sort: "name",
        },
        parameters: {
          page: ["1"],
          sort: ["name"],
        },
      });

      const push = vi
        .spyOn(google.script.history, "push")
        .mockImplementation(() => {});

      AppsScriptContainer.load((container) => {
        container.sync(
          new NavigationEntry(
            {},
            new NavigationLocation(
              new HashProperty("#/users"),
              new URLSearchParams("sort=name&page=1"),
            ),
          ),
        );

        expect(push).not.toHaveBeenCalled();
      });
    });

    it("同一キーの複数値の順序が異なる場合は同期する", () => {
      mockLocation({
        hash: "/users",
        parameter: {
          tag: "react",
        },
        parameters: {
          tag: ["react", "typescript"],
        },
      });

      const push = vi
        .spyOn(google.script.history, "push")
        .mockImplementation(() => {});

      AppsScriptContainer.load((container) => {
        container.sync(
          new NavigationEntry(
            {},
            new NavigationLocation(
              new HashProperty("#/users"),
              new URLSearchParams("tag=typescript&tag=react"),
            ),
          ),
        );

        expect(push).toHaveBeenCalledOnce();
      });
    });
  });
});

function mockLocation(
  location: GoogleScriptUrlLocation = {
    hash: "",
    parameter: {},
    parameters: {},
  },
) {
  vi.spyOn(google.script.url, "getLocation").mockImplementation((callback) => {
    callback(location);
  });
}

function createEntry(hash = "#/") {
  return new NavigationEntry(
    {},
    new NavigationLocation(new HashProperty(hash), new URLSearchParams()),
  );
}

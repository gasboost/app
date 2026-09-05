import { describe, expect, it } from "vitest";

import type {
  GoogleScriptHistoryEvent,
  GoogleScriptUrlLocation,
} from "../src/google";
import { HashProperty } from "../src/navigation/HashProperty";
import { NavigationEntry } from "../src/navigation/NavigationEntry";
import { NavigationLocation } from "../src/navigation/NavigationLocation";

describe("NavigationEntry", () => {
  describe("fromGoogle", () => {
    it("GoogleScriptUrlLocation から NavigationEntry を生成できる", () => {
      const source: GoogleScriptUrlLocation = {
        hash: "/users",
        parameter: {
          page: "1",
        },
        parameters: {
          page: ["1"],
        },
      };

      const entry = NavigationEntry.fromGoogle(source);

      expect(entry.state).toEqual({});
      expect(entry.location.hash.normalize()).toBe("#/users");
      expect(entry.location.searchParams.get("page")).toBe("1");
    });

    it("GoogleScriptUrlLocation から生成した場合は state が空オブジェクトになる", () => {
      const source: GoogleScriptUrlLocation = {
        hash: "/users",
        parameter: {},
        parameters: {},
      };

      const entry = NavigationEntry.fromGoogle(source);

      expect(entry.state).toEqual({});
    });

    it("GoogleScriptHistoryEvent から NavigationEntry を生成できる", () => {
      const source: GoogleScriptHistoryEvent = {
        state: {
          selectedUserId: "123",
        },
        location: {
          hash: "/users",
          parameter: {
            page: "1",
          },
          parameters: {
            page: ["1"],
          },
        },
      };

      const entry = NavigationEntry.fromGoogle(source);

      expect(entry.state).toEqual({
        selectedUserId: "123",
      });
      expect(entry.location.hash.normalize()).toBe("#/users");
      expect(entry.location.searchParams.get("page")).toBe("1");
    });

    it("GoogleScriptHistoryEvent の state を保持する", () => {
      const source: GoogleScriptHistoryEvent = {
        state: {
          page: 2,
          filters: {
            active: true,
          },
        },
        location: {
          hash: "/users",
          parameter: {},
          parameters: {},
        },
      };

      const entry = NavigationEntry.fromGoogle(source);

      expect(entry.state).toEqual({
        page: 2,
        filters: {
          active: true,
        },
      });
    });

    it("hash を正規化可能な HashProperty として生成する", () => {
      const source: GoogleScriptUrlLocation = {
        hash: "users",
        parameter: {},
        parameters: {},
      };

      const entry = NavigationEntry.fromGoogle(source);

      expect(entry.location.hash.normalize()).toBe("#/users");
    });

    it("空の hash をルートとして扱える", () => {
      const source: GoogleScriptUrlLocation = {
        hash: "",
        parameter: {},
        parameters: {},
      };

      const entry = NavigationEntry.fromGoogle(source);

      expect(entry.location.hash.normalize()).toBe("#/");
    });

    it("単一値の query parameter を searchParams に変換できる", () => {
      const source: GoogleScriptUrlLocation = {
        hash: "/users",
        parameter: {
          page: "2",
          sort: "name",
        },
        parameters: {
          page: ["2"],
          sort: ["name"],
        },
      };

      const entry = NavigationEntry.fromGoogle(source);

      expect(entry.location.searchParams.get("page")).toBe("2");
      expect(entry.location.searchParams.get("sort")).toBe("name");
    });

    it("同一キーの複数 query parameter を欠損せず searchParams に変換できる", () => {
      const source: GoogleScriptUrlLocation = {
        hash: "/users",
        parameter: {
          tag: "react",
        },
        parameters: {
          tag: ["react", "typescript"],
        },
      };

      const entry = NavigationEntry.fromGoogle(source);

      expect(entry.location.searchParams.getAll("tag")).toEqual([
        "react",
        "typescript",
      ]);
    });

    it("query parameter が存在しない場合は空の searchParams を生成する", () => {
      const source: GoogleScriptUrlLocation = {
        hash: "/users",
        parameter: {},
        parameters: {},
      };

      const entry = NavigationEntry.fromGoogle(source);

      expect(entry.location.searchParams.toString()).toBe("");
    });

    it("同一キーの複数 query parameter の値順を保持する", () => {
      const source: GoogleScriptUrlLocation = {
        hash: "/users",
        parameter: {
          tag: "typescript",
        },
        parameters: {
          tag: ["typescript", "react", "javascript"],
        },
      };

      const entry = NavigationEntry.fromGoogle(source);

      expect(entry.location.searchParams.getAll("tag")).toEqual([
        "typescript",
        "react",
        "javascript",
      ]);
    });

    it("空文字の query parameter を保持する", () => {
      const source: GoogleScriptUrlLocation = {
        hash: "/users",
        parameter: {
          keyword: "",
        },
        parameters: {
          keyword: [""],
        },
      };

      const entry = NavigationEntry.fromGoogle(source);

      expect(entry.location.searchParams.has("keyword")).toBe(true);
      expect(entry.location.searchParams.get("keyword")).toBe("");
    });
  });

  describe("equals", () => {
    it("state と location が同じ場合は同一と判定できる", () => {
      const left = new NavigationEntry(
        {
          selectedUserId: "123",
        },
        new NavigationLocation(
          new HashProperty("#/users"),
          new URLSearchParams("page=1"),
        ),
      );

      const right = new NavigationEntry(
        {
          selectedUserId: "123",
        },
        new NavigationLocation(
          new HashProperty("#/users"),
          new URLSearchParams("page=1"),
        ),
      );

      expect(left.equals(right)).toBe(true);
    });

    it("state が異なる場合は異なる entry と判定する", () => {
      const left = new NavigationEntry(
        {
          selectedUserId: "123",
        },
        new NavigationLocation(
          new HashProperty("#/users"),
          new URLSearchParams(),
        ),
      );

      const right = new NavigationEntry(
        {
          selectedUserId: "456",
        },
        new NavigationLocation(
          new HashProperty("#/users"),
          new URLSearchParams(),
        ),
      );

      expect(left.equals(right)).toBe(false);
    });

    it("location が異なる場合は異なる entry と判定する", () => {
      const left = new NavigationEntry(
        {},
        new NavigationLocation(
          new HashProperty("#/users"),
          new URLSearchParams(),
        ),
      );

      const right = new NavigationEntry(
        {},
        new NavigationLocation(
          new HashProperty("#/settings"),
          new URLSearchParams(),
        ),
      );

      expect(left.equals(right)).toBe(false);
    });

    it("searchParams が異なる場合は異なる entry と判定する", () => {
      const left = new NavigationEntry(
        {},
        new NavigationLocation(
          new HashProperty("#/users"),
          new URLSearchParams("page=1"),
        ),
      );

      const right = new NavigationEntry(
        {},
        new NavigationLocation(
          new HashProperty("#/users"),
          new URLSearchParams("page=2"),
        ),
      );

      expect(left.equals(right)).toBe(false);
    });

    it("hash の表現が異なっても正規化後の location が同じ場合は同一と判定できる", () => {
      const left = new NavigationEntry(
        {},
        new NavigationLocation(
          new HashProperty("#/users"),
          new URLSearchParams(),
        ),
      );

      const right = new NavigationEntry(
        {},
        new NavigationLocation(
          new HashProperty("/users"),
          new URLSearchParams(),
        ),
      );

      expect(left.equals(right)).toBe(true);
    });

    it("search parameter のキー順が異なっても同一と判定できる", () => {
      const left = new NavigationEntry(
        {},
        new NavigationLocation(
          new HashProperty("#/users"),
          new URLSearchParams("page=1&sort=name"),
        ),
      );

      const right = new NavigationEntry(
        {},
        new NavigationLocation(
          new HashProperty("#/users"),
          new URLSearchParams("sort=name&page=1"),
        ),
      );

      expect(left.equals(right)).toBe(true);
    });

    it("同一キーの複数値の順序が異なる場合は異なる entry と判定する", () => {
      const left = new NavigationEntry(
        {},
        new NavigationLocation(
          new HashProperty("#/users"),
          new URLSearchParams("tag=react&tag=typescript"),
        ),
      );

      const right = new NavigationEntry(
        {},
        new NavigationLocation(
          new HashProperty("#/users"),
          new URLSearchParams("tag=typescript&tag=react"),
        ),
      );

      expect(left.equals(right)).toBe(false);
    });

    it("空の state 同士は同一と判定できる", () => {
      const left = new NavigationEntry(
        {},
        new NavigationLocation(
          new HashProperty("#/users"),
          new URLSearchParams(),
        ),
      );

      const right = new NavigationEntry(
        {},
        new NavigationLocation(
          new HashProperty("#/users"),
          new URLSearchParams(),
        ),
      );

      expect(left.equals(right)).toBe(true);
    });

    it("state のプロパティ数が異なる場合は異なる entry と判定する", () => {
      const left = new NavigationEntry(
        {
          page: 1,
        },
        new NavigationLocation(
          new HashProperty("#/users"),
          new URLSearchParams(),
        ),
      );

      const right = new NavigationEntry(
        {
          page: 1,
          selected: true,
        },
        new NavigationLocation(
          new HashProperty("#/users"),
          new URLSearchParams(),
        ),
      );

      expect(left.equals(right)).toBe(false);
    });

    it("ネストした state が同じ場合は同一と判定できる", () => {
      const left = new NavigationEntry(
        {
          filters: {
            category: "user",
            active: true,
          },
        },
        new NavigationLocation(
          new HashProperty("#/users"),
          new URLSearchParams(),
        ),
      );

      const right = new NavigationEntry(
        {
          filters: {
            category: "user",
            active: true,
          },
        },
        new NavigationLocation(
          new HashProperty("#/users"),
          new URLSearchParams(),
        ),
      );

      expect(left.equals(right)).toBe(true);
    });

    it("ネストした state の値が異なる場合は異なる entry と判定する", () => {
      const left = new NavigationEntry(
        {
          filters: {
            active: true,
          },
        },
        new NavigationLocation(
          new HashProperty("#/users"),
          new URLSearchParams(),
        ),
      );

      const right = new NavigationEntry(
        {
          filters: {
            active: false,
          },
        },
        new NavigationLocation(
          new HashProperty("#/users"),
          new URLSearchParams(),
        ),
      );

      expect(left.equals(right)).toBe(false);
    });

    it("state のオブジェクトのキー順が異なっても同一と判定できる", () => {
      const left = new NavigationEntry(
        {
          page: 1,
          selected: true,
        },
        new NavigationLocation(
          new HashProperty("#/users"),
          new URLSearchParams(),
        ),
      );

      const right = new NavigationEntry(
        {
          selected: true,
          page: 1,
        },
        new NavigationLocation(
          new HashProperty("#/users"),
          new URLSearchParams(),
        ),
      );

      expect(left.equals(right)).toBe(true);
    });

    it("state の配列は値の順序を区別する", () => {
      const left = new NavigationEntry(
        {
          ids: ["1", "2"],
        },
        new NavigationLocation(
          new HashProperty("#/users"),
          new URLSearchParams(),
        ),
      );

      const right = new NavigationEntry(
        {
          ids: ["2", "1"],
        },
        new NavigationLocation(
          new HashProperty("#/users"),
          new URLSearchParams(),
        ),
      );

      expect(left.equals(right)).toBe(false);
    });
  });
});

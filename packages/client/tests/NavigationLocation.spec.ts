import { describe, expect, it } from "vitest";
import { HashProperty } from "../src/navigation/HashProperty";
import { NavigationLocation } from "../src/navigation/NavigationLocation";

describe("NavigationLocation", () => {
  describe("equals", () => {
    it("hash と searchParams が同じ場合は同一と判定できる", () => {
      const left = new NavigationLocation(
        new HashProperty("#/users"),
        new URLSearchParams("page=1&sort=name"),
      );

      const right = new NavigationLocation(
        new HashProperty("#/users"),
        new URLSearchParams("page=1&sort=name"),
      );

      expect(left.equals(right)).toBe(true);
    });

    it("表現が異なっても正規化後の hash が同じ場合は同一と判定できる", () => {
      const left = new NavigationLocation(
        new HashProperty("#/users"),
        new URLSearchParams(),
      );

      const right = new NavigationLocation(
        new HashProperty("/users"),
        new URLSearchParams(),
      );

      expect(left.equals(right)).toBe(true);
    });

    it("hash が異なる場合は異なる location と判定する", () => {
      const left = new NavigationLocation(
        new HashProperty("#/users"),
        new URLSearchParams(),
      );

      const right = new NavigationLocation(
        new HashProperty("#/settings"),
        new URLSearchParams(),
      );

      expect(left.equals(right)).toBe(false);
    });

    it("searchParams の値が異なる場合は異なる location と判定する", () => {
      const left = new NavigationLocation(
        new HashProperty("#/users"),
        new URLSearchParams("page=1"),
      );

      const right = new NavigationLocation(
        new HashProperty("#/users"),
        new URLSearchParams("page=2"),
      );

      expect(left.equals(right)).toBe(false);
    });

    it("searchParams のキー順が異なっても同一と判定できる", () => {
      const left = new NavigationLocation(
        new HashProperty("#/users"),
        new URLSearchParams("page=1&sort=name"),
      );

      const right = new NavigationLocation(
        new HashProperty("#/users"),
        new URLSearchParams("sort=name&page=1"),
      );

      expect(left.equals(right)).toBe(true);
    });

    it("同一キーに複数値がある場合は値の順序を区別する", () => {
      const left = new NavigationLocation(
        new HashProperty("#/users"),
        new URLSearchParams("tag=react&tag=typescript"),
      );

      const right = new NavigationLocation(
        new HashProperty("#/users"),
        new URLSearchParams("tag=typescript&tag=react"),
      );

      expect(left.equals(right)).toBe(false);
    });

    it("同一キーに複数値があり値の順序も同じ場合は同一と判定できる", () => {
      const left = new NavigationLocation(
        new HashProperty("#/users"),
        new URLSearchParams("tag=react&tag=typescript"),
      );

      const right = new NavigationLocation(
        new HashProperty("#/users"),
        new URLSearchParams("tag=react&tag=typescript"),
      );

      expect(left.equals(right)).toBe(true);
    });

    it("片方にのみ search parameter が存在する場合は異なる location と判定する", () => {
      const left = new NavigationLocation(
        new HashProperty("#/users"),
        new URLSearchParams("page=1"),
      );

      const right = new NavigationLocation(
        new HashProperty("#/users"),
        new URLSearchParams(),
      );

      expect(left.equals(right)).toBe(false);
    });

    it("search parameter のキー数が異なる場合は異なる location と判定する", () => {
      const left = new NavigationLocation(
        new HashProperty("#/users"),
        new URLSearchParams("page=1"),
      );

      const right = new NavigationLocation(
        new HashProperty("#/users"),
        new URLSearchParams("page=1&sort=name"),
      );

      expect(left.equals(right)).toBe(false);
    });

    it("空の searchParams 同士は同一と判定できる", () => {
      const left = new NavigationLocation(
        new HashProperty("#/users"),
        new URLSearchParams(),
      );

      const right = new NavigationLocation(
        new HashProperty("#/users"),
        new URLSearchParams(),
      );

      expect(left.equals(right)).toBe(true);
    });

    it("空文字の値を持つ parameter と parameter が存在しない状態を区別する", () => {
      const left = new NavigationLocation(
        new HashProperty("#/users"),
        new URLSearchParams("tag="),
      );

      const right = new NavigationLocation(
        new HashProperty("#/users"),
        new URLSearchParams(),
      );

      expect(left.equals(right)).toBe(false);
    });

    it("同じ空文字の値を持つ parameter は同一と判定できる", () => {
      const left = new NavigationLocation(
        new HashProperty("#/users"),
        new URLSearchParams("tag="),
      );

      const right = new NavigationLocation(
        new HashProperty("#/users"),
        new URLSearchParams("tag="),
      );

      expect(left.equals(right)).toBe(true);
    });

    it("hash と searchParams の両方が異なる場合は異なる location と判定する", () => {
      const left = new NavigationLocation(
        new HashProperty("#/users"),
        new URLSearchParams("page=1"),
      );

      const right = new NavigationLocation(
        new HashProperty("#/settings"),
        new URLSearchParams("page=2"),
      );

      expect(left.equals(right)).toBe(false);
    });
  });
});

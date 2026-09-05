import { describe, expect, it } from "vitest";
import { HashProperty } from "../src/navigation/HashProperty";

describe("HashProperty", () => {
  it.each([
    ["", "#/"],
    ["#/users", "#/users"],
    ["#users", "#/users"],
    ["/users", "#/users"],
    ["users", "#/users"],
    ["/users?page=2", "#/users?page=2"],
  ])("%s を %s に正規化できる", (input, expected) => {
    expect(new HashProperty(input).normalize()).toBe(expected);
  });

  it.each([
    ["#/users", "/users"],
    ["#/users", "users"],
    ["#/users?page=2", "/users?page=2"],
  ])("同じ意味の hash を同一と判定できる", (left, right) => {
    expect(new HashProperty(left).equals(new HashProperty(right))).toBe(true);
  });

  it("異なる hash を異なる値と判定できる", () => {
    expect(
      new HashProperty("#/users").equals(new HashProperty("#/settings")),
    ).toBe(false);
  });
});

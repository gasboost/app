import { describe, expect, it } from "vitest";
import { AppsScriptState } from "../src/AppsScriptState";

describe("AppsScriptState", () => {
  it("設定したstateを取得できる", () => {
    const state = new AppsScriptState<{
      user: string;
    }>();

    state.set("user", "alice");

    expect(state.get("user")).toBe("alice");
  });

  it("複数のstateを保持できる", () => {
    const state = new AppsScriptState<{
      user: string;
      authenticated: boolean;
    }>();

    state.set("user", "alice");
    state.set("authenticated", true);

    expect(state.get("user")).toBe("alice");
    expect(state.get("authenticated")).toBe(true);
  });

  it("同じkeyに再設定すると値を上書きする", () => {
    const state = new AppsScriptState<{
      user: string;
    }>();

    state.set("user", "alice");
    state.set("user", "bob");

    expect(state.get("user")).toBe("bob");
  });

  it("未設定のstateはundefinedを返す", () => {
    const state = new AppsScriptState<{
      user: string;
    }>();

    expect(state.get("user")).toBeUndefined();
  });
});

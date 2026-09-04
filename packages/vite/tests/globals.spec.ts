import { describe, expect, test } from "vitest";
import { createGlobalCode } from "../src/globals";

describe("createGlobalCode", () => {
  test("doGetを生成できる", () => {
    const code = createGlobalCode({
      hasGet: true,
      hasPost: false,
      calls: [],
    });

    expect(code).toContain("function doGet");

    expect(code).toContain("app.callGet(event)");
  });

  test("doPostを生成できる", () => {
    const code = createGlobalCode({
      hasGet: false,
      hasPost: true,
      calls: [],
    });

    expect(code).toContain("function doPost");

    expect(code).toContain("app.callPost(event)");
  });

  test("RPC global functionを生成できる", () => {
    const code = createGlobalCode({
      hasGet: false,
      hasPost: false,
      calls: ["getUser"],
    });

    expect(code).toContain("function getUser");
    expect(code).toMatch(/app\.dispatch\(\s*["']getUser["']/);
  });

  test("複数のRPC global functionを生成できる", () => {
    const code = createGlobalCode({
      hasGet: false,
      hasPost: false,
      calls: ["getUser", "saveUser"],
    });

    expect(code).toContain("function getUser");
    expect(code).toContain("function saveUser");
  });

  test("get未登録ならdoGetを生成しない", () => {
    const code = createGlobalCode({
      hasGet: false,
      hasPost: true,
      calls: [],
    });

    expect(code).not.toContain("function doGet");
  });

  test("post未登録ならdoPostを生成しない", () => {
    const code = createGlobalCode({
      hasGet: true,
      hasPost: false,
      calls: [],
    });

    expect(code).not.toContain("function doPost");
  });

  test("RPC未登録ならRPC functionを生成しない", () => {
    const code = createGlobalCode({
      hasGet: false,
      hasPost: false,
      calls: [],
    });

    expect(code).not.toContain("dispatch(");
  });

  test("RPC引数をdispatchへそのまま渡す", () => {
    const code = createGlobalCode({
      hasGet: false,
      hasPost: false,
      calls: ["sum"],
    });

    expect(code).toContain("...args");

    expect(code).toMatch(/dispatch\(\s*["']sum["']\s*,\s*\.\.\.args\s*\)/);
  });

  test("生成コードがJavaScriptとして構文的に正しい", () => {
    const code = createGlobalCode({
      hasGet: true,
      hasPost: true,
      calls: ["getUser", "saveUser"],
    });

    expect(() => {
      new Function(code);
    }).not.toThrow();
  });

  test("JavaScript識別子として不正なRPC名はエラー", () => {
    expect(() =>
      createGlobalCode({
        hasGet: false,
        hasPost: false,
        calls: ["foo-bar"],
      }),
    ).toThrow();

    expect(() =>
      createGlobalCode({
        hasGet: false,
        hasPost: false,
        calls: ["123foo"],
      }),
    ).toThrow();
  });

  test("doGetというRPC名は予約名衝突としてエラー", () => {
    expect(() =>
      createGlobalCode({
        hasGet: true,
        hasPost: false,
        calls: ["doGet"],
      }),
    ).toThrow();
  });

  test("doPostというRPC名は予約名衝突としてエラー", () => {
    expect(() =>
      createGlobalCode({
        hasGet: false,
        hasPost: true,
        calls: ["doPost"],
      }),
    ).toThrow();
  });
});

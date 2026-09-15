import { expect, expectTypeOf, test } from "vitest";
import { AppsScript, InferAppsScript } from "../src/AppsScript";
import { AppsScriptResponse } from "../src/AppsScriptResponse";

test("InferAppsScriptでRPC契約を推論できる", () => {
  const app = new AppsScript()
    .call("getUser", async (input: { id: string }) => ({
      id: input.id,
      name: "Taro",
    }))
    .call("saveUser", async (input: { name: string; age: number }) => ({
      name: input.name,
      age: input.age,
    }));

  type Rpc = InferAppsScript<typeof app>;

  expectTypeOf<Rpc["getUser"]["input"]>().toEqualTypeOf<{
    id: string;
  }>();

  expectTypeOf<Rpc["getUser"]["result"]>().toEqualTypeOf<{
    id: string;
    name: string;
  }>();

  expectTypeOf<Rpc["saveUser"]["input"]>().toEqualTypeOf<{
    name: string;
    age: number;
  }>();
});

test("callでRPC handlerを登録してdispatchできる", async () => {
  const app = new AppsScript().call(
    "sum",
    async (input: { a: number; b: number }) => input.a + input.b,
  );

  const response = await app.dispatch("sum", {
    a: 1,
    b: 2,
  });

  expect(response).toBeInstanceOf(AppsScriptResponse);
  expect(response.contents).toBe("3");
});

test("GET eventをAppsScriptHttpRequestとしてhandlerへ渡す", () => {
  const event = {
    parameter: {
      id: "123",
      tag: "a",
    },
    parameters: {
      id: ["123"],
      tag: ["a", "b"],
    },
  } as unknown as GoogleAppsScript.Events.AppsScriptHttpRequestEvent;

  const output = {} as GoogleAppsScript.Content.TextOutput;

  const app = new AppsScript().get((request) => {
    expect(request.query("id")).toBe("123");
    expect(request.query()).toEqual({
      id: "123",
      tag: "a",
    });

    expect(request.queries("tag")).toEqual(["a", "b"]);
    expect(request.queries()).toEqual({
      id: ["123"],
      tag: ["a", "b"],
    });

    return output;
  });

  expect(app.callGet(event)).toBe(output);
});

test("POST eventのtextとjsonを取得できる", () => {
  const event = {
    parameter: {},
    parameters: {},
    postData: {
      contents: JSON.stringify({
        name: "Taro",
        age: 20,
      }),
    },
  } as GoogleAppsScript.Events.DoPost;

  const output = {} as GoogleAppsScript.Content.TextOutput;

  const app = new AppsScript().post((request) => {
    expect(request.text()).toBe('{"name":"Taro","age":20}');

    expect(request.json()).toEqual({
      name: "Taro",
      age: 20,
    });

    return output;
  });

  expect(app.callPost(event)).toBe(output);
});

test("InferAppsScriptでDateがstringに変換される", () => {
  const app = new AppsScript().call("getUser", (_input: {}) => ({
    id: "1",
    createdAt: new Date(),
  }));

  type App = InferAppsScript<typeof app>;

  expectTypeOf<App["getUser"]["result"]>().toEqualTypeOf<{
    id: string;
    createdAt: string;
  }>();
});

test("InferAppsScriptでネストしたDateもstringに変換される", () => {
  const app = new AppsScript().call("getUsers", (_input: {}) => ({
    users: [
      {
        createdAt: new Date(),
      },
    ],
  }));

  type App = InferAppsScript<typeof app>;

  expectTypeOf<App["getUsers"]["result"]>().toEqualTypeOf<{
    users: {
      createdAt: string;
    }[];
  }>();
});

test("callsで複数のRPC handlerを登録してdispatchできる", async () => {
  const app = new AppsScript().calls({
    add: (input: { a: number; b: number }) => input.a + input.b,
    greet: (input: { name: string }) => `Hello, ${input.name}`,
  });

  const addResponse = await app.dispatch("add", {
    a: 1,
    b: 2,
  });

  const greetResponse = await app.dispatch("greet", {
    name: "Taro",
  });

  expect(addResponse.contents).toBe("3");
  expect(greetResponse.contents).toBe('"Hello, Taro"');
});

test("callとcallsを混在してRPC handlerを登録できる", async () => {
  const app = new AppsScript()
    .call("first", (_input: {}) => "first")
    .calls({
      second: (_input: {}) => "second",
      third: (_input: {}) => "third",
    });

  expect((await app.dispatch("first", {})).contents).toBe('"first"');
  expect((await app.dispatch("second", {})).contents).toBe('"second"');
  expect((await app.dispatch("third", {})).contents).toBe('"third"');
});

test("callsでも既存callと同じ重複登録エラーになる", () => {
  expect(() =>
    new AppsScript()
      .call("duplicate", (_input: {}) => 1)
      .calls({
        duplicate: (_input: {}) => 2,
      }),
  ).toThrow("Function duplicate is already registered.");
});

test("describeで登録状態を取得できる", () => {
  const app = new AppsScript()
    .get(() => ({}) as GoogleAppsScript.HTML.HtmlOutput)
    .call("getUser", (_input: {}) => ({ id: "1" }))
    .call("saveUser", (_input: {}) => undefined);

  expect(app.describe()).toEqual({
    hasGet: true,
    hasPost: false,
    calls: ["getUser", "saveUser"],
  });
});

test("describeでcallsによる登録も取得できる", () => {
  const app = new AppsScript().calls({
    signIn: (_input: {}) => undefined,
    signOut: (_input: {}) => undefined,
  });

  expect(app.describe()).toEqual({
    hasGet: false,
    hasPost: false,
    calls: ["signIn", "signOut"],
  });
});

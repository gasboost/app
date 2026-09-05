import { expect, expectTypeOf, test } from "vitest";
import { AppsScript, InferAppsScript } from "../src/AppsScript";
import { AppsScriptResponse } from "../src/AppsScriptResponse";

test("InferAppsScriptでRPC契約を推論できる", () => {
  const app = new AppsScript()
    .call("getUser", async (id: string) => ({
      id,
      name: "Taro",
    }))
    .call("saveUser", async (name: string, age: number) => ({
      name,
      age,
    }));

  type Rpc = InferAppsScript<typeof app>;

  expectTypeOf<Rpc["getUser"]["args"]>().toEqualTypeOf<[id: string]>();

  expectTypeOf<Rpc["getUser"]["result"]>().toEqualTypeOf<{
    id: string;
    name: string;
  }>();

  expectTypeOf<Rpc["saveUser"]["args"]>().toEqualTypeOf<
    [name: string, age: number]
  >();
});

test("callでRPC handlerを登録してdispatchできる", async () => {
  const app = new AppsScript().call(
    "sum",
    async (a: number, b: number) => a + b,
  );

  const response = await app.dispatch("sum", 1, 2);

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
  const app = new AppsScript().call("getUser", () => ({
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
  const app = new AppsScript().call("getUsers", () => ({
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

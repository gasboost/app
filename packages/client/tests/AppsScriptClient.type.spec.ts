import { describe, expectTypeOf, it } from "vitest";
import { appsScriptClient } from "../src/AppsScriptClient";

type App = {
  sum: {
    args: [a: number, b: number];
    result: number;
  };

  findUser: {
    args: [id: string];
    result: {
      id: string;
      name: string;
    };
  };
};

describe("AppsScriptClient types", () => {
  it("RPCの引数と戻り値を保持する", () => {
    const { client } = appsScriptClient<App>();

    expectTypeOf(client.sum).parameter(0).toEqualTypeOf<number>();
    expectTypeOf(client.sum).parameter(1).toEqualTypeOf<number>();
    expectTypeOf(client.sum).returns.toEqualTypeOf<Promise<number>>();
    expectTypeOf(client.findUser).returns.toEqualTypeOf<
      Promise<{
        id: string;
        name: string;
      }>
    >();
  });

  it("RPCの戻り値型を保持する", () => {
    const { client } = appsScriptClient<App>();

    expectTypeOf(client.sum).returns.toEqualTypeOf<Promise<number>>();

    expectTypeOf(client.findUser).returns.toEqualTypeOf<
      Promise<{
        id: string;
        name: string;
      }>
    >();
  });

  it("存在しないRPCを公開しない", () => {
    const { client } = appsScriptClient<App>();

    expectTypeOf(client).not.toHaveProperty("unknown");
  });
});

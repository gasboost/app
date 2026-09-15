import { describe, expectTypeOf, it } from "vitest";
import { appsScriptClient } from "../src/AppsScriptClient";

type App = {
  sum: {
    input: {
      a: number;
      b: number;
    };
    result: number;
  };

  findUser: {
    input: {
      id: string;
    };
    result: {
      id: string;
      name: string;
    };
  };

  getDate: {
    input: undefined;
    result: {
      createdAt: string;
    };
  };
};

describe("AppsScriptClient types", () => {
  it("inputありRPCのinputと戻り値を保持する", () => {
    const { client } = appsScriptClient<App>();

    expectTypeOf(client.sum).parameters.toEqualTypeOf<
      [
        input: {
          a: number;
          b: number;
        },
      ]
    >();

    expectTypeOf(client.sum).returns.toEqualTypeOf<Promise<number>>();

    expectTypeOf(client.findUser).parameters.toEqualTypeOf<
      [
        input: {
          id: string;
        },
      ]
    >();

    expectTypeOf(client.findUser).returns.toEqualTypeOf<
      Promise<{
        id: string;
        name: string;
      }>
    >();
  });

  it("inputがundefinedなら0引数RPCになる", () => {
    const { client } = appsScriptClient<App>();

    expectTypeOf(client.getDate).returns.toEqualTypeOf<
      Promise<{
        createdAt: string;
      }>
    >();
  });

  it("存在しないRPCを公開しない", () => {
    const { client } = appsScriptClient<App>();

    expectTypeOf(client).not.toHaveProperty("unknown");
  });
});

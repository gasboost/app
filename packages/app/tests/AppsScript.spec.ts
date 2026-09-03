import { expect, expectTypeOf, test } from "vitest";
import { AppsScript, InferAppsScript } from "../src/AppsScript";

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

  await expect(app.dispatch("sum", 1, 2)).resolves.toBe(3);
});

import { AppsScript } from "../../../../app/src/AppsScript";

const app = new AppsScript()
  .get(() => {
    return {
      marker: "GET_RESULT",
    } as never;
  })
  .post(() => {
    return {
      marker: "POST_RESULT",
    } as never;
  })
  .call("getUser", async (input: { id: string }) => {
    return {
      id: input.id,
      name: "Taro",
    };
  })
  .call("sum", (input: { a: number; b: number }) => input.a + input.b);

export default app;

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
  .call("getUser", async (id: string) => {
    return {
      id,
      name: "Taro",
    };
  })
  .call("sum", (a: number, b: number) => a + b);

export default app;

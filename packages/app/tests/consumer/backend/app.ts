import { AppsScript, type InferAppsScript } from "../../../dist/index";

export const app = new AppsScript()
  .call("getUser", async (id: string) => ({
    id,
    name: "Taro",
  }))
  .call("digest", async (value: string) => value.length);

export type AppType = InferAppsScript<typeof app>;

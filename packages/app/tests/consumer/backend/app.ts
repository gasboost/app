import { AppsScript, type InferAppsScript } from "../../../dist/index";

export const app = new AppsScript()
  .call("getUser", async ({ id }: { id: string }) => ({
    id,
    name: "Taro",
  }))
  .call("digest", async ({ value }: { value: string }) => value.length);

export type AppType = InferAppsScript<typeof app>;

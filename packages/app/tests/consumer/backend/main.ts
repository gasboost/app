import { AppsScript, type InferAppsScript } from "../../../src/AppsScript";

const app = new AppsScript()
  .call("getUser", async (id: string) => {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const BACKEND_ONLY_MARKER = "__GASBOOST_BACKEND_ONLY__";
    console.log(BACKEND_ONLY_MARKER);
    return {
      id,
      name: spreadsheet.getName(),
    };
  })
  .call("digest", async (value: string) => {
    const result = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      value,
    );

    return result.length;
  });

export type AppType = InferAppsScript<typeof app>;

export default app;

import { AppsScript, type AppsScriptMiddleware } from "../../../dist/index";

const systemStatus: AppsScriptMiddleware<{}, { initialized: boolean }> = (context, next) => {
  context.state.set("initialized", true);
  return next();
};

export const app = new AppsScript()
  .get((request, context) => {
    const path: string | undefined = request.path();
    const token: string | undefined = request.query("token");
    void path;
    void token;
    const initialized: boolean = context.state.get("initialized");
    return HtmlService.createHtmlOutput(String(initialized));
  }, [systemStatus])
  .post((_request, context) => {
    const initialized: boolean = context.state.get("initialized");
    return ContentService.createTextOutput(String(initialized));
  }, [systemStatus]);

import { AppsScriptAuth, type AppsScriptAuthRepository } from "@gasboost/auth";
import { AppsScript, type InferAppsScript } from "@gasboost/app";
import { AppsScriptBootstrap, type BootstrapPublicState } from "../dist";

declare const auth: AppsScriptAuth;
declare const authRepository: AppsScriptAuthRepository;
const bootstrap = new AppsScriptBootstrap({
  auth,
  authRepository,
  db: { migrate() {} },
  authorization: { role: { async assign(_id: string, _role: string) {} } },
});
const app = new AppsScript()
  .get((request) => {
    const state: BootstrapPublicState = bootstrap.handle(request);
    return HtmlService.createHtmlOutput(JSON.stringify(state));
  })
  .calls(bootstrap.handlers());
type API = InferAppsScript<typeof app>;
const input: API["initializeApp"]["input"] = { token: "from-email" };
void input;

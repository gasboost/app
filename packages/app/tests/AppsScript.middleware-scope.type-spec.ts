import { AppsScript, type AppsScriptMiddleware } from "../src";

type SessionState = {
  session: {
    userId: string;
  };
};

const authentication: AppsScriptMiddleware<
  Record<never, never>,
  SessionState
> = (context, next) => {
  context.state.set("session", {
    userId: "user-1",
  });

  return next();
};

const app = new AppsScript()
  .call("public", (_input: Record<never, never>, context) => {
    // @ts-expect-error authentication適用前なのでsessionは存在しない
    context.state.get("session");

    return "public";
  })
  .use(authentication)
  .call("private", (_input: Record<never, never>, context) => {
    const session: {
      userId: string;
    } = context.state.get("session");

    return session.userId;
  });

void app;

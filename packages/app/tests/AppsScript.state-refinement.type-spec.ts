import {
  AppsScript,
  type AppsScriptContext,
  type AppsScriptMiddleware,
  type InferAppsScript,
} from "../src";

type SessionState = {
  session: {
    userId: string;
  };
};

type TenantState = {
  tenant: {
    id: string;
  };
};

const sessionMiddleware: AppsScriptMiddleware<{}, SessionState> = (
  context,
  next,
) => {
  context.state.set("session", {
    userId: "user-1",
  });

  const session:
    | {
        userId: string;
      }
    | undefined = context.state.get("session");

  void session;

  return next();
};

const tenantMiddleware: AppsScriptMiddleware<
  SessionState,
  SessionState & TenantState
> = (context, next) => {
  const session: {
    userId: string;
  } = context.state.get("session");

  context.state.set("tenant", {
    id: session.userId,
  });

  return next();
};

const app = new AppsScript()
  .use(sessionMiddleware)
  .call("sessionTest", (input: { id: string }, context) => {
    const session: {
      userId: string;
    } = context.state.get("session");

    return {
      id: input.id,
      userId: session.userId,
    };
  });

type App = InferAppsScript<typeof app>;

const input: App["sessionTest"]["input"] = {
  id: "1",
};

const result: App["sessionTest"]["result"] = {
  id: "1",
  userId: "user-1",
};

void input;
void result;

const composedApp = new AppsScript()
  .use(sessionMiddleware)
  .use(tenantMiddleware)
  .call("composedTest", (_input: {}, context) => {
    const session: {
      userId: string;
    } = context.state.get("session");

    const tenant: {
      id: string;
    } = context.state.get("tenant");

    return {
      session,
      tenant,
    };
  });

void composedApp;

const optionalStateApp = new AppsScript<{
  optionalValue: string;
}>().call("optionalTest", (_input: {}, context) => {
  const optionalValue: string | undefined = context.state.get("optionalValue");

  void optionalValue;

  // @ts-expect-error 未保証stateはundefinedを含む
  const guaranteedOptionalValue: string = context.state.get("optionalValue");

  void guaranteedOptionalValue;

  return null;
});

void optionalStateApp;

// @ts-expect-error tenantMiddlewareはSessionStateを要求する
new AppsScript().use(tenantMiddleware);

const appWithRequiredState = new AppsScript()
  .use(sessionMiddleware)
  .use(tenantMiddleware)
  .call("test", (_input: {}, context) => {
    const session: {
      userId: string;
    } = context.state.get("session");

    const tenant: {
      id: string;
    } = context.state.get("tenant");

    void session;
    void tenant;

    return null;
  });

void appWithRequiredState;

const appWithContextHandlers = new AppsScript().use(sessionMiddleware).calls({
  findUser: (
    input: {
      id: string;
    },
    context: AppsScriptContext<SessionState, SessionState>,
  ) => ({
    id: input.id,
    userId: context.state.get("session").userId,
  }),
});

type AppWithContextHandlers = InferAppsScript<typeof appWithContextHandlers>;

const contextHandlerInput: AppWithContextHandlers["findUser"]["input"] = {
  id: "1",
};

const contextHandlerResult: AppWithContextHandlers["findUser"]["result"] = {
  id: "1",
  userId: "user-1",
};

void contextHandlerInput;
void contextHandlerResult;

import {
  AppsScript,
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

type AuthorizationState = {
  authorization: {
    allowed: boolean;
  };
};

const authentication: AppsScriptMiddleware<{}, SessionState> = (
  context,
  next,
) => {
  context.state.set("session", {
    userId: "user-1",
  });

  return next();
};

const tenantResolver: AppsScriptMiddleware<
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

const authorization: AppsScriptMiddleware<
  SessionState & TenantState,
  SessionState & TenantState & AuthorizationState
> = (context, next) => {
  const session: {
    userId: string;
  } = context.state.get("session");

  const tenant: {
    id: string;
  } = context.state.get("tenant");

  void session;
  void tenant;

  context.state.set("authorization", {
    allowed: true,
  });

  return next();
};

const app = new AppsScript()
  .use(authentication)
  .call(
    "private",
    (_input: { id: string }, context) => {
      const session: {
        userId: string;
      } = context.state.get("session");

      const tenant: {
        id: string;
      } = context.state.get("tenant");

      const authz: {
        allowed: boolean;
      } = context.state.get("authorization");

      return {
        id: _input.id,
        userId: session.userId,
        tenantId: tenant.id,
        allowed: authz.allowed,
      };
    },
    [tenantResolver, authorization],
  )
  .call("public", (_input: {}, context) => {
    const session: {
      userId: string;
    } = context.state.get("session");

    // @ts-expect-error call-local middlewareは他のRPCへ伝播しない
    context.state.get("tenant");

    return session.userId;
  });

type App = InferAppsScript<typeof app>;

const privateInput: App["private"]["input"] = {
  id: "1",
};

const privateResult: App["private"]["result"] = {
  id: "1",
  userId: "user-1",
  tenantId: "user-1",
  allowed: true,
};

void privateInput;
void privateResult;

// @ts-expect-error tenantResolverはSessionStateを要求する
new AppsScript().call("invalid", (_input: {}) => null, [tenantResolver]);

new AppsScript()
  .use(authentication)
  .call(
    "invalidOrder",
    (_input: {}) => null,
    // @ts-expect-error authorizationはTenantStateを要求する
    [authorization, tenantResolver],
  );

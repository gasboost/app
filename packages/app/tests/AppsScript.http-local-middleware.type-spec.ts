import {
  AppsScript,
  type AppsScriptMiddleware,
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


new AppsScript()
  .use(authentication)
  .get(
    (request, context) => {
      const session: { userId: string } = context.state.get("session");
      const tenant: { id: string } = context.state.get("tenant");
      const authz: { allowed: boolean } = context.state.get("authorization");
      const query: string | undefined = request.query("id");
      void session; void tenant; void authz; void query;
      return {} as GoogleAppsScript.HTML.HtmlOutput;
    },
    [tenantResolver, authorization] as const,
  )
  .get((_request, context) => {
    // @ts-expect-error HTTP local state does not propagate to GET
    context.state.get("tenant");
    return {} as GoogleAppsScript.Content.TextOutput;
  })
  .post((_request, context) => {
    // @ts-expect-error HTTP local state does not propagate to POST
    context.state.get("authorization");
    return {} as GoogleAppsScript.Content.TextOutput;
  })
  .call("afterget", (_input, context) => {
    // @ts-expect-error HTTP local state does not propagate to RPC
    context.state.get("tenant");
    return context.state.get("session");
  });

// @ts-expect-error tenantResolver requires SessionState
new AppsScript().get(() => ({} as GoogleAppsScript.HTML.HtmlOutput), [tenantResolver]);

new AppsScript().use(authentication).get(
  () => ({} as GoogleAppsScript.HTML.HtmlOutput),
  // @ts-expect-error authorization requires TenantState before it runs
  [authorization, tenantResolver],
);

new AppsScript().get(
  (_request, context) => {
    const tenant: { id: string } = context.state.get("tenant");
    void tenant;
    return {} as GoogleAppsScript.Content.TextOutput;
  },
  [authentication, tenantResolver],
);

new AppsScript().get(() => ({} as GoogleAppsScript.HTML.HtmlOutput), []);
new AppsScript().get(() => ({} as GoogleAppsScript.HTML.HtmlOutput), undefined);

new AppsScript()
  .use(authentication)
  .post(
    (request, context) => {
      const session: { userId: string } = context.state.get("session");
      const tenant: { id: string } = context.state.get("tenant");
      const authz: { allowed: boolean } = context.state.get("authorization");
      const query: string | undefined = request.query("id");
      void session; void tenant; void authz; void query;
      return {} as GoogleAppsScript.HTML.HtmlOutput;
    },
    [tenantResolver, authorization] as const,
  )
  .get((_request, context) => {
    // @ts-expect-error HTTP local state does not propagate to GET
    context.state.get("tenant");
    return {} as GoogleAppsScript.Content.TextOutput;
  })
  .post((_request, context) => {
    // @ts-expect-error HTTP local state does not propagate to POST
    context.state.get("authorization");
    return {} as GoogleAppsScript.Content.TextOutput;
  })
  .call("afterpost", (_input, context) => {
    // @ts-expect-error HTTP local state does not propagate to RPC
    context.state.get("tenant");
    return context.state.get("session");
  });

// @ts-expect-error tenantResolver requires SessionState
new AppsScript().post(() => ({} as GoogleAppsScript.HTML.HtmlOutput), [tenantResolver]);

new AppsScript().use(authentication).post(
  () => ({} as GoogleAppsScript.HTML.HtmlOutput),
  // @ts-expect-error authorization requires TenantState before it runs
  [authorization, tenantResolver],
);

new AppsScript().post(
  (_request, context) => {
    const tenant: { id: string } = context.state.get("tenant");
    void tenant;
    return {} as GoogleAppsScript.Content.TextOutput;
  },
  [authentication, tenantResolver],
);

new AppsScript().post(() => ({} as GoogleAppsScript.HTML.HtmlOutput), []);
new AppsScript().post(() => ({} as GoogleAppsScript.HTML.HtmlOutput), undefined);

new AppsScript<{ optional: number }>().get(
  (_request, context) => {
    const optional: number | undefined = context.state.get("optional");
    const session: { userId: string } = context.state.get("session");
    // @ts-expect-error declared state is still optional without a guarantee
    const required: number = context.state.get("optional");
    // @ts-expect-error local state retains its value type
    const invalid: number = context.state.get("session");
    void optional; void session; void required; void invalid;
    return {} as GoogleAppsScript.HTML.HtmlOutput;
  },
  [authentication],
);

new AppsScript<{ optional: number }>().post(
  (_request, context) => {
    const optional: number | undefined = context.state.get("optional");
    const session: { userId: string } = context.state.get("session");
    // @ts-expect-error declared state is still optional without a guarantee
    const required: number = context.state.get("optional");
    // @ts-expect-error local state retains its value type
    const invalid: number = context.state.get("session");
    void optional; void session; void required; void invalid;
    return {} as GoogleAppsScript.HTML.HtmlOutput;
  },
  [authentication],
);

import { describe, expect, it } from "vitest";
import { AppsScript, type AppsScriptMiddleware } from "../src";

describe("AppsScript state refinement", () => {
  it("middlewareで設定したstateをhandlerから取得できる", async () => {
    type SessionState = {
      session: {
        userId: string;
      };
    };

    const middleware: AppsScriptMiddleware<{}, SessionState> = (
      context,
      next,
    ) => {
      context.state.set("session", {
        userId: "user-1",
      });

      return next();
    };

    const app = new AppsScript()
      .use(middleware)
      .call("test", (_input, context) => {
        return context.state.get("session").userId;
      });

    const response = await app.dispatch("test");

    expect(response.contents).toBe(JSON.stringify("user-1"));
  });

  it("複数middlewareで追加したstateをhandlerから取得できる", async () => {
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

      return next();
    };

    const tenantMiddleware: AppsScriptMiddleware<
      SessionState,
      SessionState & TenantState
    > = (context, next) => {
      const session = context.state.get("session");

      context.state.set("tenant", {
        id: `tenant-${session.userId}`,
      });

      return next();
    };

    const app = new AppsScript()
      .use(sessionMiddleware)
      .use(tenantMiddleware)
      .call("test", (_input, context) => ({
        session: context.state.get("session"),
        tenant: context.state.get("tenant"),
      }));

    const response = await app.dispatch("test");

    expect(JSON.parse(response.contents)).toEqual({
      session: {
        userId: "user-1",
      },
      tenant: {
        id: "tenant-user-1",
      },
    });
  });

  it("invocationごとに別のstateを生成する", async () => {
    type SessionState = {
      session: string;
    };

    const states: unknown[] = [];

    const middleware: AppsScriptMiddleware<{}, SessionState> = (
      context,
      next,
    ) => {
      states.push(context.state);

      context.state.set("session", "user-1");

      return next();
    };

    const app = new AppsScript()
      .use(middleware)
      .call("test", (_input, context) => {
        return context.state.get("session");
      });

    await app.dispatch("test");
    await app.dispatch("test");

    expect(states).toHaveLength(2);
    expect(states[0]).not.toBe(states[1]);
  });

  it("前回invocationのstateが次回へ漏れない", async () => {
    type InvocationState = {
      value: string | undefined;
    };

    const middleware: AppsScriptMiddleware<{}, InvocationState> = (
      context,
      next,
    ) => {
      if (context.invocation.type !== "call") {
        context.state.set("value", undefined);
        return next();
      }

      const input = context.invocation.input as {
        value?: string;
      };

      context.state.set("value", input.value);

      return next();
    };

    const app = new AppsScript().use(middleware).call(
      "test",
      (
        _input: {
          value?: string;
        },
        context,
      ) => {
        return context.state.get("value");
      },
    );

    const first = await app.dispatch("test", {
      value: "first",
    });

    const second = await app.dispatch("test", {});

    expect(first.contents).toBe(JSON.stringify("first"));

    expect(second.contents).toBeUndefined();
  });

  it("async handlerでも同じinvocation stateを保持する", async () => {
    type SessionState = {
      session: string;
    };

    const middleware: AppsScriptMiddleware<{}, SessionState> = (
      context,
      next,
    ) => {
      context.state.set("session", "user-1");

      return next();
    };

    const app = new AppsScript()
      .use(middleware)
      .call("test", async (_input, context) => {
        await Promise.resolve();

        return context.state.get("session");
      });

    const response = await app.dispatch("test");

    expect(response.contents).toBe(JSON.stringify("user-1"));
  });

  it("middlewareとhandlerで同じstateを共有する", async () => {
    type SessionState = {
      session: string;
    };

    let middlewareState: unknown;
    let handlerState: unknown;

    const middleware: AppsScriptMiddleware<{}, SessionState> = (
      context,
      next,
    ) => {
      middlewareState = context.state;

      context.state.set("session", "user-1");

      return next();
    };

    const app = new AppsScript()
      .use(middleware)
      .call("test", (_input, context) => {
        handlerState = context.state;

        return context.state.get("session");
      });

    await app.dispatch("test");

    expect(handlerState).toBe(middlewareState);
  });

  it("並行invocation間でstateが混ざらない", async () => {
    type SessionState = {
      session: string;
    };

    const middleware: AppsScriptMiddleware<{}, SessionState> = async (
      context,
      next,
    ) => {
      if (context.invocation.type !== "call") {
        return next();
      }

      const input = context.invocation.input as {
        session: string;
        delay: number;
      };

      context.state.set("session", input.session);

      await new Promise((resolve) => {
        setTimeout(resolve, input.delay);
      });

      return next();
    };

    const app = new AppsScript().use(middleware).call(
      "test",
      async (
        _input: {
          session: string;
          delay: number;
        },
        context,
      ) => {
        await Promise.resolve();

        return context.state.get("session");
      },
    );

    const [first, second] = await Promise.all([
      app.dispatch("test", {
        session: "user-A",
        delay: 20,
      }),
      app.dispatch("test", {
        session: "user-B",
        delay: 0,
      }),
    ]);

    expect(JSON.parse(first.contents)).toBe("user-A");

    expect(JSON.parse(second.contents)).toBe("user-B");
  });
});

import { describe, expect, it } from "vitest";
import { AppsScript, AppsScriptError, type AppsScriptMiddleware } from "../src";

async function failure(
  app: { dispatch(name: string): Promise<unknown> },
  name = "fail",
): Promise<Error> {
  try {
    await app.dispatch(name);
  } catch (cause) {
    expect(cause).toBeInstanceOf(Error);
    return cause as Error;
  }
  throw new Error("Expected RPC failure");
}

describe("RPC error boundary", () => {
  it("exports an Error with an object constructor and an arbitrary public code", () => {
    const error = new AppsScriptError({
      code: "EMPLOYEE_ALREADY_EXISTS",
      message: "Employee already exists",
    });
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      code: "EMPLOYEE_ALREADY_EXISTS",
      message: "Employee already exists",
    });
  });

  it("serializes only code and message after presentation middleware converts a domain error", async () => {
    class DomainError extends Error {}
    const middleware: AppsScriptMiddleware = async (_context, next) => {
      try {
        return await next();
      } catch (cause) {
        if (cause instanceof DomainError) {
          const error = new AppsScriptError({
            code: "EMPLOYEE_ALREADY_EXISTS",
            message: "Employee already exists",
          });
          Object.assign(error, { secret: "internal secret" });
          throw error;
        }
        throw cause;
      }
    };
    const app = new AppsScript().use(middleware).calls({
      fail: async () => {
        throw new DomainError("internal secret");
      },
    });
    const error = await failure(app);
    expect(error.message).toBe(
      'GASBOOST_RPC_ERROR_V1:{"code":"EMPLOYEE_ALREADY_EXISTS","message":"Employee already exists"}',
    );
    // This is the existing @gasboost/vite catch/serialization contract.
    expect(
      JSON.parse(
        JSON.stringify({
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
          },
        }),
      ),
    ).toEqual({ error: { name: "Error", message: error.message } });
    expect(JSON.stringify(error)).not.toContain("internal secret");
  });

  it.each([
    new Error("internal secret"),
    "internal secret",
    { secret: "internal secret" },
    null,
    { code: "FORGED", message: "internal secret" },
    new Error(
      'GASBOOST_RPC_ERROR_V1:{"code":"FORGED","message":"internal secret"}',
    ),
  ])("normalizes unexpected throws: %s", async (cause) => {
    const app = new AppsScript().call("fail", () => {
      throw cause;
    });
    const error = await failure(app);
    expect(error.message).toBe(
      'GASBOOST_RPC_ERROR_V1:{"code":"INTERNAL_ERROR","message":"An unexpected error occurred"}',
    );
    expect(error.stack).toBeUndefined();
  });

  it("also protects result serialization and unknown RPC names", async () => {
    const app = new AppsScript().call("fail", () => ({
      toJSON() {
        throw new Error("internal secret");
      },
    }));
    for (const name of ["fail", "missing"]) {
      expect((await failure(app, name)).message).toContain(
        '"code":"INTERNAL_ERROR"',
      );
    }
  });

  it("preserves HTML GET/POST exceptions", () => {
    const cause = new Error("HTTP handler error");
    const app = new AppsScript()
      .get(() => {
        throw cause;
      })
      .post(() => {
        throw cause;
      });
    expect(() =>
      app.callGet({} as GoogleAppsScript.Events.AppsScriptHttpRequestEvent),
    ).toThrow(cause);
    expect(() => app.callPost({} as GoogleAppsScript.Events.DoPost)).toThrow(
      cause,
    );
  });
});

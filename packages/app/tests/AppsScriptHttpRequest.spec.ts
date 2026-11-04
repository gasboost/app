import { describe, expect, expectTypeOf, it } from "vitest";
import { AppsScriptHttpRequest } from "../src/AppsScriptHttpRequest";

describe("AppsScriptHttpRequest.path", () => {
  it.each(["bootstrap", "bootstrap/nested", "/bootstrap/", "", undefined])(
    "preserves pathInfo %s",
    (pathInfo) => {
      const request = new AppsScriptHttpRequest({
        ...(pathInfo === undefined ? {} : { pathInfo }),
        parameter: { token: "secret", tag: "one" },
        parameters: { token: ["secret"], tag: ["one", "two"] },
      } as unknown as GoogleAppsScript.Events.AppsScriptHttpRequestEvent);
      expect(request.path()).toBe(pathInfo);
      expectTypeOf(request.path()).toEqualTypeOf<string | undefined>();
      expect(request.query("token")).toBe("secret");
      expect(request.query()).toEqual({ token: "secret", tag: "one" });
      expect(request.queries("tag")).toEqual(["one", "two"]);
      expect(request.queries()).toEqual({
        token: ["secret"],
        tag: ["one", "two"],
      });
    },
  );
});

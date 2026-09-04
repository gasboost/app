import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { analyzeAppsScript } from "../src/analyzer";

const directories: string[] = [];

function analyze(source: string) {
  const directory = mkdtempSync(join(tmpdir(), "gasboost-analyzer-"));

  directories.push(directory);

  const entry = join(directory, "main.ts");

  writeFileSync(entry, source);

  return analyzeAppsScript(entry);
}

afterEach(() => {
  for (const directory of directories) {
    rmSync(directory, {
      recursive: true,
      force: true,
    });
  }

  directories.length = 0;
});

describe("analyzeAppsScript", () => {
  test("getを検出できる", () => {
    expect(
      analyze(`
        const app = new AppsScript()
          .get(() => {});

        export default app;
      `),
    ).toEqual({
      hasGet: true,
      hasPost: false,
      calls: [],
    });
  });

  test("postを検出できる", () => {
    expect(
      analyze(`
        const app = new AppsScript()
          .post(() => {});

        export default app;
      `),
    ).toEqual({
      hasGet: false,
      hasPost: true,
      calls: [],
    });
  });

  test("callを検出できる", () => {
    expect(
      analyze(`
        const app = new AppsScript()
          .call("getUser", () => {});

        export default app;
      `),
    ).toEqual({
      hasGet: false,
      hasPost: false,
      calls: ["getUser"],
    });
  });

  test("複数のcallを登録順に検出できる", () => {
    expect(
      analyze(`
        const app = new AppsScript()
          .call("getUser", () => {})
          .call("saveUser", () => {})
          .call("deleteUser", () => {});

        export default app;
      `),
    ).toEqual({
      hasGet: false,
      hasPost: false,
      calls: ["getUser", "saveUser", "deleteUser"],
    });
  });

  test("get、post、callを同時に検出できる", () => {
    expect(
      analyze(`
        const app = new AppsScript()
          .get(() => {})
          .post(() => {})
          .call("getUser", () => {})
          .call("saveUser", () => {});

        export default app;
      `),
    ).toEqual({
      hasGet: true,
      hasPost: true,
      calls: ["getUser", "saveUser"],
    });
  });

  test("call名が文字列リテラルでなければエラー", () => {
    expect(() =>
      analyze(`
        const name = "getUser";

        const app = new AppsScript()
          .call(name, () => {});

        export default app;
      `),
    ).toThrow();
  });

  test("call名が指定されていなければエラー", () => {
    expect(() =>
      analyze(`
        const app = new AppsScript()
          .call();

        export default app;
      `),
    ).toThrow();
  });

  test("同名callが重複していればエラー", () => {
    expect(() =>
      analyze(`
        const app = new AppsScript()
          .call("getUser", () => {})
          .call("getUser", () => {});

        export default app;
      `),
    ).toThrow();
  });

  test("AppsScript以外のcallを検出しない", () => {
    expect(
      analyze(`
        const foo = {
          call() {},
        };

        foo.call("other");

        const app = new AppsScript()
          .call("getUser", () => {});

        export default app;
      `),
    ).toEqual({
      hasGet: false,
      hasPost: false,
      calls: ["getUser"],
    });
  });

  test("AppsScript以外のgetとpostを検出しない", () => {
    expect(
      analyze(`
        const foo = {
          get() {},
          post() {},
        };

        foo.get();
        foo.post();

        const app = new AppsScript()
          .call("getUser", () => {});

        export default app;
      `),
    ).toEqual({
      hasGet: false,
      hasPost: false,
      calls: ["getUser"],
    });
  });

  test("AppsScriptのチェーンだけを解析する", () => {
    expect(
      analyze(`
        something
          .get(() => {})
          .post(() => {})
          .call("fake", () => {});

        const app = new AppsScript()
          .get(() => {})
          .call("real", () => {});

        export default app;
      `),
    ).toEqual({
      hasGet: true,
      hasPost: false,
      calls: ["real"],
    });
  });

  test("変数に格納したAppsScriptへの後続登録を解析できる", () => {
    expect(
      analyze(`
        const app = new AppsScript();

        app.get(() => {});
        app.post(() => {});
        app.call("getUser", () => {});

        export default app;
      `),
    ).toEqual({
      hasGet: true,
      hasPost: true,
      calls: ["getUser"],
    });
  });

  test("コメント中のcallを検出しない", () => {
    expect(
      analyze(`
        // app.call("fake1", () => {});

        /*
          app.call("fake2", () => {});
        */

        const app = new AppsScript()
          .call("real", () => {});

        export default app;
      `),
    ).toEqual({
      hasGet: false,
      hasPost: false,
      calls: ["real"],
    });
  });

  test("文字列中のcallを検出しない", () => {
    expect(
      analyze(`
        const text =
          '.call("fake", () => {})';

        const app = new AppsScript()
          .call("real", () => {});

        export default app;
      `),
    ).toEqual({
      hasGet: false,
      hasPost: false,
      calls: ["real"],
    });
  });

  test("登録がないAppsScriptを解析できる", () => {
    expect(
      analyze(`
        const app = new AppsScript();

        export default app;
      `),
    ).toEqual({
      hasGet: false,
      hasPost: false,
      calls: [],
    });
  });

  test("TypeScript構文を含むentryを解析できる", () => {
    expect(
      analyze(`
        interface User {
          id: string;
        }

        const app = new AppsScript()
          .call(
            "getUser",
            (id: string): User => ({
              id,
            }),
          );

        export default app;
      `),
    ).toEqual({
      hasGet: false,
      hasPost: false,
      calls: ["getUser"],
    });
  });

  test("存在しないentryではエラー", () => {
    expect(() => analyzeAppsScript("/this/file/does/not/exist.ts")).toThrow();
  });

  test("複数のAppsScriptインスタンスが存在する場合はエラー", () => {
    expect(() =>
      analyze(`
        const first =
          new AppsScript();

        const second =
          new AppsScript();

        export default first;
      `),
    ).toThrow();
  });

  test("getを複数登録した場合はエラー", () => {
    expect(() =>
      analyze(`
        const app = new AppsScript()
          .get(() => {})
          .get(() => {});

        export default app;
      `),
    ).toThrow();
  });

  test("postを複数登録した場合はエラー", () => {
    expect(() =>
      analyze(`
        const app = new AppsScript()
          .post(() => {})
          .post(() => {});

        export default app;
      `),
    ).toThrow();
  });

  test("AppsScriptがdefault exportされていなければエラー", () => {
    expect(() =>
      analyze(`
        const app = new AppsScript()
          .call("getUser", () => {});
      `),
    ).toThrow();
  });
});

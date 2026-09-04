import { beforeEach, describe, expect, it, vi } from "vitest";

type SuccessHandler = (result: unknown) => void;
type FailureHandler = (error: Error) => void;

let successHandler: SuccessHandler;
let failureHandler: FailureHandler;
let serverFunctions: Record<string, ReturnType<typeof vi.fn>>;

const run = new Proxy(
  {
    withSuccessHandler(callback: SuccessHandler) {
      successHandler = callback;
      return run;
    },

    withFailureHandler(callback: FailureHandler) {
      failureHandler = callback;
      return run;
    },
  },
  {
    get(target, property, receiver) {
      if (property in target) {
        return Reflect.get(target, property, receiver);
      }

      const name = String(property);

      serverFunctions[name] ??= vi.fn();

      return serverFunctions[name];
    },
  },
);

vi.stubGlobal("google", {
  script: {
    run,
  },
});

const { appsScriptClient, appsScriptTransport } =
  await import("../src/AppsScriptClient");

type TestApp = {
  sum: {
    args: [a: number, b: number];
    result: number;
  };

  getUser: {
    args: [id: string];
    result: {
      id: string;
      name: string;
    };
  };

  fail: {
    args: [];
    result: never;
  };
};

describe("appsScriptTransport", () => {
  beforeEach(() => {
    serverFunctions = {};
  });

  it("指定したGAS関数を引数付きで呼び出す", () => {
    const promise = appsScriptTransport.call("sum", [1, 2]);

    expect(serverFunctions.sum).toHaveBeenCalledWith(1, 2);

    successHandler({
      contents: "3",
    });

    return expect(promise).resolves.toEqual({
      contents: "3",
    });
  });

  it("failure handlerのErrorをrejectする", async () => {
    const promise = appsScriptTransport.call("fail", []);

    const error = new Error("failed");

    failureHandler(error);

    await expect(promise).rejects.toBe(error);
  });
});

describe("appsScriptClient", () => {
  beforeEach(() => {
    serverFunctions = {};
  });

  it("RPC名と引数をTransportへ渡してJSONをparseする", async () => {
    const { client } = appsScriptClient<TestApp>();

    const promise = client.sum(1, 2);

    expect(serverFunctions.sum).toHaveBeenCalledWith(1, 2);

    successHandler({
      contents: "3",
    });

    await expect(promise).resolves.toBe(3);
  });

  it("objectをJSON.parseして返す", async () => {
    const { client } = appsScriptClient<TestApp>();

    const promise = client.getUser("user-1");

    successHandler({
      contents: JSON.stringify({
        id: "user-1",
        name: "Taro",
      }),
    });

    await expect(promise).resolves.toEqual({
      id: "user-1",
      name: "Taro",
    });
  });

  it("DateはDateへ復元せず文字列として返す", async () => {
    type DateApp = {
      get: {
        args: [];
        result: {
          createdAt: Date;
        };
      };
    };

    const { client } = appsScriptClient<DateApp>();

    const promise = client.get();

    successHandler({
      contents: JSON.stringify({
        createdAt: new Date("2026-09-04T00:00:00.000Z"),
      }),
    });

    const result = await promise;

    expect(result.createdAt).toBe("2026-09-04T00:00:00.000Z");
    expect(result.createdAt).not.toBeInstanceOf(Date);
  });

  it("GAS側の失敗をそのままrejectする", async () => {
    const { client } = appsScriptClient<TestApp>();

    const promise = client.fail();

    const error = new Error("failed");
    failureHandler(error);

    await expect(promise).rejects.toBe(error);
  });

  it("不正なJSONならJSON.parseエラーになる", async () => {
    const { client } = appsScriptClient<TestApp>();

    const promise = client.sum(1, 2);

    successHandler({
      contents: "{invalid-json",
    });

    await expect(promise).rejects.toBeInstanceOf(SyntaxError);
  });

  it("client経由のRPC Jobをjobsから購読できる", async () => {
    const { client, jobs } = appsScriptClient<TestApp>();
    const listener = vi.fn();

    jobs.subscribe(listener);

    const promise = client.sum(1, 2);

    const snapshot = jobs.getSnapshot();

    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].label).toBe("sum");
    expect(snapshot[0].status).toBe("running");

    successHandler({
      contents: "3",
    });

    await promise;

    await vi.waitFor(() => {
      expect(jobs.getSnapshot()).toHaveLength(0);
    });

    expect(listener).toHaveBeenCalled();
  });

  it("失敗したRPC Jobはjobsにfailedとして残る", async () => {
    const { client, jobs } = appsScriptClient<TestApp>();

    const promise = client.fail();

    failureHandler(new Error("failed"));

    await expect(promise).rejects.toThrow("failed");

    await vi.waitFor(() => {
      expect(jobs.getSnapshot()).toHaveLength(1);
    });

    expect(jobs.getSnapshot()[0].status).toBe("failed");
  });

  it("jobs.startとclientが同じQueueを共有する", async () => {
    const { client, jobs } = appsScriptClient<TestApp>();

    const manual = new Promise<void>(() => {});

    void jobs.start("manual", () => manual);

    const rpcPromise = client.sum(1, 2);

    const snapshot = jobs.getSnapshot();

    expect(snapshot.map((job) => job.label)).toEqual(["manual", "sum"]);

    successHandler({
      contents: "3",
    });

    await rpcPromise;
  });

  it("Symbol propertyへのアクセスはundefined", () => {
    const { client } = appsScriptClient<TestApp>();

    expect(
      (client as unknown as Record<PropertyKey, unknown>)[Symbol.toStringTag],
    ).toBeUndefined();
  });
});

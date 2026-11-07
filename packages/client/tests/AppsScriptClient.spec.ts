import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppsScriptJobCancelledError } from "../src/job/AppsScriptJob";

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

      serverFunctions[name] ??= vi.fn((...args: unknown[]) => {
        if (args.some((arg) => arg === undefined)) {
          throw new Error(
            "google.script.run cannot send undefined positional arguments",
          );
        }
      });

      return serverFunctions[name];
    },
  },
);

vi.stubGlobal("google", {
  script: {
    run,
  },
});

const { appsScriptClient } = await import("../src/AppsScriptClient");
const { AppsScriptTransport } = await import("../src/AppsScriptTransport");

type TestApp = {
  sum: {
    input: {
      a: number;
      b: number;
    };
    result: number;
  };

  getUser: {
    input: {
      id: string;
    };
    result: {
      id: string;
      name: string;
    };
  };

  fail: {
    input: undefined;
    result: never;
  };
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

describe("AppsScriptTransport", () => {
  beforeEach(() => {
    serverFunctions = {};
  });

  it("指定したGAS関数をinput付きで呼び出す", () => {
    const transport = new AppsScriptTransport();

    const promise = transport.call("sum", {
      a: 1,
      b: 2,
    });

    expect(serverFunctions.sum).toHaveBeenCalledWith({
      a: 1,
      b: 2,
    });

    successHandler({
      contents: "3",
    });

    return expect(promise).resolves.toEqual({
      contents: "3",
    });
  });

  it("inputなしの場合はGAS関数を0引数で呼び出す", () => {
    const transport = new AppsScriptTransport();

    const promise = transport.call("fail");

    expect(serverFunctions.fail).toHaveBeenCalledWith();

    failureHandler(new Error("failed"));

    return expect(promise).rejects.toThrow("An unexpected error occurred");
  });

  it("failure handlerの未知のErrorを安全なコード付きエラーにする", async () => {
    const transport = new AppsScriptTransport();

    const promise = transport.call("fail");

    const error = new Error("failed");

    failureHandler(error);

    await expect(promise).rejects.toMatchObject({ code: "INTERNAL_ERROR", message: "An unexpected error occurred" });
  });

  it("指定したTransportをRPCに利用する", async () => {
    const transport = {
      call: vi.fn().mockResolvedValue({
        contents: "3",
      }),
    };

    const { client } = appsScriptClient<TestApp>({
      transport,
    });

    await expect(
      client.sum({
        a: 1,
        b: 2,
      }),
    ).resolves.toBe(3);

    expect(transport.call).toHaveBeenCalledWith("sum", {
      a: 1,
      b: 2,
    });
  });
});

describe("appsScriptClient", () => {
  beforeEach(() => {
    serverFunctions = {};
  });

  it("RPC名とinputをTransportへ渡してJSONをparseする", async () => {
    const { client } = appsScriptClient<TestApp>();

    const promise = client.sum({
      a: 1,
      b: 2,
    });

    expect(serverFunctions.sum).toHaveBeenCalledWith({
      a: 1,
      b: 2,
    });

    successHandler({
      contents: "3",
    });

    await expect(promise).resolves.toBe(3);
  });

  it("objectをJSON.parseして返す", async () => {
    const { client } = appsScriptClient<TestApp>();

    const promise = client.getUser({
      id: "user-1",
    });

    expect(serverFunctions.getUser).toHaveBeenCalledWith({
      id: "user-1",
    });

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
        input: undefined;
        result: {
          createdAt: Date;
        };
      };
    };

    const { client } = appsScriptClient<DateApp>();

    const promise = client.get();

    expect(serverFunctions.get).toHaveBeenCalledWith();

    successHandler({
      contents: JSON.stringify({
        createdAt: new Date("2026-09-04T00:00:00.000Z"),
      }),
    });

    const result = await promise;

    expect(result.createdAt).toBe("2026-09-04T00:00:00.000Z");
    expect(result.createdAt).not.toBeInstanceOf(Date);
  });

  it("GAS側の未知の失敗を安全なコード付きエラーにする", async () => {
    const { client } = appsScriptClient<TestApp>();

    const promise = client.fail();

    expect(serverFunctions.fail).toHaveBeenCalledWith();

    const error = new Error("failed");

    failureHandler(error);

    await expect(promise).rejects.toMatchObject({ code: "INTERNAL_ERROR", message: "An unexpected error occurred" });
  });

  it("不正なJSONならJSON.parseエラーになる", async () => {
    const { client } = appsScriptClient<TestApp>();

    const promise = client.sum({
      a: 1,
      b: 2,
    });

    successHandler({
      contents: "{invalid-json",
    });

    await expect(promise).rejects.toBeInstanceOf(SyntaxError);
  });

  it("client経由のRPC Jobをjobsから購読できる", async () => {
    const { client, jobs } = appsScriptClient<TestApp>();
    const listener = vi.fn();

    jobs.subscribe(listener);

    const promise = client.sum({
      a: 1,
      b: 2,
    });

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

    await expect(promise).rejects.toThrow("An unexpected error occurred");

    await vi.waitFor(() => {
      expect(jobs.getSnapshot()).toHaveLength(1);
    });

    expect(jobs.getSnapshot()[0].status).toBe("failed");
  });

  it("jobs.startとclientが同じQueueを共有する", async () => {
    const { client, jobs } = appsScriptClient<TestApp>();

    const manual = new Promise<void>(() => {});

    void jobs.start("manual", () => manual);

    const rpcPromise = client.sum({
      a: 1,
      b: 2,
    });

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

  it("jobs.cancelでpending Jobをキャンセルすると実行されずPromiseがrejectする", async () => {
    const { jobs } = appsScriptClient<TestApp>();

    const controls = Array.from({ length: 30 }, () => deferred<void>());

    const runningPromises = controls.map((control, index) =>
      jobs.start(`running-${index}`, async () => {
        await control.promise;
      }),
    );

    const pendingExecute = vi.fn(async () => "pending");

    const pendingPromise = jobs.start("pending", pendingExecute);

    await vi.waitFor(() => {
      expect(jobs.getSnapshot().filter((job) => job.isRunning())).toHaveLength(
        30,
      );
    });

    const pendingJob = jobs
      .getSnapshot()
      .find((job) => job.label === "pending");

    expect(pendingJob).toBeDefined();
    expect(pendingJob?.status).toBe("pending");

    jobs.cancel(pendingJob!.id);

    await expect(pendingPromise).rejects.toBeInstanceOf(
      AppsScriptJobCancelledError,
    );

    expect(
      jobs.getSnapshot().find((job) => job.id === pendingJob!.id),
    ).toBeUndefined();

    controls[0].resolve();
    await runningPromises[0];

    await Promise.resolve();
    await Promise.resolve();

    expect(pendingExecute).not.toHaveBeenCalled();

    for (const control of controls.slice(1)) {
      control.resolve();
    }

    await Promise.all(runningPromises);
  });
});

it("AppsScriptTransport forwards metadata as a separate positional argument", async () => {
  serverFunctions = {};
  const transport = new AppsScriptTransport();
  const input = { a: 1, b: 2 };
  const metadata = { "@example/tracing": { id: "trace" } };
  const result = transport.call("sum", input, metadata);
  expect(serverFunctions.sum).toHaveBeenCalledWith(input, metadata);
  successHandler({ contents: "3" });
  await expect(result).resolves.toEqual({ contents: "3" });
  const noInput = transport.call("ping", undefined, metadata);
  expect(serverFunctions.ping).toHaveBeenCalledWith(null, metadata);
  successHandler({ contents: "true" });
  await noInput;
});

it("keeps explicit null and falsy input values when sending metadata", async () => {
  serverFunctions = {};
  const transport = new AppsScriptTransport();
  const metadata = { trace: "falsy" };
  for (const input of [null, false, 0, ""]) {
    const promise = transport.call("value", input, metadata);
    expect(serverFunctions.value).toHaveBeenLastCalledWith(input, metadata);
    successHandler({ contents: "true" });
    await promise;
  }
});

it("sends metadata-only typed RPCs with a serializable null input", async () => {
  serverFunctions = {};
  const metadata = { trace: "typed-no-input" };
  const { client } = appsScriptClient<{
    ping: { input: undefined; result: boolean };
  }>({
    metadataProviders: [() => metadata],
  });
  const promise = client.ping();
  expect(serverFunctions.ping).toHaveBeenCalledWith(null, metadata);
  successHandler({ contents: "true" });
  await expect(promise).resolves.toBe(true);
});

it.each(["", "Error: ", "Exception: "])("restores message-only GAS failures with prefix %s", async (prefix) => {
  serverFunctions = {};
  const { client } = appsScriptClient<TestApp>();
  const promise = client.fail();
  failureHandler(new Error(prefix + 'GASBOOST_RPC_ERROR_V1:{"code":"EMPLOYEE_ALREADY_EXISTS","message":"Employee already exists"}'));
  await expect(promise).rejects.toMatchObject({
    code: "EMPLOYEE_ALREADY_EXISTS", message: "Employee already exists",
  });
});

it.each(["GASBOOST_RPC_ERROR_V1:invalid", "internal secret", 'GASBOOST_RPC_ERROR_V1:{"code":1,"message":"internal secret"}'])("normalizes unsupported GAS failures: %s", async (message) => {
  serverFunctions = {};
  const promise = new AppsScriptTransport().call("fail");
  failureHandler(new Error(message));
  await expect(promise).rejects.toMatchObject({ code: "INTERNAL_ERROR", message: "An unexpected error occurred" });
});

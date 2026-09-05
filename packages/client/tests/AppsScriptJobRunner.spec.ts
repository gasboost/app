import { describe, expect, it, vi } from "vitest";
import { AppsScriptJobCancelledError } from "../src/AppsScriptJob";
import { AppsScriptJobQueue } from "../src/AppsScriptJobQueue";
import { AppsScriptJobRunner } from "../src/AppsScriptJobRunner";

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

describe("AppsScriptJobRunner", () => {
  it("enqueueされたJobを実行する", async () => {
    const queue = new AppsScriptJobQueue();
    new AppsScriptJobRunner(queue);

    const execute = vi.fn(async () => "result");

    await expect(queue.enqueue("test", execute)).resolves.toBe("result");

    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("成功したJobは一覧から削除される", async () => {
    const queue = new AppsScriptJobQueue();
    const runner = new AppsScriptJobRunner(queue);

    await queue.enqueue("test", async () => "result");

    await vi.waitFor(() => {
      expect(runner.getJobs()).toHaveLength(0);
    });
  });

  it("失敗したJobはfailedとして一覧に残る", async () => {
    const queue = new AppsScriptJobQueue();
    const runner = new AppsScriptJobRunner(queue);

    const error = new Error("failed");

    await expect(
      queue.enqueue("test", async () => {
        throw error;
      }),
    ).rejects.toBe(error);

    await vi.waitFor(() => {
      expect(runner.getJobs()).toHaveLength(1);
    });

    const [job] = runner.getJobs();

    expect(job.status).toBe("failed");
    expect(job.error).toBe(error);
  });

  it("最大30Jobまで同時実行する", async () => {
    const queue = new AppsScriptJobQueue();
    new AppsScriptJobRunner(queue);

    let running = 0;
    let maxRunning = 0;

    const jobs = Array.from({ length: 31 }, () => {
      const control = deferred<void>();

      const promise = queue.enqueue("test", async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);

        await control.promise;

        running--;
      });

      return {
        control,
        promise,
      };
    });

    await vi.waitFor(() => {
      expect(maxRunning).toBe(30);
    });

    expect(running).toBe(30);

    jobs[0].control.resolve();

    await vi.waitFor(() => {
      expect(running).toBe(30);
    });

    for (const job of jobs) {
      job.control.resolve();
    }

    await Promise.all(jobs.map((job) => job.promise));

    expect(maxRunning).toBe(30);
  });

  it("retryすると同じlabelとexecuteで新しいJobを実行する", async () => {
    const queue = new AppsScriptJobQueue();
    const runner = new AppsScriptJobRunner(queue);

    const execute = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("failed"))
      .mockResolvedValueOnce("success");

    await expect(queue.enqueue("test", execute)).rejects.toThrow("failed");

    await vi.waitFor(() => {
      expect(runner.getJobs()).toHaveLength(1);
    });

    const failedJob = runner.getJobs()[0];
    const failedJobId = failedJob.id;

    runner.retry(failedJobId);

    await vi.waitFor(() => {
      expect(execute).toHaveBeenCalledTimes(2);
    });

    await vi.waitFor(() => {
      expect(runner.getJobs()).toHaveLength(0);
    });

    expect(failedJob.label).toBe("test");
  });

  it("removeするとJob一覧から削除される", async () => {
    const queue = new AppsScriptJobQueue();
    const runner = new AppsScriptJobRunner(queue);

    await expect(
      queue.enqueue("test", async () => {
        throw new Error("failed");
      }),
    ).rejects.toThrow();

    const [job] = runner.getJobs();

    runner.remove(job.id);

    expect(runner.getJobs()).toEqual([]);
  });

  it("存在しないJobをremoveしても何も起きない", () => {
    const queue = new AppsScriptJobQueue();
    const runner = new AppsScriptJobRunner(queue);

    expect(() => runner.remove("missing")).not.toThrow();
  });

  it("存在しないJobをretryしても何も起きない", () => {
    const queue = new AppsScriptJobQueue();
    const runner = new AppsScriptJobRunner(queue);

    expect(() => runner.retry("missing")).not.toThrow();
  });

  it("変更がない場合getJobsは同じsnapshotを返す", () => {
    const queue = new AppsScriptJobQueue();
    const runner = new AppsScriptJobRunner(queue);

    const first = runner.getJobs();
    const second = runner.getJobs();

    expect(second).toBe(first);
  });

  it("Job追加後は新しいsnapshotを返す", () => {
    const queue = new AppsScriptJobQueue();
    const runner = new AppsScriptJobRunner(queue);

    const first = runner.getJobs();

    void queue.enqueue("test", () => new Promise(() => {}));

    const second = runner.getJobs();

    expect(second).not.toBe(first);
    expect(second).toHaveLength(1);
  });

  it("subscribeしたlistenerに状態変更を通知する", () => {
    const queue = new AppsScriptJobQueue();
    const runner = new AppsScriptJobRunner(queue);
    const listener = vi.fn();

    runner.subscribe(listener);

    void queue.enqueue("test", () => new Promise(() => {}));

    expect(listener).toHaveBeenCalled();
  });

  it("unsubscribe後はlistenerを呼ばない", () => {
    const queue = new AppsScriptJobQueue();
    const runner = new AppsScriptJobRunner(queue);
    const listener = vi.fn();

    const unsubscribe = runner.subscribe(listener);
    unsubscribe();

    void queue.enqueue("test", () => new Promise(() => {}));

    expect(listener).not.toHaveBeenCalled();
  });

  it("pending JobをcancelするとQueueからも削除され実行されない", async () => {
    const queue = new AppsScriptJobQueue();
    const runner = new AppsScriptJobRunner(queue);

    const controls = Array.from({ length: 30 }, () => deferred<void>());

    const runningPromises = controls.map((control, index) =>
      queue.enqueue(`running-${index}`, async () => {
        await control.promise;
      }),
    );

    const pendingExecute = vi.fn(async () => "pending");

    const pendingPromise = queue.enqueue("pending", pendingExecute);

    await vi.waitFor(() => {
      expect(runner.getJobs().filter((job) => job.isRunning())).toHaveLength(
        30,
      );
    });

    const pendingJob = runner.getJobs().find((job) => job.label === "pending");

    expect(pendingJob).toBeDefined();
    expect(pendingJob?.status).toBe("pending");

    runner.cancel(pendingJob!.id);

    await expect(pendingPromise).rejects.toBeInstanceOf(
      AppsScriptJobCancelledError,
    );

    expect(
      runner.getJobs().find((job) => job.id === pendingJob!.id),
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

  it("running JobをcancelしてもRunnerから削除されない", async () => {
    const queue = new AppsScriptJobQueue();
    const runner = new AppsScriptJobRunner(queue);

    const control = deferred<void>();

    const promise = queue.enqueue("running", async () => {
      await control.promise;
    });

    await vi.waitFor(() => {
      expect(runner.getJobs()).toHaveLength(1);
      expect(runner.getJobs()[0]?.isRunning()).toBe(true);
    });

    const runningJob = runner.getJobs()[0];

    runner.cancel(runningJob!.id);

    expect(runner.getJobs()).toContain(runningJob);
    expect(runningJob?.isRunning()).toBe(true);

    control.resolve();
    await promise;
  });

  it("running Jobをcancelしても同時実行数を超えない", async () => {
    const queue = new AppsScriptJobQueue();
    const runner = new AppsScriptJobRunner(queue);

    const controls = Array.from({ length: 30 }, () => deferred<void>());

    const runningPromises = controls.map((control, index) =>
      queue.enqueue(`running-${index}`, async () => {
        await control.promise;
      }),
    );

    const pendingExecute = vi.fn(async () => "pending");

    const pendingPromise = queue.enqueue("pending", pendingExecute);

    await vi.waitFor(() => {
      expect(runner.getJobs().filter((job) => job.isRunning())).toHaveLength(
        30,
      );
    });

    const runningJob = runner
      .getJobs()
      .find((job) => job.label === "running-0");

    expect(runningJob).toBeDefined();

    runner.cancel(runningJob!.id);

    // running中なのでcancelされず、Runnerにも残る
    expect(
      runner.getJobs().find((job) => job.id === runningJob!.id),
    ).toBeDefined();

    expect(runningJob!.isRunning()).toBe(true);

    // 枠は空いていないのでpendingは開始されない
    await Promise.resolve();
    await Promise.resolve();

    expect(pendingExecute).not.toHaveBeenCalled();

    // 1件が本当に完了した時点で初めて枠が空く
    controls[0].resolve();
    await runningPromises[0];

    await vi.waitFor(() => {
      expect(pendingExecute).toHaveBeenCalledOnce();
    });

    await expect(pendingPromise).resolves.toBe("pending");

    for (const control of controls.slice(1)) {
      control.resolve();
    }

    await Promise.all(runningPromises);
  });
});

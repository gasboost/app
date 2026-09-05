import { describe, expect, it, vi } from "vitest";
import { AppsScriptJob } from "../src/AppsScriptJob";
import {
  AppsScriptJobQueue,
  type RunnableJob,
} from "../src/AppsScriptJobQueue";

describe("AppsScriptJobQueue", () => {
  it("enqueueするとlistenerにJobを通知してrunする", () => {
    const queue = new AppsScriptJobQueue();

    const listener: RunnableJob = {
      addJob: vi.fn(),
      run: vi.fn(async () => {}),
    };

    queue.subscribe(listener);

    void queue.enqueue("test", async () => "result");

    expect(listener.addJob).toHaveBeenCalledTimes(1);
    expect(listener.run).toHaveBeenCalledTimes(1);

    const job = vi.mocked(listener.addJob).mock.calls[0][0];

    expect(job.label).toBe("test");
    expect(job.status).toBe("pending");
  });

  it("FIFOでdequeueする", () => {
    const queue = new AppsScriptJobQueue();

    void queue.enqueue("first", async () => 1);
    void queue.enqueue("second", async () => 2);
    void queue.enqueue("third", async () => 3);

    expect(queue.dequeue()?.label).toBe("first");
    expect(queue.dequeue()?.label).toBe("second");
    expect(queue.dequeue()?.label).toBe("third");
  });

  it("空のQueueからdequeueするとundefined", () => {
    const queue = new AppsScriptJobQueue();

    expect(queue.dequeue()).toBeUndefined();
  });

  it("複数subscriberすべてに通知する", () => {
    const queue = new AppsScriptJobQueue();

    const first: RunnableJob = {
      addJob: vi.fn(),
      run: vi.fn(async () => {}),
    };

    const second: RunnableJob = {
      addJob: vi.fn(),
      run: vi.fn(async () => {}),
    };

    queue.subscribe(first);
    queue.subscribe(second);

    void queue.enqueue("test", async () => "result");

    expect(first.addJob).toHaveBeenCalledTimes(1);
    expect(second.addJob).toHaveBeenCalledTimes(1);
  });

  it("unsubscribeすると通知されない", () => {
    const queue = new AppsScriptJobQueue();

    const listener: RunnableJob = {
      addJob: vi.fn(),
      run: vi.fn(async () => {}),
    };

    const unsubscribe = queue.subscribe(listener);

    unsubscribe();

    void queue.enqueue("test", async () => "result");

    expect(listener.addJob).not.toHaveBeenCalled();
    expect(listener.run).not.toHaveBeenCalled();
  });

  it("removeすると指定したJobをQueueから削除する", async () => {
    const queue = new AppsScriptJobQueue();

    const jobs: AppsScriptJob<any>[] = [];

    queue.subscribe({
      addJob(job) {
        jobs.push(job);
      },
      run: vi.fn(async () => {}),
    });

    queue.enqueue("first", async () => 1);
    queue.enqueue("second", async () => 2);
    queue.enqueue("third", async () => 3);

    const second = jobs.find((job) => job.label === "second");

    expect(second).toBeDefined();

    queue.remove(second!.id);
    expect(queue.dequeue()?.label).toBe("first");
    expect(queue.dequeue()?.label).toBe("third");
    expect(queue.dequeue()).toBeUndefined();
  });

  it("存在しないJobをremoveしてもQueueを変更しない", () => {
    const queue = new AppsScriptJobQueue();

    void queue.enqueue("first", async () => 1);
    void queue.enqueue("second", async () => 2);

    queue.remove("missing");

    expect(queue.dequeue()?.label).toBe("first");
    expect(queue.dequeue()?.label).toBe("second");
  });
});

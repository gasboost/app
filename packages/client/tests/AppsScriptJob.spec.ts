import { describe, expect, it, vi } from "vitest";
import { AppsScriptJob } from "../src/AppsScriptJob";

describe("AppsScriptJob", () => {
  it("生成直後はpending", () => {
    const resolve = vi.fn();
    const reject = vi.fn();

    const job = new AppsScriptJob(
      "test",
      async () => "result",
      resolve,
      reject,
      "job-1",
      new Date("2026-09-04T00:00:00.000Z"),
    );

    expect(job.id).toBe("job-1");
    expect(job.label).toBe("test");
    expect(job.status).toBe("pending");
    expect(job.isPending()).toBe(true);
    expect(job.isRunning()).toBe(false);
    expect(job.isSuccess()).toBe(false);
    expect(job.isFailed()).toBe(false);
    expect(job.result).toBeNull();
    expect(job.error).toBeNull();
    expect(job.endedAt).toBeNull();
  });

  it("startするとrunningになる", () => {
    const job = new AppsScriptJob(
      "test",
      async () => "result",
      vi.fn(),
      vi.fn(),
    );

    job.start();

    expect(job.status).toBe("running");
    expect(job.isRunning()).toBe(true);
  });

  it("successするとresultを保持してPromiseをresolveする", () => {
    const resolve = vi.fn();

    const job = new AppsScriptJob(
      "test",
      async () => "result",
      resolve,
      vi.fn(),
    );

    job.start();
    job.success("success");

    expect(job.status).toBe("success");
    expect(job.result).toBe("success");
    expect(job.error).toBeNull();
    expect(job.endedAt).toBeInstanceOf(Date);
    expect(resolve).toHaveBeenCalledWith("success");
  });

  it("failするとerrorを保持してPromiseをrejectする", () => {
    const reject = vi.fn();
    const error = new Error("failed");

    const job = new AppsScriptJob(
      "test",
      async () => "result",
      vi.fn(),
      reject,
    );

    job.start();
    job.fail(error);

    expect(job.status).toBe("failed");
    expect(job.error).toBe(error);
    expect(job.endedAt).toBeInstanceOf(Date);
    expect(reject).toHaveBeenCalledWith(error);
  });
});

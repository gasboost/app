import { AppsScriptJob } from "./AppsScriptJob";

export interface RunnableJob {
  run(): Promise<void>;
  addJob<T>(job: AppsScriptJob<T>): void;
}

export class AppsScriptJobQueue {
  private jobs: AppsScriptJob<any>[] = [];
  private listeners: Set<RunnableJob> = new Set();

  public enqueue<T>(label: string, execute: () => Promise<T>): Promise<T> {
    const promise = new Promise<T>((resolve, reject) => {
      // キューにジョブを追加
      const job = new AppsScriptJob<T>(label, execute, resolve, reject);
      this.jobs.push(job);
      this.notify(job);
    });

    return promise;
  }

  public dequeue(): AppsScriptJob<any> | undefined {
    const job = this.jobs.shift();
    if (!job) return undefined;
    return job;
  }

  private notify<T>(job: AppsScriptJob<T>) {
    this.listeners.forEach((listener) => {
      listener.addJob(job);
      listener.run();
    });
  }

  public subscribe(listener: RunnableJob) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  remove(jobId: string) {
    const index = this.jobs.findIndex((job) => job.id === jobId);

    if (index !== -1) {
      this.jobs.splice(index, 1);
    }
  }
}

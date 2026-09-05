import { AppsScriptJob } from "./AppsScriptJob";
import { AppsScriptJobQueue, RunnableJob } from "./AppsScriptJobQueue";

export class AppsScriptJobRunner implements RunnableJob {
  private jobs: AppsScriptJob<any>[] = [];
  private listeners: Set<() => void> = new Set();
  private MAX_CONCURRENT = 30;
  private running = false;

  private snapshot: AppsScriptJob<any>[] | null = null;
  private dirty = true;

  constructor(public readonly queue: AppsScriptJobQueue) {
    this.queue.subscribe(this);
  }

  public addJob<T>(job: AppsScriptJob<T>) {
    this.jobs.push(job);
    this.notify();
  }

  public getJobs() {
    if (this.dirty || !this.snapshot) {
      this.snapshot = [...this.jobs];
      this.dirty = false;
    }
    return this.snapshot;
  }

  public async run(): Promise<void> {
    if (this.running) return;
    this.running = true;

    while (true) {
      const runningCount = this.jobs.filter((j) => j.isRunning()).length;

      if (runningCount >= this.MAX_CONCURRENT) break;

      const job = this.queue.dequeue();
      if (!job) break;

      job.start();
      this.notify();

      job
        .execute()
        .then((result) => {
          job.success(result);
          const index = this.jobs.indexOf(job);
          if (index !== -1) {
            this.jobs.splice(index, 1);
          }
        })
        .catch((error) => {
          job.fail(error);
        })
        .finally(() => {
          this.notify();
          this.running = false;
          this.run();
        });
    }

    this.running = false;
  }

  public remove(jobId: AppsScriptJob<any>["id"]) {
    this.queue.remove(jobId);
    const index = this.jobs.findIndex((job) => job.id === jobId);
    if (index !== -1) {
      this.jobs.splice(index, 1);
      this.notify();
    }
  }

  public retry(jobId: AppsScriptJob<any>["id"]) {
    const job = this.jobs.find((j) => j.id === jobId);
    if (job) {
      this.remove(job.id);
      this.queue.enqueue(job.label, job.execute);
    }
  }

  public subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.dirty = true;
    this.listeners.forEach((listener) => listener());
  }
}

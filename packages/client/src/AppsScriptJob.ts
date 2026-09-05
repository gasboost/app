export class AppsScriptJob<T> {
  private _startedAt: Date | null = null;
  private _endedAt: Date | null = null;
  private _result: T | null = null;
  private _error: unknown | null = null;

  constructor(
    public readonly label: string,
    public readonly execute: () => Promise<T>,
    private resolve: (value: T) => void,
    private reject: (reason?: any) => void,
    public readonly id: string = crypto.randomUUID(),
    public readonly createdAt: Date = new Date(),
  ) {}

  start() {
    this._startedAt = new Date();
  }

  success(result: T) {
    this._endedAt = new Date();
    this._result = result;
    this.resolve(result);
  }

  fail(error: unknown) {
    this._endedAt = new Date();
    this._error = error;
    this.reject(error);
  }

  public get endedAt() {
    return this._endedAt;
  }

  public get result() {
    return this._result;
  }

  public get error() {
    return this._error;
  }

  public isPending() {
    return this._startedAt === null;
  }

  public isRunning() {
    return this._startedAt !== null && this._endedAt === null;
  }

  public isSuccess() {
    return this._endedAt !== null && this._error === null;
  }

  public isFailed() {
    return this._endedAt !== null && this._error !== null;
  }

  public get status() {
    if (this.isPending()) return "pending";
    if (this.isRunning()) return "running";
    if (this.isSuccess()) return "success";
    if (this.isFailed()) return "failed";
    return "unknown";
  }

  public cancel(): boolean {
    if (!this.isPending()) {
      return false;
    }

    const error = new AppsScriptJobCancelledError();
    this.fail(error);

    return true;
  }
}

export class AppsScriptJobCancelledError extends Error {
  constructor() {
    super("Job cancelled");
    this.name = "AppsScriptJobCancelledError";
  }
}

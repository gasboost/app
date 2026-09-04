export class AppsScriptResponse<T> {
  public readonly contents: string;

  constructor(result: T) {
    this.contents = JSON.stringify(result);
  }
}

export class AppsScriptHttpRequest {
  constructor(
    protected event: GoogleAppsScript.Events.AppsScriptHttpRequestEvent,
  ) {}

  public query(): Record<string, string>;
  public query(name: string): string | undefined;

  public query(name?: string): Record<string, string> | string | undefined {
    if (name === undefined) {
      return this.event.parameter;
    }

    return this.event.parameter[name] || undefined;
  }

  public queries(): Record<string, string[]>;
  public queries(name: string): string[] | undefined;
  public queries(
    name?: string,
  ): Record<string, string[]> | string[] | undefined {
    if (name === undefined) {
      return this.event.parameters;
    }

    return this.event.parameters[name] || undefined;
  }
}

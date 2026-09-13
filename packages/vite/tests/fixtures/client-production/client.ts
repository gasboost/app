export class AppsScriptTransport {
  public call(): string {
    return "google.script.run";
  }
}

export function appsScriptClient() {
  return {
    transport: new AppsScriptTransport(),
  };
}

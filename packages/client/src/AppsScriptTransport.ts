import { google } from "./google";
import type { RpcResponse, Transport } from "./Transport";

export class AppsScriptTransport implements Transport {
  public call(name: string, input?: unknown): Promise<RpcResponse> {
    return new Promise((resolve, reject) => {
      const runner = google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject);

      if (input === undefined) {
        runner[name]();
        return;
      }

      runner[name](input);
    });
  }
}

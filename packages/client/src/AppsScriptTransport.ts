import { google } from "./google";
import type { RpcResponse, Transport } from "./Transport";

export class AppsScriptTransport implements Transport {
  public call(name: string, args: unknown[]): Promise<RpcResponse> {
    return new Promise((resolve, reject) => {
      google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        [name](...args);
    });
  }
}

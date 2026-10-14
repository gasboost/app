import type { RpcMetadata } from "./RpcMetadata";
import { google } from "./google";
import type { RpcResponse, Transport } from "./Transport";

export class AppsScriptTransport implements Transport {
  public call(
    name: string,
    input?: unknown,
    metadata?: RpcMetadata,
  ): Promise<RpcResponse> {
    return new Promise((resolve, reject) => {
      const runner = google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject);

      if (metadata !== undefined) {
        // google.script.run requires serializable positional arguments.
        // Preserve null on the server rather than conflating it with explicit null input.
        runner[name](input === undefined ? null : input, metadata);
        return;
      }

      if (input === undefined) {
        runner[name]();
        return;
      }

      runner[name](input);
    });
  }
}

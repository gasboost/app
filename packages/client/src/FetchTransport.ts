import { restoreRpcError } from "./AppsScriptRpcError";
import type { RpcMetadata } from "./RpcMetadata";
import type { RpcResponse, Transport } from "./Transport";

export interface FetchTransportOptions {
  endpoint: string;
}

export class FetchTransport implements Transport {
  public readonly endpoint: string;

  public constructor({ endpoint }: FetchTransportOptions) {
    this.endpoint = endpoint;
  }

  public async call(
    name: string,
    input?: unknown,
    metadata?: RpcMetadata,
  ): Promise<RpcResponse> {
    let response: Response;
    try {
      response = await fetch(
        `${this.endpoint}/${encodeURIComponent(name)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...(input === undefined ? {} : { input }),
            ...(metadata === undefined ? {} : { metadata }),
          }),
        },
      );
    } catch {
      throw restoreRpcError(undefined);
    }

    if (response.ok) {
      try {
        return {
          contents: await response.text(),
        };
      } catch {
        throw restoreRpcError(undefined);
      }
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw restoreRpcError(undefined);
    }
    throw restoreRpcError(
      typeof body === "object" && body !== null && "error" in body
        ? body.error
        : undefined,
      true,
    );
  }
}

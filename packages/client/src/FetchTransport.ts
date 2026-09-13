import type { RpcResponse, Transport } from "./Transport";

export interface FetchTransportOptions {
  endpoint: string;
}

type RpcErrorResponse = {
  error: {
    name: string;
    message: string;
    stack?: string;
  };
};

export class FetchTransport implements Transport {
  public readonly endpoint: string;

  public constructor({ endpoint }: FetchTransportOptions) {
    this.endpoint = endpoint;
  }

  public async call(name: string, args: unknown[]): Promise<RpcResponse> {
    const response = await fetch(
      `${this.endpoint}/${encodeURIComponent(name)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          args,
        }),
      },
    );

    if (response.ok) {
      return {
        contents: await response.text(),
      };
    }

    let body: RpcErrorResponse | undefined;

    try {
      body = (await response.json()) as RpcErrorResponse;
    } catch {
      throw new Error(`RPC request failed with status ${response.status}`);
    }

    if (
      typeof body?.error?.name !== "string" ||
      typeof body.error.message !== "string"
    ) {
      throw new Error(`RPC request failed with status ${response.status}`);
    }

    const error = new Error(body.error.message);

    error.name = body.error.name;

    if (body.error.stack) {
      error.stack = body.error.stack;
    }

    throw error;
  }
}

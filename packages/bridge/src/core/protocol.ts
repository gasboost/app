export const BRIDGE_READY_TYPE = "gasboost:bridge-ready";
export const BRIDGE_REQUEST_TYPE = "gasboost:request";
export const BRIDGE_RESPONSE_TYPE = "gasboost:response";

export type SerializedBridgeError = {
  name: string;
  message: string;
  stack?: string | null;
};

export type BridgeReady = {
  type: typeof BRIDGE_READY_TYPE;
  token: string;
};

export type BridgeRequest = {
  type: typeof BRIDGE_REQUEST_TYPE;
  id: string;
  token: string;
  method: string;
  input?: unknown;
};

export type BridgeSuccessResponse = {
  type: typeof BRIDGE_RESPONSE_TYPE;
  id: string;
  token: string;
  ok: true;
  result: unknown;
};

export type BridgeErrorResponse = {
  type: typeof BRIDGE_RESPONSE_TYPE;
  id: string;
  token: string;
  ok: false;
  error: SerializedBridgeError;
};

export type BridgeResponse = BridgeSuccessResponse | BridgeErrorResponse;

export class BridgeProtocol {
  public static ready(token: string): BridgeReady {
    return {
      type: BRIDGE_READY_TYPE,
      token,
    };
  }

  public static request(
    id: string,
    token: string,
    method: string,
    input?: unknown,
  ): BridgeRequest {
    const request: BridgeRequest = {
      type: BRIDGE_REQUEST_TYPE,
      id,
      token,
      method,
    };

    if (input !== undefined) {
      request.input = input;
    }

    return request;
  }

  public static success(
    id: string,
    token: string,
    result: unknown,
  ): BridgeSuccessResponse {
    return {
      type: BRIDGE_RESPONSE_TYPE,
      id,
      token,
      ok: true,
      result,
    };
  }

  public static failure(
    id: string,
    token: string,
    error: unknown,
  ): BridgeErrorResponse {
    return {
      type: BRIDGE_RESPONSE_TYPE,
      id,
      token,
      ok: false,
      error: BridgeProtocol.serializeError(error),
    };
  }

  public static isReady(data: unknown, token?: string): data is BridgeReady {
    if (
      typeof data !== "object" ||
      data === null ||
      !("type" in data) ||
      !("token" in data)
    ) {
      return false;
    }

    const message = data as Record<string, unknown>;

    return (
      message.type === BRIDGE_READY_TYPE &&
      typeof message.token === "string" &&
      (token === undefined || message.token === token)
    );
  }

  public static isRequest(data: unknown, token?: string): data is BridgeRequest {
    if (
      typeof data !== "object" ||
      data === null ||
      !("type" in data) ||
      !("id" in data) ||
      !("token" in data) ||
      !("method" in data)
    ) {
      return false;
    }

    const message = data as Record<string, unknown>;

    return (
      message.type === BRIDGE_REQUEST_TYPE &&
      typeof message.id === "string" &&
      typeof message.token === "string" &&
      typeof message.method === "string" &&
      (token === undefined || message.token === token)
    );
  }

  public static isResponse(
    data: unknown,
    token?: string,
  ): data is BridgeResponse {
    if (
      typeof data !== "object" ||
      data === null ||
      !("type" in data) ||
      !("id" in data) ||
      !("token" in data) ||
      !("ok" in data)
    ) {
      return false;
    }

    const message = data as Record<string, unknown>;

    if (
      message.type !== BRIDGE_RESPONSE_TYPE ||
      typeof message.id !== "string" ||
      typeof message.token !== "string" ||
      typeof message.ok !== "boolean" ||
      (token !== undefined && message.token !== token)
    ) {
      return false;
    }

    if (message.ok === true) {
      return "result" in message;
    }

    if (
      !("error" in message) ||
      typeof message.error !== "object" ||
      message.error === null
    ) {
      return false;
    }

    const error = message.error as Record<string, unknown>;

    return typeof error.name === "string" && typeof error.message === "string";
  }

  public static serializeError(error: unknown): SerializedBridgeError {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack ?? null,
      };
    }

    return {
      name: "Error",
      message: String(error),
      stack: null,
    };
  }

  public static deserializeError(error: SerializedBridgeError): Error {
    const value = new Error(error.message);
    value.name = error.name;

    if (error.stack) {
      value.stack = error.stack;
    }

    return value;
  }
}

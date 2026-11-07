/** An RPC error whose code and message are safe to disclose to clients. */
export class AppsScriptError extends Error {
  public readonly code: string;

  public constructor({ code, message }: { code: string; message: string }) {
    super(message);
    this.name = "AppsScriptError";
    this.code = code;
  }
}

/** Serialize only explicitly public fields; GAS may discard custom Error properties. */
export function serializeRpcError(cause: unknown): Error {
  const error =
    cause instanceof AppsScriptError &&
    typeof cause.code === "string" &&
    typeof cause.message === "string"
      ? { code: cause.code, message: cause.message }
      : { code: "INTERNAL_ERROR", message: "An unexpected error occurred" };
  const wireError = new Error(`GASBOOST_RPC_ERROR_V1:${JSON.stringify(error)}`);
  // The existing Vite endpoint serializes name/message/stack. Never send a server stack.
  wireError.stack = undefined;
  return wireError;
}

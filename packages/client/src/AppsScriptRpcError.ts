/** Public error thrown by the built-in RPC transports. Codes are application-defined strings. */
export class AppsScriptRpcError extends Error {
  public readonly code: string;

  public constructor({ code, message }: { code: string; message: string }) {
    super(message);
    this.name = "AppsScriptRpcError";
    this.code = code;
  }
}

function isCodedError(
  value: unknown,
): value is { code: string; message: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof value.code === "string" &&
    "message" in value &&
    typeof value.message === "string"
  );
}

/** Accept the HTTP coded contract or the message-only GAS/legacy Vite wire format. */
export function restoreRpcError(
  value: unknown,
  allowCoded = false,
): AppsScriptRpcError {
  if (allowCoded && isCodedError(value)) return new AppsScriptRpcError(value);
  if (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string"
  ) {
    const match =
      /^(?:(?:Error|Exception):\s*)?GASBOOST_RPC_ERROR_V1:([\s\S]*)$/.exec(
        value.message,
      );
    if (match) {
      try {
        const decoded: unknown = JSON.parse(match[1]);
        if (isCodedError(decoded)) return new AppsScriptRpcError(decoded);
      } catch {
        // A malformed or unsupported wire error is never presented verbatim.
      }
    }
  }
  return new AppsScriptRpcError({
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred",
  });
}

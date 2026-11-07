/** Stable codes for bootstrap failures that a caller can act on. */
export const BOOTSTRAP_ERROR_CODES = Object.freeze({
  INVALID_TOKEN: "INVALID_TOKEN",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  ALREADY_INITIALIZED: "ALREADY_INITIALIZED",
  IN_PROGRESS: "IN_PROGRESS",
  LOCKED: "LOCKED",
  LINK_NOT_READY: "LINK_NOT_READY",
} as const);

export type BootstrapErrorCode =
  (typeof BOOTSTRAP_ERROR_CODES)[keyof typeof BOOTSTRAP_ERROR_CODES];

/** Both fields are public: never include tokens, identities or internal state. */
export class BootstrapError extends Error {
  public readonly code: BootstrapErrorCode;

  public constructor({
    code,
    message,
  }: {
    code: BootstrapErrorCode;
    message: string;
  }) {
    super(message);
    this.name = "BootstrapError";
    this.code = code;
  }
}

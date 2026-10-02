export class BridgeDisposedError extends Error {
  public constructor() {
    super("BridgeTransport has been disposed.");
    this.name = "BridgeDisposedError";
  }
}

export class BridgeInitializationTimeoutError extends Error {
  public constructor(timeoutMs: number) {
    super(`Bridge did not become ready within ${timeoutMs}ms.`);
    this.name = "BridgeInitializationTimeoutError";
  }
}

export class BridgeRequestTimeoutError extends Error {
  public constructor(timeoutMs: number) {
    super(`Bridge request did not complete within ${timeoutMs}ms.`);
    this.name = "BridgeRequestTimeoutError";
  }
}

export class BridgeIframeLoadError extends Error {
  public constructor() {
    super("Bridge iframe failed to load.");
    this.name = "BridgeIframeLoadError";
  }
}

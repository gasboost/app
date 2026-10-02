import { BridgeProtocol } from "../core/protocol";

export type AppsScriptBridgeRuntimeCall = (
  method: string,
  input: unknown,
) => Promise<unknown> | unknown;

export interface AppsScriptBridgeRuntimeOptions {
  allowedOrigins: string[];
  token: string;
  call: AppsScriptBridgeRuntimeCall;
  window?: Window;
}

export class AppsScriptBridgeRuntime {
  public readonly allowedOrigins: Set<string>;
  public readonly token: string;
  public readonly call: AppsScriptBridgeRuntimeCall;
  public readonly window: Window;
  public started = false;
  public disposed = false;
  public readonly onMessage: (event: MessageEvent) => void;

  public constructor(options: AppsScriptBridgeRuntimeOptions) {
    this.allowedOrigins = new Set(options.allowedOrigins);
    this.token = options.token;
    this.call = options.call;
    this.window = options.window ?? window;
    this.onMessage = (event) => {
      void this.handleMessage(event);
    };
  }

  public start(): void {
    if (this.started || this.disposed) {
      return;
    }

    this.window.addEventListener("message", this.onMessage);
    this.started = true;

    for (const origin of this.allowedOrigins) {
      this.window.top?.postMessage(BridgeProtocol.ready(this.token), origin);
    }
  }

  public dispose(): void {
    if (!this.started) {
      this.disposed = true;
      return;
    }

    this.window.removeEventListener("message", this.onMessage);
    this.started = false;
    this.disposed = true;
  }

  public async handleMessage(event: MessageEvent): Promise<void> {
    if (
      this.disposed ||
      !this.allowedOrigins.has(event.origin) ||
      !BridgeProtocol.isRequest(event.data, this.token)
    ) {
      return;
    }

    try {
      const result = await this.call(event.data.method, event.data.input);
      this.window.top?.postMessage(
        BridgeProtocol.success(event.data.id, this.token, result),
        event.origin,
      );
    } catch (error) {
      this.window.top?.postMessage(
        BridgeProtocol.failure(event.data.id, this.token, error),
        event.origin,
      );
    }
  }
}

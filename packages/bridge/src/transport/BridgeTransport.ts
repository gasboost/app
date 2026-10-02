import type { RpcResponse, Transport } from "@gasboost/client";
import {
  BridgeDisposedError,
  BridgeIframeLoadError,
  BridgeInitializationTimeoutError,
  BridgeRequestTimeoutError,
} from "../core/errors";
import { BridgeProtocol } from "../core/protocol";

export interface BridgeTransportOptions {
  deploymentId: string;
  readyTimeoutMs?: number;
  requestTimeoutMs?: number;
  iframeTitle?: string;
  window?: Window;
  document?: Document;
  targetOrigin?: string;
}

type PendingRequest = {
  resolve: (response: RpcResponse) => void;
  reject: (error: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export class BridgeTransport implements Transport {
  public readonly deploymentId: string;
  public readonly readyTimeoutMs: number;
  public readonly requestTimeoutMs: number;
  public readonly iframeTitle: string;
  public readonly window: Window;
  public readonly document: Document;
  public readonly targetOrigin: string;
  public readonly token: string;
  public iframe: HTMLIFrameElement | null = null;
  public bridgeWindow: Window | null = null;
  public readyPromise: Promise<void> | null = null;
  public readyResolve: (() => void) | null = null;
  public readyReject: ((error: unknown) => void) | null = null;
  public readyTimeout: ReturnType<typeof setTimeout> | null = null;
  public disposed = false;
  public requestSequence = 0;
  public pending = new Map<string, PendingRequest>();
  public readonly onMessage: (event: MessageEvent) => void;
  public readonly onIframeError: () => void;

  public constructor(options: BridgeTransportOptions) {
    this.deploymentId = options.deploymentId;
    this.readyTimeoutMs = options.readyTimeoutMs ?? 15000;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30000;
    this.iframeTitle = options.iframeTitle ?? "Google Apps Script bridge";
    this.window = options.window ?? window;
    this.document = options.document ?? document;
    this.targetOrigin = options.targetOrigin ?? "*";
    this.token = this.window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    this.onMessage = (event) => {
      this.handleMessage(event);
    };
    this.onIframeError = () => {
      this.handleIframeError();
    };
  }

  public call(name: string, input?: unknown): Promise<RpcResponse> {
    if (this.disposed) {
      return Promise.reject(new BridgeDisposedError());
    }

    return this.start().then(
      () =>
        new Promise<RpcResponse>((resolve, reject) => {
          if (this.disposed || this.bridgeWindow === null) {
            reject(new BridgeDisposedError());
            return;
          }

          const id = `${++this.requestSequence}`;
          const timeout = setTimeout(() => {
            this.pending.delete(id);
            reject(new BridgeRequestTimeoutError(this.requestTimeoutMs));
          }, this.requestTimeoutMs);

          this.pending.set(id, {
            resolve,
            reject,
            timeout,
          });

          this.bridgeWindow.postMessage(
            BridgeProtocol.request(id, this.token, name, input),
            this.targetOrigin,
          );
        }),
    );
  }

  public start(): Promise<void> {
    if (this.disposed) {
      return Promise.reject(new BridgeDisposedError());
    }

    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
      this.window.addEventListener("message", this.onMessage);
      this.readyTimeout = setTimeout(() => {
        this.readyReject?.(
          new BridgeInitializationTimeoutError(this.readyTimeoutMs),
        );
      }, this.readyTimeoutMs);
      this.iframe = this.document.createElement("iframe");
      this.iframe.title = this.iframeTitle;
      this.iframe.hidden = true;
      this.iframe.style.display = "none";
      this.iframe.addEventListener("error", this.onIframeError);
      this.iframe.src = this.webAppUrl();
      this.document.body.appendChild(this.iframe);
    });

    return this.readyPromise;
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.window.removeEventListener("message", this.onMessage);

    if (this.readyTimeout) {
      clearTimeout(this.readyTimeout);
      this.readyTimeout = null;
    }

    this.readyReject?.(new BridgeDisposedError());
    this.readyReject = null;
    this.readyResolve = null;
    this.readyPromise = null;

    for (const request of this.pending.values()) {
      clearTimeout(request.timeout);
      request.reject(new BridgeDisposedError());
    }

    this.pending.clear();

    if (this.iframe) {
      this.iframe.removeEventListener("error", this.onIframeError);
      this.iframe.remove();
      this.iframe = null;
    }

    this.bridgeWindow = null;
  }

  public handleMessage(event: MessageEvent): void {
    if (this.disposed) {
      return;
    }

    if (BridgeProtocol.isReady(event.data, this.token)) {
      this.bridgeWindow = event.source as Window | null;

      if (this.readyTimeout) {
        clearTimeout(this.readyTimeout);
        this.readyTimeout = null;
      }

      this.readyResolve?.();
      this.readyResolve = null;
      this.readyReject = null;
      return;
    }

    if (
      !BridgeProtocol.isResponse(event.data, this.token) ||
      event.source !== this.bridgeWindow
    ) {
      return;
    }

    const request = this.pending.get(event.data.id);

    if (!request) {
      return;
    }

    clearTimeout(request.timeout);
    this.pending.delete(event.data.id);

    if (event.data.ok) {
      if (
        typeof event.data.result === "object" &&
        event.data.result !== null &&
        "contents" in event.data.result &&
        typeof event.data.result.contents === "string"
      ) {
        request.resolve({
          contents: event.data.result.contents,
        });
        return;
      }

      request.resolve({
        contents: JSON.stringify(event.data.result),
      });
      return;
    }

    request.reject(BridgeProtocol.deserializeError(event.data.error));
  }

  public handleIframeError(): void {
    this.readyReject?.(new BridgeIframeLoadError());
  }

  public webAppUrl(): string {
    const url = new URL(
      `https://script.google.com/macros/s/${encodeURIComponent(
        this.deploymentId,
      )}/exec`,
    );
    url.searchParams.set("gasboostBridgeToken", this.token);

    return url.toString();
  }
}

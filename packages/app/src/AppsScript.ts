import { AppsScriptHttpRequest } from "./AppsScriptHttpRequest";
import { AppsScriptPostRequest } from "./AppsScriptPostRequest";

type DoGetHandler = (
  request: AppsScriptHttpRequest,
) => GoogleAppsScript.Content.TextOutput | GoogleAppsScript.HTML.HtmlOutput;

type DoPostHandler = (
  request: AppsScriptPostRequest,
) => GoogleAppsScript.Content.TextOutput | GoogleAppsScript.HTML.HtmlOutput;

type RpcHandler = (...args: any[]) => any;
type RpcMap = Record<string, RpcHandler>;

export class AppsScript<TFunctions extends RpcMap = {}> {
  private doGetHandler: DoGetHandler | null = null;
  private doPostHandler: DoPostHandler | null = null;
  private functions: Record<string, RpcHandler> = {};

  public get(handler: DoGetHandler): this {
    this.doGetHandler = handler;
    return this;
  }

  public post(handler: DoPostHandler): this {
    this.doPostHandler = handler;
    return this;
  }

  public call<TName extends string, THandler extends RpcHandler>(
    name: TName,
    handler: THandler,
  ): AppsScript<TFunctions & Record<TName, THandler>> {
    if (this.functions[name]) {
      throw new Error(`Function ${name} is already registered.`);
    }

    this.functions[name] = handler;

    return this as AppsScript<TFunctions & Record<TName, THandler>>;
  }

  public callGet(event: GoogleAppsScript.Events.AppsScriptHttpRequestEvent) {
    if (!this.doGetHandler) {
      throw new Error("No GET handler registered.");
    }

    return this.doGetHandler(new AppsScriptHttpRequest(event));
  }

  public callPost(event: GoogleAppsScript.Events.DoPost) {
    if (!this.doPostHandler) {
      throw new Error("No POST handler registered.");
    }

    return this.doPostHandler(new AppsScriptPostRequest(event));
  }

  public dispatch(name: string, ...args: unknown[]) {
    const handler = this.functions[name];

    if (!handler) {
      throw new Error(`Function ${name} is not registered.`);
    }

    return handler(...args);
  }
}

export type InferAppsScript<T> =
  T extends AppsScript<infer TFunctions>
    ? {
        [K in keyof TFunctions]: {
          args: Parameters<TFunctions[K]>;
          result: Awaited<ReturnType<TFunctions[K]>>;
        };
      }
    : never;

import { AppsScriptHttpRequest } from "./AppsScriptHttpRequest";
import type { AppsScriptMiddleware } from "./AppsScriptMiddleware";
import { AppsScriptPostRequest } from "./AppsScriptPostRequest";
import { AppsScriptResponse } from "./AppsScriptResponse";
import type { StateMap } from "./AppsScriptState";
import { AppsScriptState } from "./AppsScriptState";

type DoGetHandler = (
  request: AppsScriptHttpRequest,
) => GoogleAppsScript.Content.TextOutput | GoogleAppsScript.HTML.HtmlOutput;

type DoPostHandler = (
  request: AppsScriptPostRequest,
) => GoogleAppsScript.Content.TextOutput | GoogleAppsScript.HTML.HtmlOutput;

type RpcHandler = (...args: any[]) => any;
type RpcMap = Record<string, RpcHandler>;

export class AppsScript<
  TState extends StateMap = {},
  TFunctions extends RpcMap = {},
> {
  public readonly state: AppsScriptState<TState>;

  constructor() {
    this.state = new AppsScriptState<TState>();
  }

  private doGetHandler: DoGetHandler | null = null;
  private doPostHandler: DoPostHandler | null = null;
  private functions: Record<string, RpcHandler> = {};
  private middlewares: AppsScriptMiddleware<TState>[] = [];

  public get(handler: DoGetHandler): this {
    this.doGetHandler = handler;

    (globalThis as Record<string, unknown>).doGet = (
      event: GoogleAppsScript.Events.AppsScriptHttpRequestEvent,
    ) => this.callGet(event);

    return this;
  }

  public post(handler: DoPostHandler): this {
    this.doPostHandler = handler;

    (globalThis as Record<string, unknown>).doPost = (
      event: GoogleAppsScript.Events.DoPost,
    ) => this.callPost(event);

    return this;
  }

  public call<TName extends string, THandler extends RpcHandler>(
    name: TName,
    handler: THandler,
  ): AppsScript<TState, TFunctions & Record<TName, THandler>> {
    if (this.functions[name]) {
      throw new Error(`Function ${name} is already registered.`);
    }

    this.functions[name] = handler;

    (globalThis as Record<string, unknown>)[name] = (...args: unknown[]) =>
      this.dispatch(name, ...args);

    return this as AppsScript<TState, TFunctions & Record<TName, THandler>>;
  }

  public callGet(event: GoogleAppsScript.Events.AppsScriptHttpRequestEvent) {
    if (!this.doGetHandler) {
      throw new Error("No GET handler registered.");
    }

    const getRequest = new AppsScriptHttpRequest(event);
    return this.execute(() => this.doGetHandler!(getRequest));
  }

  public callPost(event: GoogleAppsScript.Events.DoPost) {
    if (!this.doPostHandler) {
      throw new Error("No POST handler registered.");
    }

    const postRequest = new AppsScriptPostRequest(event);
    return this.execute(() => this.doPostHandler!(postRequest));
  }

  public async dispatch(name: string, ...args: unknown[]) {
    const handler = this.functions[name];

    if (!handler) {
      throw new Error(`Function ${name} is not registered.`);
    }

    const result = await this.execute(() => handler(...args));
    return new AppsScriptResponse(result);
  }

  public use(middleware: AppsScriptMiddleware<TState>): this {
    this.middlewares.push(middleware);
    return this;
  }

  private execute<TResult>(handler: () => TResult): TResult {
    let index = -1;

    const next = (currentIndex: number): TResult => {
      if (currentIndex <= index) {
        throw new Error("next() called multiple times.");
      }

      index = currentIndex;

      const middleware = this.middlewares[currentIndex];

      if (!middleware) {
        return handler();
      }

      return middleware(this.state, () => next(currentIndex + 1)) as TResult;
    };

    return next(0);
  }
}

type JsonParsed<T> = T extends Date
  ? string
  : T extends readonly (infer U)[]
    ? JsonParsed<U>[]
    : T extends object
      ? { [K in keyof T]: JsonParsed<T[K]> }
      : T;

export type InferAppsScript<T> =
  T extends AppsScript<infer TState, infer TFunctions>
    ? {
        [K in keyof TFunctions]: {
          args: Parameters<TFunctions[K]>;
          result: JsonParsed<Awaited<ReturnType<TFunctions[K]>>>;
        };
      }
    : never;

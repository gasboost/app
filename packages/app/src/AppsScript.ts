import { AppsScriptContext } from "./AppsScriptContext";
import { AppsScriptHttpRequest } from "./AppsScriptHttpRequest";
import type { AppsScriptInvocation } from "./AppsScriptInvocation";
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

type RpcInput<THandler extends RpcHandler> =
  Parameters<THandler> extends []
    ? undefined
    : Parameters<THandler> extends [infer TInput]
      ? TInput
      : never;

type ValidRpcHandler<THandler extends RpcHandler> =
  Parameters<THandler> extends []
    ? THandler
    : Parameters<THandler> extends [infer TInput]
      ? TInput extends object
        ? THandler
        : never
      : never;

type ValidRpcHandlers<THandlers extends RpcMap> = {
  [K in keyof THandlers]: ValidRpcHandler<THandlers[K]>;
};

export type AppsScriptDescription = {
  readonly hasGet: boolean;
  readonly hasPost: boolean;
  readonly calls: readonly string[];
};

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

  public call<TName extends string, TResult>(
    name: TName,
    handler: () => TResult,
  ): AppsScript<TState, TFunctions & Record<TName, () => TResult>>;

  public call<TName extends string, TInput extends object, TResult>(
    name: TName,
    handler: (input: TInput) => TResult,
  ): AppsScript<TState, TFunctions & Record<TName, (input: TInput) => TResult>>;

  public call(
    name: string,
    handler: RpcHandler,
  ): AppsScript<TState, TFunctions> {
    if (this.functions[name]) {
      throw new Error(`Function ${name} is already registered.`);
    }

    this.functions[name] = handler;

    (globalThis as Record<string, unknown>)[name] = (input?: unknown) =>
      this.dispatch(name, input);

    return this;
  }

  public callGet(event: GoogleAppsScript.Events.AppsScriptHttpRequestEvent) {
    if (!this.doGetHandler) {
      throw new Error("No GET handler registered.");
    }

    const request = new AppsScriptHttpRequest(event);

    return this.execute(
      {
        type: "get",
        request,
      },
      () => this.doGetHandler!(request),
    );
  }

  public callPost(event: GoogleAppsScript.Events.DoPost) {
    if (!this.doPostHandler) {
      throw new Error("No POST handler registered.");
    }

    const request = new AppsScriptPostRequest(event);

    return this.execute(
      {
        type: "post",
        request,
      },
      () => this.doPostHandler!(request),
    );
  }

  public async dispatch(name: string, input?: unknown) {
    const handler = this.functions[name];

    if (!handler) {
      throw new Error(`Function ${name} is not registered.`);
    }

    const result = await this.execute(
      {
        type: "call",
        name,
        input,
      },
      () => (input === undefined ? handler() : handler(input)),
    );

    return new AppsScriptResponse(result);
  }

  public use(middleware: AppsScriptMiddleware<TState>): this {
    this.middlewares.push(middleware);
    return this;
  }

  private execute<TResult>(
    invocation: AppsScriptInvocation,
    handler: () => TResult,
  ): TResult {
    const context = new AppsScriptContext(this.state, invocation);

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

      return middleware(context, () => next(currentIndex + 1)) as TResult;
    };

    return next(0);
  }

  public calls<THandlers extends RpcMap>(
    handlers: THandlers & ValidRpcHandlers<THandlers>,
  ): AppsScript<TState, TFunctions & THandlers> {
    for (const [name, handler] of Object.entries(handlers)) {
      this.call(name, handler as () => unknown);
    }

    return this as AppsScript<TState, TFunctions & THandlers>;
  }

  public describe(): AppsScriptDescription {
    return {
      hasGet: this.doGetHandler !== null,
      hasPost: this.doPostHandler !== null,
      calls: Object.keys(this.functions),
    };
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
          input: RpcInput<TFunctions[K]>;
          result: JsonParsed<Awaited<ReturnType<TFunctions[K]>>>;
        };
      }
    : never;

import { AppsScriptContext } from "./AppsScriptContext";
import { AppsScriptHttpRequest } from "./AppsScriptHttpRequest";
import type { AppsScriptInvocation } from "./AppsScriptInvocation";
import type { AppsScriptMiddleware } from "./AppsScriptMiddleware";
import { AppsScriptPostRequest } from "./AppsScriptPostRequest";
import { AppsScriptResponse } from "./AppsScriptResponse";
import type { StateMap } from "./AppsScriptState";
import { AppsScriptState } from "./AppsScriptState";

type DoGetHandler<
  TState extends StateMap,
  TGuaranteedState extends StateMap,
> = (
  request: AppsScriptHttpRequest,
  context: AppsScriptContext<TState, TGuaranteedState>,
) => GoogleAppsScript.Content.TextOutput | GoogleAppsScript.HTML.HtmlOutput;

type DoPostHandler<
  TState extends StateMap,
  TGuaranteedState extends StateMap,
> = (
  request: AppsScriptPostRequest,
  context: AppsScriptContext<TState, TGuaranteedState>,
) => GoogleAppsScript.Content.TextOutput | GoogleAppsScript.HTML.HtmlOutput;

type RpcHandler = (...args: any[]) => any;
type RpcMap = Record<string, RpcHandler>;

type RpcInput<THandler extends RpcHandler> =
  Parameters<THandler> extends []
    ? undefined
    : Parameters<THandler> extends [infer TInput, ...unknown[]]
      ? TInput extends undefined
        ? undefined
        : TInput
      : never;

type ValidRpcHandler<THandler extends RpcHandler, TContext> =
  Parameters<THandler> extends []
    ? THandler
    : Parameters<THandler> extends [infer TInput]
      ? TInput extends object
        ? THandler
        : never
      : Parameters<THandler> extends [infer TInput, infer THandlerContext]
        ? TContext extends THandlerContext
          ? TInput extends object | undefined
            ? THandler
            : never
          : never
        : never;

type ValidRpcHandlers<THandlers extends RpcMap, TContext> = {
  [K in keyof THandlers]: ValidRpcHandler<THandlers[K], TContext>;
};

export type AppsScriptDescription = {
  readonly hasGet: boolean;
  readonly hasPost: boolean;
  readonly calls: readonly string[];
};

export class AppsScript<
  TState extends StateMap = {},
  TFunctions extends RpcMap = {},
  TGuaranteedState extends StateMap = {},
> {
  private doGetHandler: DoGetHandler<TState, TGuaranteedState> | null = null;
  private doPostHandler: DoPostHandler<TState, TGuaranteedState> | null = null;
  private functions: Record<string, RpcHandler> = {};
  private middlewares: AppsScriptMiddleware<any, any>[] = [];

  public get(handler: DoGetHandler<TState, TGuaranteedState>): this {
    this.doGetHandler = handler;

    (globalThis as Record<string, unknown>).doGet = (
      event: GoogleAppsScript.Events.AppsScriptHttpRequestEvent,
    ) => this.callGet(event);

    return this;
  }

  public post(handler: DoPostHandler<TState, TGuaranteedState>): this {
    this.doPostHandler = handler;

    (globalThis as Record<string, unknown>).doPost = (
      event: GoogleAppsScript.Events.DoPost,
    ) => this.callPost(event);

    return this;
  }

  public call<TName extends string, TResult>(
    name: TName,
    handler: (
      input: undefined,
      context: AppsScriptContext<TState, TGuaranteedState>,
    ) => TResult,
  ): AppsScript<
    TState,
    TFunctions & Record<TName, () => TResult>,
    TGuaranteedState
  >;

  public call<TName extends string, TInput extends object, TResult>(
    name: TName,
    handler: (
      input: TInput,
      context: AppsScriptContext<TState, TGuaranteedState>,
    ) => TResult,
  ): AppsScript<
    TState,
    TFunctions & Record<TName, (input: TInput) => TResult>,
    TGuaranteedState
  >;

  public call(
    name: string,
    handler: RpcHandler,
  ): AppsScript<TState, TFunctions, TGuaranteedState> {
    this.register(name, handler);

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
      (context) => this.doGetHandler!(request, context),
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
      (context) => this.doPostHandler!(request, context),
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
      (context) => handler(input, context),
    );

    return new AppsScriptResponse(result);
  }

  public use(
    middleware: AppsScriptMiddleware<TGuaranteedState, TGuaranteedState>,
  ): this;

  public use<TInputState extends StateMap, TOutputState extends TInputState>(
    middleware: TGuaranteedState extends TInputState
      ? AppsScriptMiddleware<TInputState, TOutputState>
      : never,
  ): AppsScript<
    TState & TOutputState,
    TFunctions,
    TGuaranteedState & TOutputState
  >;

  public use(
    middleware: AppsScriptMiddleware<any, any>,
  ): AppsScript<TState, TFunctions, TGuaranteedState> {
    this.middlewares.push(middleware);

    return this;
  }

  public calls<THandlers extends RpcMap>(
    handlers: THandlers &
      ValidRpcHandlers<THandlers, AppsScriptContext<TState, TGuaranteedState>>,
  ): AppsScript<TState, TFunctions & THandlers, TGuaranteedState> {
    for (const [name, handler] of Object.entries(handlers)) {
      this.register(name, handler);
    }

    return this as AppsScript<TState, TFunctions & THandlers, TGuaranteedState>;
  }

  public describe(): AppsScriptDescription {
    return {
      hasGet: this.doGetHandler !== null,
      hasPost: this.doPostHandler !== null,
      calls: Object.keys(this.functions),
    };
  }

  private register(name: string, handler: RpcHandler): void {
    if (this.functions[name]) {
      throw new Error(`Function ${name} is already registered.`);
    }

    this.functions[name] = handler;

    (globalThis as Record<string, unknown>)[name] = (input?: unknown) =>
      this.dispatch(name, input);
  }

  private execute<TResult>(
    invocation: AppsScriptInvocation,
    handler: (context: AppsScriptContext<TState, TGuaranteedState>) => TResult,
  ): TResult {
    const state = new AppsScriptState<TState, TGuaranteedState>();

    const context = new AppsScriptContext<TState, TGuaranteedState>(
      state,
      invocation,
    );

    let index = -1;

    const next = (currentIndex: number): TResult => {
      if (currentIndex <= index) {
        throw new Error("next() called multiple times.");
      }

      index = currentIndex;

      const middleware = this.middlewares[currentIndex];

      if (!middleware) {
        return handler(context);
      }

      return middleware(context, () => next(currentIndex + 1)) as TResult;
    };

    return next(0);
  }
}

type JsonParsed<T> = T extends Date
  ? string
  : T extends readonly (infer U)[]
    ? JsonParsed<U>[]
    : T extends object
      ? {
          [K in keyof T]: JsonParsed<T[K]>;
        }
      : T;

export type InferAppsScript<T> =
  T extends AppsScript<infer _TState, infer TFunctions, infer _TGuaranteedState>
    ? {
        [K in keyof TFunctions]: {
          input: RpcInput<TFunctions[K]>;
          result: JsonParsed<Awaited<ReturnType<TFunctions[K]>>>;
        };
      }
    : never;

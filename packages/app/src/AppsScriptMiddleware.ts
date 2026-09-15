import type { AppsScriptContext } from "./AppsScriptContext";
import type { StateMap } from "./AppsScriptState";

type Next = () => unknown;

declare const middlewareInputState: unique symbol;
declare const middlewareOutputState: unique symbol;

export type AppsScriptMiddleware<
  TInputState extends StateMap = {},
  TOutputState extends TInputState = TInputState,
> = ((
  context: AppsScriptContext<TInputState & TOutputState, TInputState>,
  next: Next,
) => unknown) & {
  readonly [middlewareInputState]?: (state: TInputState) => TInputState;

  readonly [middlewareOutputState]?: (state: TOutputState) => TOutputState;
};

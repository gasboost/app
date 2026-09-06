import type { AppsScriptState, StateMap } from "./AppsScriptState";

type Next = () => unknown;

export type AppsScriptMiddleware<TState extends StateMap> = (
  state: AppsScriptState<TState>,
  next: Next,
) => unknown;

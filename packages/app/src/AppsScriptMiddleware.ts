import type { AppsScriptContext } from "./AppsScriptContext";
import type { StateMap } from "./AppsScriptState";

type Next = () => unknown;

export type AppsScriptMiddleware<TState extends StateMap> = (
  context: AppsScriptContext<TState>,
  next: Next,
) => unknown;

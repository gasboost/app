import type { AppsScriptInvocation } from "./AppsScriptInvocation";
import type { StateMap } from "./AppsScriptState";
import { AppsScriptState } from "./AppsScriptState";

export class AppsScriptContext<TState extends StateMap = {}> {
  constructor(
    public readonly state: AppsScriptState<TState>,
    public readonly invocation: AppsScriptInvocation,
  ) {}
}

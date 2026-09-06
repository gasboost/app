export type StateMap = Record<string, unknown>;

export class AppsScriptState<TState extends StateMap = {}> {
  private state: Partial<TState> = {};

  public set<TKey extends keyof TState>(key: TKey, value: TState[TKey]): void {
    this.state[key] = value;
  }

  public get<TKey extends keyof TState>(key: TKey): TState[TKey] | undefined {
    return this.state[key];
  }
}

export type StateMap = Record<string, unknown>;

type GuaranteedKey<
  TState extends StateMap,
  TGuaranteedState extends StateMap,
> = Extract<keyof TState, keyof TGuaranteedState>;

type OptionalKey<
  TState extends StateMap,
  TGuaranteedState extends StateMap,
> = Exclude<keyof TState, keyof TGuaranteedState>;

export class AppsScriptState<
  TState extends StateMap = {},
  TGuaranteedState extends StateMap = {},
> {
  private state: Partial<TState> = {};

  public set<TKey extends keyof TState>(key: TKey, value: TState[TKey]): void {
    this.state[key] = value;
  }

  public get<TKey extends GuaranteedKey<TState, TGuaranteedState>>(
    key: TKey,
  ): TState[TKey];

  public get<TKey extends OptionalKey<TState, TGuaranteedState>>(
    key: TKey,
  ): TState[TKey] | undefined;

  public get<TKey extends keyof TState>(key: TKey): TState[TKey] | undefined {
    return this.state[key];
  }
}

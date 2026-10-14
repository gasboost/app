export type TokenProvider = () => string | null;

export type AuthenticatedMethod<TClient> = {
  [K in keyof TClient]: TClient[K] extends (
    input: infer TInput,
  ) => Promise<unknown>
    ? [TInput] extends [{ token: string }]
      ? K
      : never
    : never;
}[keyof TClient] &
  string;

type WithoutToken<T> = T extends unknown ? Omit<T, "token"> : never;

export type AuthenticatedClient<
  TClient,
  TMethod extends AuthenticatedMethod<TClient>,
> = {
  [K in keyof TClient]: K extends TMethod
    ? TClient[K] extends (input: infer TInput) => infer TResult
      ? (input: WithoutToken<TInput>) => TResult
      : TClient[K]
    : TClient[K];
};

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("A session token is required for this RPC.");
    this.name = "AuthenticationRequiredError";
  }
}

/** Input types are erased at runtime, so authenticated RPC names are explicit. */
export function createAuthenticatedClient<
  TClient extends object,
  const TMethod extends AuthenticatedMethod<TClient>,
>(
  client: TClient,
  tokenProvider: TokenProvider,
  authenticatedMethods: readonly TMethod[],
): AuthenticatedClient<TClient, TMethod> {
  const methods = new Set<string>(authenticatedMethods);
  const wrappers = new Map<PropertyKey, unknown>();
  return new Proxy(client, {
    get(target, property, receiver) {
      if (typeof property !== "string" || !methods.has(property)) {
        return Reflect.get(target, property, receiver);
      }
      if (!wrappers.has(property)) {
        wrappers.set(property, async (input: object) => {
          const token = tokenProvider();
          if (!token) throw new AuthenticationRequiredError();
          const execute = Reflect.get(target, property) as (
            input: object,
          ) => Promise<unknown>;
          return execute.call(target, { ...input, token });
        });
      }
      return wrappers.get(property);
    },
  }) as AuthenticatedClient<TClient, TMethod>;
}

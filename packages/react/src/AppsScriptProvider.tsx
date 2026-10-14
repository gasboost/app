import {
  createAuthenticatedClient,
  type AuthenticatedClient,
  type AuthenticatedMethod,
} from "@gasboost/client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAuthTokenProvider } from "./AuthProvider";

const AppsScriptContext = createContext<object | null>(null);

export interface AppsScriptProviderProps<
  TClient extends object,
  TMethod extends AuthenticatedMethod<TClient>,
> {
  client: TClient;
  authenticatedMethods: readonly TMethod[];
  children: ReactNode;
}

export function AppsScriptProvider<
  TClient extends object,
  const TMethod extends AuthenticatedMethod<TClient>,
>({
  client,
  authenticatedMethods,
  children,
}: AppsScriptProviderProps<TClient, TMethod>) {
  const getToken = useAuthTokenProvider();
  const value = useMemo(
    () => createAuthenticatedClient(client, getToken, authenticatedMethods),
    [client, getToken, authenticatedMethods],
  );
  return (
    <AppsScriptContext.Provider value={value}>
      {children}
    </AppsScriptContext.Provider>
  );
}

/** Context cannot infer the backend contract; supply the typed client explicitly. */
export function useAppsScript<
  TClient extends object,
  TMethod extends AuthenticatedMethod<TClient> = never,
>(): AuthenticatedClient<TClient, TMethod> {
  const client = useContext(AppsScriptContext);
  if (!client)
    throw new Error("useAppsScript must be used within AppsScriptProvider.");
  return client as AuthenticatedClient<TClient, TMethod>;
}

/** Bind a client contract once so consumers can call useAppsScript() without generics. */
export function createAppsScriptContext<
  TClient extends object,
  const TMethod extends AuthenticatedMethod<TClient>,
>(client: TClient, authenticatedMethods: readonly TMethod[]) {
  const Context = createContext<AuthenticatedClient<TClient, TMethod> | null>(
    null,
  );

  function Provider({ children }: { children: ReactNode }) {
    const getToken = useAuthTokenProvider();
    const value = useMemo(
      () => createAuthenticatedClient(client, getToken, authenticatedMethods),
      [getToken],
    );
    return <Context.Provider value={value}>{children}</Context.Provider>;
  }

  function useClient(): AuthenticatedClient<TClient, TMethod> {
    const value = useContext(Context);
    if (!value)
      throw new Error(
        "useAppsScript must be used within its AppsScriptProvider.",
      );
    return value;
  }

  return { AppsScriptProvider: Provider, useAppsScript: useClient };
}

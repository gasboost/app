import { withMetadataProviders, type MetadataProvider } from "@gasboost/client";
import { createContext, useContext, useMemo, type ReactNode } from "react";

const AppsScriptContext = createContext<object | null>(null);
const NO_METADATA_PROVIDERS: readonly MetadataProvider[] = [];

export interface AppsScriptProviderProps<TClient extends object> {
  client: TClient;
  metadataProviders?: readonly MetadataProvider[];
  children: ReactNode;
}

function useProvidedClient<TClient extends object>(
  client: TClient,
  providers: readonly MetadataProvider[],
): TClient {
  return useMemo(
    () =>
      providers.length === 0
        ? client
        : withMetadataProviders(client, providers),
    [client, providers],
  );
}

export function AppsScriptProvider<TClient extends object>({
  client,
  metadataProviders = NO_METADATA_PROVIDERS,
  children,
}: AppsScriptProviderProps<TClient>) {
  const value = useProvidedClient(client, metadataProviders);
  return (
    <AppsScriptContext.Provider value={value}>
      {children}
    </AppsScriptContext.Provider>
  );
}

export function useAppsScript<TClient extends object>(): TClient {
  const client = useContext(AppsScriptContext);
  if (!client)
    throw new Error("useAppsScript must be used within AppsScriptProvider.");
  return client as TClient;
}

/** Bind the client contract once so consumers can call useAppsScript() without generics. */
export function createAppsScriptContext<TClient extends object>(
  client: TClient,
) {
  const Context = createContext<TClient | null>(null);

  function Provider({
    children,
    metadataProviders = NO_METADATA_PROVIDERS,
  }: Omit<AppsScriptProviderProps<TClient>, "client">) {
    const value = useProvidedClient(client, metadataProviders);
    return <Context.Provider value={value}>{children}</Context.Provider>;
  }

  function useClient(): TClient {
    const value = useContext(Context);
    if (!value)
      throw new Error(
        "useAppsScript must be used within its AppsScriptProvider.",
      );
    return value;
  }

  return { AppsScriptProvider: Provider, useAppsScript: useClient };
}

import type { AuthClient, AuthSession } from "@gasboost/auth-client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

type Client = AuthClient<AuthSession, never, never>;
type Actions<TClient> = {
  [K in keyof TClient as TClient[K] extends (...args: never[]) => Promise<unknown>
    ? K
    : never]: TClient[K];
};

/** Bind a framework-independent AuthClient to its own React context. */
export function createAuthContext<TClient extends Client>(auth: TClient) {
  type Value = ReturnType<TClient["getState"]> & Actions<TClient> & {
    isLoading: boolean;
    error: unknown;
  };
  const Context = createContext<Value | null>(null);
  // Concurrent mounts (including StrictMode) share the initial restore request.
  let restoration: Promise<unknown> | undefined;
  const restore = () => {
    restoration ??= auth.restoreSession().finally(() => {
      restoration = undefined;
    });
    return restoration;
  };
  const subscribe = (listener: () => void) => auth.subscribe(listener);
  const getSnapshot = () => auth.getState() as ReturnType<TClient["getState"]>;

  function AuthProvider({ children }: { children: ReactNode }) {
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    const [pending, setPending] = useState(0);
    const [isRestoring, setRestoring] = useState(true);
    const [error, setError] = useState<unknown>(null);
    const run = useCallback(async (operation: () => Promise<unknown>) => {
      setPending((count) => count + 1);
      setError(null);
      try {
        return await operation();
      } catch (cause) {
        setError(cause);
        throw cause;
      } finally {
        setPending((count) => count - 1);
      }
    }, []);

    const actions = useMemo(() => {
      // The root contract owns these four async actions. Additional async actions
      // are forwarded without knowing transport-specific names or signatures.
      const stateMethods = new Set([
        "getState",
        "getSession",
        "getUser",
        "getToken",
        "subscribe",
      ]);
      return Object.fromEntries(
        Object.entries(auth)
          .filter(([key, method]) =>
            !stateMethods.has(key) && typeof method === "function",
          )
          .map(([key, method]) => {
            const action = method as (...args: unknown[]) => Promise<unknown>;
            return [key, (...args: unknown[]) => run(() => action.apply(auth, args))];
          }),
      ) as Actions<TClient>;
    }, [run]);

    useEffect(() => {
      let active = true;
      void run(restore)
        .catch(() => {
          // The error is exposed through context.
        })
        .finally(() => {
          if (active) setRestoring(false);
        });
      return () => {
        active = false;
      };
    }, [run]);

    const value = useMemo(
      () => ({ ...snapshot, ...actions, isLoading: isRestoring || pending > 0, error }),
      [snapshot, actions, isRestoring, pending, error],
    );
    return <Context.Provider value={value}>{children}</Context.Provider>;
  }

  function useAuth(): Value {
    const value = useContext(Context);
    if (!value) throw new Error("useAuth must be used within its AuthProvider.");
    return value;
  }

  return { AuthProvider, useAuth };
}

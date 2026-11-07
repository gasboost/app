import type { AuthClient, AuthSession } from "@gasboost/auth-client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
    isSessionRestoreFailed: boolean;
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
  const getSnapshot = () => auth.getState() as ReturnType<TClient["getState"]>;

  function AuthProvider({ children }: { children: ReactNode }) {
    const [pending, setPending] = useState(0);
    const [isRestoring, setRestoring] = useState(true);
    const [error, setError] = useState<unknown>(null);
    const [isSessionRestoreFailed, setSessionRestoreFailed] = useState(false);
    const revision = useRef(0);
    const subscribe = useCallback((listener: () => void) => auth.subscribe(() => {
      // AuthClient only publishes committed states. A superseded action can
      // resolve without committing, so its Promise cannot clear a restore failure.
      ++revision.current;
      setSessionRestoreFailed(false);
      listener();
    }), []);
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    const run = useCallback(async (operation: () => Promise<unknown>, action: string) => {
      const isRestore = action === "restoreSession";
      const current = isRestore ? ++revision.current : revision.current;
      setPending((count) => count + 1);
      setError(null);
      try {
        return await operation();
      } catch (cause) {
        // A superseded restore must not invalidate a newer authentication result.
        if (isRestore && current === revision.current) setSessionRestoreFailed(true);
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
            return [key, (...args: unknown[]) => run(() => action.apply(auth, args), key)];
          }),
      ) as Actions<TClient>;
    }, [run]);

    useEffect(() => {
      let active = true;
      void run(restore, "restoreSession")
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
      () => ({ ...snapshot, ...actions, isLoading: isRestoring || pending > 0, isSessionRestoreFailed, error }),
      [snapshot, actions, isRestoring, pending, isSessionRestoreFailed, error],
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

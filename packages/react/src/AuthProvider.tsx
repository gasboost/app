import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createMemoryAuthStorage, type AuthStorage } from "./AuthStorage";

export interface AuthSession<TUser> {
  user: TUser;
  token: string;
}

export interface AuthAdapter<TUser, TCredentials> {
  signIn(credentials: TCredentials): Promise<AuthSession<TUser>>;
  /** Validate the saved token and return the current user, or null if expired. */
  restoreSession(token: string): Promise<TUser | null>;
  signOut?(token: string): Promise<void>;
}

export interface AuthState<TUser, TCredentials> {
  user: TUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: unknown;
  signIn(credentials: TCredentials): Promise<void>;
  signOut(): Promise<void>;
}

export interface AuthProviderProps<TUser, TCredentials> {
  adapter: AuthAdapter<TUser, TCredentials>;
  storage?: AuthStorage;
  children: ReactNode;
}

const AuthContext = createContext<AuthState<unknown, unknown> | null>(null);
const AuthTokenContext = createContext<(() => string | null) | null>(null);

export function AuthProvider<TUser, TCredentials>({
  adapter,
  storage,
  children,
}: AuthProviderProps<TUser, TCredentials>) {
  const [memory] = useState(createMemoryAuthStorage);
  const activeStorage = storage ?? memory;
  const [session, setSession] = useState<AuthSession<TUser> | null>(null);
  const sessionRef = useRef(session);
  const revision = useRef(0);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const updateSession = useCallback((value: AuthSession<TUser> | null) => {
    sessionRef.current = value;
    setSession(value);
  }, []);

  useEffect(() => {
    const current = ++revision.current;
    updateSession(null);
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const token = activeStorage.get();
        if (!token) return;
        const user = await adapter.restoreSession(token);
        if (revision.current !== current) return;
        if (user === null) activeStorage.remove();
        else updateSession({ user, token });
      } catch (cause) {
        if (revision.current === current) setError(cause);
      } finally {
        if (revision.current === current) setLoading(false);
      }
    })();
    return () => {
      ++revision.current;
    };
  }, [adapter, activeStorage, updateSession]);

  const signIn = useCallback(
    async (credentials: TCredentials) => {
      const current = ++revision.current;
      setLoading(true);
      setError(null);
      try {
        const next = await adapter.signIn(credentials);
        if (revision.current !== current) return;
        if (!next.token)
          throw new Error("signIn must return a non-empty session token.");
        activeStorage.set(next.token);
        updateSession(next);
      } catch (cause) {
        if (revision.current === current) setError(cause);
        throw cause;
      } finally {
        if (revision.current === current) setLoading(false);
      }
    },
    [adapter, activeStorage, updateSession],
  );

  const signOut = useCallback(async () => {
    ++revision.current;
    const token = sessionRef.current?.token;
    updateSession(null);
    setLoading(false);
    setError(null);
    activeStorage.remove();
    if (token) await adapter.signOut?.(token);
  }, [adapter, activeStorage, updateSession]);

  const getToken = useCallback(() => sessionRef.current?.token ?? null, []);

  const value = useMemo(
    () => ({
      user: session?.user ?? null,
      token: session?.token ?? null,
      isAuthenticated: session !== null,
      isLoading,
      error,
      signIn,
      signOut,
    }),
    [session, isLoading, error, signIn, signOut],
  );

  return (
    <AuthContext.Provider value={value as AuthState<unknown, unknown>}>
      <AuthTokenContext.Provider value={getToken}>
        {children}
      </AuthTokenContext.Provider>
    </AuthContext.Provider>
  );
}

export function useAuth<TUser = unknown, TCredentials = unknown>(): AuthState<
  TUser,
  TCredentials
> {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider.");
  return value as AuthState<TUser, TCredentials>;
}

// Internal bridge: read committed session changes immediately, including before a rerender.
export function useAuthTokenProvider(): () => string | null {
  const getToken = useContext(AuthTokenContext);
  if (!getToken)
    throw new Error("AppsScriptProvider must be used within AuthProvider.");
  return getToken;
}

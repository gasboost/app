import { StrictMode, type ReactNode } from "react";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  AuthProvider,
  useAuth,
  AppsScriptProvider,
  useAppsScript,
  createAppsScriptContext,
  createMemoryAuthStorage,
  memoryAuthStorage,
  localStorageAuthStorage,
  sessionStorageAuthStorage,
  type AuthAdapter,
  type AuthStorage,
} from "../src/index";

type User = { name: string };
const user = { name: "Taro" };
function adapter(): AuthAdapter<User, string> {
  return {
    signIn: vi.fn(async (token) => ({ user, token })),
    restoreSession: vi.fn(async () => user),
    signOut: vi.fn(async () => {}),
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function mount(auth = adapter(), storage?: AuthStorage) {
  return renderHook(() => useAuth<User, string>(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <AuthProvider adapter={auth} storage={storage}>
        {children}
      </AuthProvider>
    ),
  });
}

describe("AuthProvider", () => {
  it("manages authentication and persists/removes tokens with custom storage", async () => {
    const storage = createMemoryAuthStorage();
    const auth = adapter();
    const { result } = mount(auth, storage);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current).not.toHaveProperty("client");
    await act(() => result.current.signIn("token"));
    expect(result.current.user).toEqual(user);
    expect(result.current.token).toBe("token");
    expect(result.current.isAuthenticated).toBe(true);
    expect(storage.get()).toBe("token");
    await act(() => result.current.signOut());
    expect(storage.get()).toBeNull();
    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
    expect(auth.signOut).toHaveBeenCalledWith("token");
  });

  it("restores and validates saved tokens in StrictMode", async () => {
    const storage = createMemoryAuthStorage();
    storage.set("saved");
    const auth = adapter();
    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <StrictMode>
          <AuthProvider adapter={auth} storage={storage}>
            {children}
          </AuthProvider>
        </StrictMode>
      ),
    });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    expect(result.current.token).toBe("saved");
    expect(auth.restoreSession).toHaveBeenCalledWith("saved");
  });

  it("removes expired sessions and reports restoration failures", async () => {
    const storage = createMemoryAuthStorage();
    storage.set("expired");
    const auth = adapter();
    auth.restoreSession = vi.fn(async () => null);
    const { result, unmount } = mount(auth, storage);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(storage.get()).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    unmount();
    const error = new Error("offline");
    storage.set("saved");
    auth.restoreSession = vi.fn(async () => {
      throw error;
    });
    const failed = mount(auth, storage);
    await waitFor(() => expect(failed.result.current.error).toBe(error));
    expect(failed.result.current.token).toBeNull();
    expect(storage.get()).toBe("saved");
  });

  it("defaults to isolated memory storage for each provider", async () => {
    const first = mount();
    const second = mount();
    await act(() => first.result.current.signIn("first"));
    expect(first.result.current.token).toBe("first");
    expect(second.result.current.token).toBeNull();
    first.unmount();
    const next = mount();
    expect(next.result.current.token).toBeNull();
  });

  it("does not resurrect a session after signOut during restore or signIn", async () => {
    const storage = createMemoryAuthStorage();
    storage.set("saved");
    const pending = deferred<User | null>();
    const auth = adapter();
    auth.restoreSession = () => pending.promise;
    const { result } = mount(auth, storage);
    await act(() => result.current.signOut());
    await act(async () => pending.resolve(user));
    expect(result.current.token).toBeNull();
    const login = deferred<{ user: User; token: string }>();
    auth.signIn = () => login.promise;
    let completion!: Promise<void>;
    act(() => {
      completion = result.current.signIn("new");
    });
    await act(() => result.current.signOut());
    await act(async () => {
      login.resolve({ user, token: "new" });
      await completion;
    });
    expect(result.current.token).toBeNull();
    expect(storage.get()).toBeNull();
  });

  it("preserves a session when signIn fails and clears locally if backend signOut fails", async () => {
    const auth = adapter();
    const storage = createMemoryAuthStorage();
    const { result } = mount(auth, storage);
    await act(() => result.current.signIn("valid"));
    const error = new Error("failed");
    auth.signIn = async () => {
      throw error;
    };
    await act(async () => {
      await expect(result.current.signIn("bad")).rejects.toBe(error);
    });
    expect(result.current.token).toBe("valid");
    auth.signOut = async () => {
      throw error;
    };
    await act(async () => {
      await expect(result.current.signOut()).rejects.toBe(error);
    });
    expect(result.current.token).toBeNull();
    expect(storage.get()).toBeNull();
  });
});

describe("AuthStorage", () => {
  for (const [name, storage] of Object.entries({
    memoryAuthStorage,
    localStorageAuthStorage,
    sessionStorageAuthStorage,
  })) {
    it(`${name} stores and removes tokens`, () => {
      storage.remove();
      expect(storage.get()).toBeNull();
      storage.set("token");
      expect(storage.get()).toBe("token");
      storage.remove();
      expect(storage.get()).toBeNull();
    });
  }
});

describe("AppsScriptProvider", () => {
  it("reuses the client and reads the latest token after signIn/signOut", async () => {
    const client = {
      create: vi.fn(async (_input: { token: string; name: string }) => 1),
      public: vi.fn(async (_input: { name: string }) => "public"),
    };
    const methods = ["create"] as const;
    const auth = adapter();
    const { result } = renderHook(
      () => ({
        auth: useAuth<User, string>(),
        client: useAppsScript<typeof client, "create">(),
      }),
      {
        wrapper: ({ children }) => (
          <AuthProvider adapter={auth}>
            <AppsScriptProvider client={client} authenticatedMethods={methods}>
              {children}
            </AppsScriptProvider>
          </AuthProvider>
        ),
      },
    );
    const savedClient = result.current.client;
    await savedClient.public({ name: "Taro" });
    expect(client.public).toHaveBeenCalledWith({ name: "Taro" });
    await expect(savedClient.create({ name: "Taro" })).rejects.toThrow(
      "session token",
    );
    await act(() => result.current.auth.signIn("first"));
    expect(result.current.client).toBe(savedClient);
    await savedClient.create({ name: "Taro" });
    expect(client.create).toHaveBeenLastCalledWith({
      name: "Taro",
      token: "first",
    });
    await act(() => result.current.auth.signIn("second"));
    await savedClient.create({ name: "Taro" });
    expect(client.create).toHaveBeenLastCalledWith({
      name: "Taro",
      token: "second",
    });
    await act(() => result.current.auth.signOut());
    await expect(savedClient.create({ name: "Taro" })).rejects.toThrow(
      "session token",
    );
    expect(client.create).toHaveBeenCalledTimes(2);
  });

  it("requires the corresponding providers", () => {
    expect(() => renderHook(() => useAuth())).toThrow("AuthProvider");
    expect(() => renderHook(() => useAppsScript<object>())).toThrow(
      "AppsScriptProvider",
    );
  });
});

it("binds types and keeps separate Apps Script contexts isolated", async () => {
  const first = {
    call: vi.fn(async (_input: { token: string; value: number }) => 1),
  };
  const second = {
    call: vi.fn(async (_input: { token: string; value: number }) => 2),
  };
  const a = createAppsScriptContext(first, ["call"]);
  const b = createAppsScriptContext(second, ["call"]);
  const auth = adapter();
  const { result } = renderHook(
    () => ({
      auth: useAuth<User, string>(),
      a: a.useAppsScript(),
      b: b.useAppsScript(),
    }),
    {
      wrapper: ({ children }) => (
        <AuthProvider adapter={auth}>
          <a.AppsScriptProvider>
            <b.AppsScriptProvider>{children}</b.AppsScriptProvider>
          </a.AppsScriptProvider>
        </AuthProvider>
      ),
    },
  );
  await act(() => result.current.auth.signIn("token"));
  expect(await result.current.a.call({ value: 1 })).toBe(1);
  expect(await result.current.b.call({ value: 2 })).toBe(2);
  expect(first.call).toHaveBeenCalledWith({ value: 1, token: "token" });
  expect(second.call).toHaveBeenCalledWith({ value: 2, token: "token" });
  if (false) {
    // @ts-expect-error Business input is required on the bound hook
    result.current.a.call({});
    // @ts-expect-error Caller token is not exposed
    result.current.a.call({ value: 1, token: "caller" });
  }
});

it("updates an already-held client immediately before React rerenders", async () => {
  const client = { call: vi.fn(async (_input: { token: string }) => 1) };
  const binding = createAppsScriptContext(client, ["call"]);
  const auth = adapter();
  const { result } = renderHook(
    () => ({ auth: useAuth<User, string>(), client: binding.useAppsScript() }),
    {
      wrapper: ({ children }) => (
        <AuthProvider adapter={auth}>
          <binding.AppsScriptProvider>{children}</binding.AppsScriptProvider>
        </AuthProvider>
      ),
    },
  );
  const held = result.current;
  await act(async () => {
    await held.auth.signIn("new");
    await held.client.call({});
    expect(client.call).toHaveBeenCalledWith({ token: "new" });
    await held.auth.signOut();
    await expect(held.client.call({})).rejects.toThrow("session token");
  });
});

it("ignores out-of-order signIn and signIn completion after unmount", async () => {
  const storage = createMemoryAuthStorage();
  const first = deferred<{ user: User; token: string }>();
  const second = deferred<{ user: User; token: string }>();
  const auth = adapter();
  auth.signIn = (value) => (value === "first" ? first.promise : second.promise);
  const { result, unmount } = mount(auth, storage);
  let a!: Promise<void>;
  let b!: Promise<void>;
  act(() => {
    a = result.current.signIn("first");
    b = result.current.signIn("second");
  });
  await act(async () => {
    second.resolve({ user, token: "second" });
    await b;
  });
  await act(async () => {
    first.resolve({ user, token: "first" });
    await a;
  });
  expect(storage.get()).toBe("second");
  expect(result.current.token).toBe("second");
  const pending = deferred<{ user: User; token: string }>();
  auth.signIn = () => pending.promise;
  let completion!: Promise<void>;
  act(() => {
    completion = result.current.signIn("unmounted");
  });
  unmount();
  pending.resolve({ user, token: "unmounted" });
  await completion;
  expect(storage.get()).toBe("second");
});

it("handles denied storage without publishing a session", async () => {
  const error = new Error("storage denied");
  const storage: AuthStorage = {
    get: () => {
      throw error;
    },
    set: () => {
      throw error;
    },
    remove: () => {
      throw error;
    },
  };
  const { result } = mount(adapter(), storage);
  await waitFor(() => expect(result.current.error).toBe(error));
  await act(async () => {
    await expect(result.current.signIn("token")).rejects.toBe(error);
  });
  expect(result.current.isAuthenticated).toBe(false);
  expect(result.current.token).toBeNull();
});

it("ignores old restoration when the storage prop changes", async () => {
  const old = createMemoryAuthStorage();
  old.set("old");
  const next = createMemoryAuthStorage();
  next.set("next");
  const pending = deferred<User | null>();
  const auth = adapter();
  auth.restoreSession = (token) =>
    token === "old" ? pending.promise : Promise.resolve({ name: "Next" });
  let token: string | null = null;
  function Probe() {
    token = useAuth().token;
    return null;
  }
  const { rerender } = render(
    <AuthProvider adapter={auth} storage={old}>
      <Probe />
    </AuthProvider>,
  );
  rerender(
    <AuthProvider adapter={auth} storage={next}>
      <Probe />
    </AuthProvider>,
  );
  await waitFor(() => expect(token).toBe("next"));
  await act(async () => pending.resolve(user));
  expect(token).toBe("next");
});

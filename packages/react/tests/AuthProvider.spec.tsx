import { authClient, memoryAuthStorage, type AuthRemote, type AuthSession } from "@gasboost/auth-client";
import { appsScriptAuth } from "@gasboost/auth-client/appsscript";
import { StrictMode, type ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { createAuthContext } from "../src/index";

type Session = AuthSession<{ name: string }> & { role: string };
type Credentials = { email: string; password: string };
type Registration = Credentials & { name: string };
const session: Session = { token: "token", user: { name: "Taro" }, role: "admin" };
const credentials: Credentials = { email: "taro@example.com", password: "secret" };
function setup() {
  const remote: AuthRemote<Session, Credentials, Registration> = {
    signIn: vi.fn(async () => session),
    signUp: vi.fn(async () => session),
    signOut: vi.fn(async () => {}),
    getSession: vi.fn(async () => session),
  };
  const storage = memoryAuthStorage();
  const auth = authClient({ remote, storage });
  const context = createAuthContext(auth);
  return { remote, storage, auth, ...context };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function mount(context = setup()) {
  const hook = renderHook(context.useAuth, { wrapper: context.AuthProvider });
  return { ...context, ...hook };
}

describe("createAuthContext", () => {
  it("infers session, credentials, registration and action results from the client", async () => {
    const { result, remote } = mount();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expectTypeOf(result.current.user).toEqualTypeOf<{ name: string } | null>();
    expectTypeOf(result.current.session).toEqualTypeOf<Session | null>();
    expectTypeOf(result.current.signIn).parameter(0).toEqualTypeOf<Credentials>();
    expectTypeOf(result.current.signUp).parameter(0).toEqualTypeOf<Registration>();
    expectTypeOf(result.current.signIn).returns.toEqualTypeOf<Promise<Session>>();
    let returned: Session | undefined;
    await act(async () => { returned = await result.current.signIn(credentials); });
    expect(returned).toBe(session);
    expect(remote.signIn).toHaveBeenCalledWith(credentials);
    expect(result.current.session).toBe(session);
    expect(result.current.user).toBe(session.user);
    expect(result.current.isAuthenticated).toBe(true);
    await act(() => result.current.signUp({ ...credentials, name: "Taro" }));
    expect(remote.signUp).toHaveBeenCalledWith({ ...credentials, name: "Taro" });
    await act(() => result.current.signOut());
    expect(result.current.isAuthenticated).toBe(false);
  });

  it("subscribes to external client changes and unsubscribes on unmount", async () => {
    const context = setup();
    const unsubscribe = vi.fn();
    const original = context.auth.subscribe;
    const subscribe = vi.spyOn(context.auth, "subscribe").mockImplementation((listener) => {
      const stop = original(listener);
      return () => { unsubscribe(); stop(); };
    });
    const { result, unmount } = mount(context);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(() => context.auth.signIn(credentials));
    expect(result.current.session).toBe(context.auth.getState().session);
    expect(subscribe).toHaveBeenCalledTimes(1);
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    // React unmount does not dispose the shared framework-independent client.
    await context.auth.signOut();
    expect(context.auth.getState().session).toBeNull();
  });

  it("delegates initial restore and shares in-flight restoration in StrictMode", async () => {
    const context = setup();
    context.storage.set("saved");
    const pending = deferred<Session | null>();
    context.remote.getSession = vi.fn(() => pending.promise);
    const { result } = renderHook(context.useAuth, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <StrictMode><context.AuthProvider>{children}</context.AuthProvider></StrictMode>
      ),
    });
    expect(result.current.isLoading).toBe(true);
    expect(context.remote.getSession).toHaveBeenCalledTimes(1);
    expect(context.remote.getSession).toHaveBeenCalledWith("saved");
    await act(async () => pending.resolve(session));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.session).toBe(session);
  });

  it("exposes restoration errors without an unhandled rejection and allows retry", async () => {
    const context = setup();
    const error = new Error("offline");
    context.storage.set("saved");
    context.remote.getSession = vi.fn(async () => { throw error; });
    const { result } = mount(context);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe(error);
    context.remote.getSession = vi.fn(async () => session);
    await act(() => result.current.restoreSession());
    expect(result.current.error).toBeNull();
    expect(result.current.session).toBe(session);
  });

  it("keeps loading while actions overlap and propagates action errors", async () => {
    const context = setup();
    const first = deferred<Session>();
    const second = deferred<Session>();
    context.remote.signIn = () => first.promise;
    context.remote.signUp = () => second.promise;
    const { result } = mount(context);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    let login!: Promise<Session>;
    let registration!: Promise<Session>;
    act(() => {
      login = result.current.signIn(credentials);
      registration = result.current.signUp({ ...credentials, name: "Taro" });
    });
    expect(result.current.isLoading).toBe(true);
    await act(async () => { first.resolve(session); await login; });
    expect(result.current.isLoading).toBe(true);
    const error = new Error("signUp failed");
    await act(async () => {
      second.reject(error);
      await expect(registration).rejects.toBe(error);
    });
    expect(result.current.error).toBe(error);
    expect(result.current.isLoading).toBe(false);
  });

  it("preserves additional client actions and their types without remote mapping", async () => {
    const base = setup();
    const customLogin = vi.fn(async (code: number) => {
      await base.auth.signIn(credentials);
      return { code };
    });
    const auth = { ...base.auth, customLogin };
    const context = createAuthContext(auth);
    const { result } = renderHook(context.useAuth, { wrapper: context.AuthProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expectTypeOf(result.current.customLogin).toEqualTypeOf<typeof customLogin>();
    await act(async () => { expect(await result.current.customLogin(42)).toEqual({ code: 42 }); });
    expect(customLogin).toHaveBeenCalledWith(42);
    expect(result.current.session).toBe(session);
  });

  it("accepts the published Apps Script adapter and retains its extra action results", async () => {
    const result = { user: { name: "Taro" }, session: { id: "session" }, result: { welcome: true } };
    const client = {
      signInEmail: async (_input: Credentials) => result,
      signUpEmail: async (_input: Registration) => result,
      signInAppsScript: vi.fn(async (_input: Record<string, never>) => result),
      signUpAppsScript: async (_input: { name: string }) => result,
      getSession: async (_input: { sessionId: string }) => ({ id: "session" }),
      signOut: async (_input: { sessionId: string }) => {},
    };
    const auth = appsScriptAuth({ client, storage: memoryAuthStorage() });
    const { AuthProvider, useAuth } = createAuthContext(auth);
    const hook = renderHook(useAuth, { wrapper: AuthProvider });
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    expectTypeOf(hook.result.current.signInAppsScript).returns.toEqualTypeOf<ReturnType<typeof auth.signInAppsScript>>();
    expectTypeOf(hook.result.current.signUpAppsScript).parameter(0).toEqualTypeOf<{ name: string }>();
    await act(async () => {
      const signedIn = await hook.result.current.signInAppsScript();
      expect(signedIn.result.welcome).toBe(true);
    });
    expect(client.signInAppsScript).toHaveBeenCalledWith({});
    expect(hook.result.current.session).toBe(auth.getState().session);
    expect(hook.result.current.user).toBe(result.user);
  });

  it("isolates contexts and rejects use outside the matching provider", async () => {
    const first = mount();
    const second = mount();
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));
    await act(() => first.result.current.signIn(credentials));
    expect(second.result.current.session).toBeNull();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => renderHook(first.useAuth)).toThrow("useAuth must be used within its AuthProvider.");
      expect(() => renderHook(first.useAuth, { wrapper: second.AuthProvider })).toThrow("useAuth must be used within its AuthProvider.");
    } finally {
      consoleError.mockRestore();
    }
  });
});

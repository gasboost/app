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
    expectTypeOf(result.current.isSessionRestoreFailed).toEqualTypeOf<boolean>();
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
    expect(result.current.isSessionRestoreFailed).toBe(false);
    expect(context.remote.getSession).toHaveBeenCalledTimes(1);
    expect(context.remote.getSession).toHaveBeenCalledWith("saved");
    await act(async () => pending.resolve(session));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.session).toBe(session);
  });

  it("exposes restoration errors without an unhandled rejection and allows retry", async () => {
    const context = setup();
    const first = mount(context);
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    await act(() => first.result.current.signIn(credentials));
    first.unmount();
    const error = new Error("offline");
    context.remote.getSession = vi.fn(async () => { throw error; });
    const { result } = mount(context);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe(error);
    expect(result.current.isSessionRestoreFailed).toBe(true);
    expect(result.current.session).toBe(session);
    expect(result.current.user).toBe(session.user);
    expect(result.current.token).toBe(session.token);
    expect(context.storage.get()).toBe(session.token);
    context.remote.getSession = vi.fn(async () => session);
    await act(() => result.current.restoreSession());
    expect(result.current.error).toBeNull();
    expect(result.current.isSessionRestoreFailed).toBe(false);
    expect(result.current.session).toBe(session);
  });

  it("marks explicit restore failures and clears them on a normal null response", async () => {
    const context = setup();
    const { result } = mount(context);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(() => result.current.signIn(credentials));
    const error = new Error("offline");
    context.remote.getSession = vi.fn(async () => { throw error; });
    await act(async () => {
      await expect(result.current.restoreSession()).rejects.toBe(error);
    });
    expect(result.current.isSessionRestoreFailed).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.user).toBe(session.user);
    expect(context.storage.get()).toBe(session.token);
    context.remote.getSession = vi.fn(async () => null);
    await act(() => result.current.restoreSession());
    expect(result.current.isSessionRestoreFailed).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.user).toBeNull();
    expect(context.storage.get()).toBeNull();
  });

  it("does not treat an invalid session during initial restore as a failure", async () => {
    const context = setup();
    context.storage.set("expired");
    context.remote.getSession = vi.fn(async () => null);
    const { result } = mount(context);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isSessionRestoreFailed).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.session).toBeNull();
    expect(context.storage.get()).toBeNull();
  });

  it.each(["signIn", "signUp", "signOut"] as const)(
    "%s failures preserve the restore flag, and success clears it",
    async (action) => {
      const context = setup();
      const { result } = mount(context);
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      await act(() => result.current.signIn(credentials));
      const error = new Error(`${action} failed`);
      const failed = vi.spyOn(context.remote, action).mockRejectedValue(error);
      const perform = () => action === "signUp"
        ? result.current.signUp({ ...credentials, name: "Taro" })
        : action === "signIn" ? result.current.signIn(credentials) : result.current.signOut();
      await act(async () => { await expect(perform()).rejects.toBe(error); });
      expect(result.current.error).toBe(error);
      expect(result.current.isSessionRestoreFailed).toBe(false);

      context.remote.getSession = vi.fn(async () => { throw new Error("offline"); });
      await act(async () => { await expect(result.current.restoreSession()).rejects.toThrow("offline"); });
      expect(result.current.isSessionRestoreFailed).toBe(true);
      await act(async () => { await expect(perform()).rejects.toBe(error); });
      expect(result.current.isSessionRestoreFailed).toBe(true);
      failed.mockRestore();
      await act(async () => { await perform(); });
      expect(result.current.isSessionRestoreFailed).toBe(false);
      expect(result.current.isLoading).toBe(false);
    },
  );

  it.each((["initial", "explicit"] as const).flatMap((kind) =>
    (["signIn", "signUp", "signOut", "restoreSession"] as const).map((action) => [kind, action] as const),
  ))(
    "ignores a stale %s restore failure after newer %s succeeds",
    async (kind, action) => {
      const context = setup();
      await context.auth.signIn(credentials);
      const pending = deferred<Session | null>();
      if (kind === "initial") context.remote.getSession = vi.fn(() => pending.promise);
      const { result } = mount(context);
      let restore: Promise<Session | null> | undefined;
      if (kind === "explicit") {
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        context.remote.getSession = vi.fn(() => pending.promise);
        act(() => { restore = result.current.restoreSession(); });
      }
      await act(async () => {
        if (action === "signIn") await result.current.signIn(credentials);
        else if (action === "signUp") await result.current.signUp({ ...credentials, name: "Taro" });
        else if (action === "signOut") await result.current.signOut();
        else {
          context.remote.getSession = vi.fn(async () => session);
          await result.current.restoreSession();
        }
      });
      expect(result.current.isLoading).toBe(true);
      const error = new Error("stale restore failed");
      await act(async () => {
        pending.reject(error);
        if (restore) await expect(restore).rejects.toBe(error);
      });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.isSessionRestoreFailed).toBe(false);
      expect(result.current.user).toBe(action === "signOut" ? null : session.user);
      expect(context.storage.get()).toBe(action === "signOut" ? null : session.token);
    },
  );

  it("keeps the latest restore result when overlapping retries finish out of order", async () => {
    const context = setup();
    const { result } = mount(context);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(() => result.current.signIn(credentials));
    const older = deferred<Session | null>();
    const newer = deferred<Session | null>();
    context.remote.getSession = vi.fn()
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    let first!: Promise<Session | null>;
    let second!: Promise<Session | null>;
    act(() => {
      first = result.current.restoreSession();
      second = result.current.restoreSession();
    });
    await act(async () => { newer.reject(new Error("offline")); await expect(second).rejects.toThrow("offline"); });
    expect(result.current.isSessionRestoreFailed).toBe(true);
    await act(async () => { older.resolve(session); await first; });
    expect(result.current.isSessionRestoreFailed).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });

  it("still reports a restore failure when overlapping sign-in also fails", async () => {
    const context = setup();
    context.storage.set("saved");
    const pending = deferred<Session | null>();
    context.remote.getSession = vi.fn(() => pending.promise);
    context.remote.signIn = vi.fn(async () => { throw new Error("sign-in failed"); });
    const { result } = mount(context);
    await act(async () => { await expect(result.current.signIn(credentials)).rejects.toThrow("sign-in failed"); });
    await act(async () => { pending.reject(new Error("offline")); });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isSessionRestoreFailed).toBe(true);
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
      getSession: vi.fn(async (_input: { sessionId: string }) => ({ id: "session" })),
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
    client.getSession.mockRejectedValueOnce(new Error("offline"));
    await act(async () => {
      await expect(hook.result.current.restoreSession()).rejects.toThrow("offline");
    });
    expect(hook.result.current.isSessionRestoreFailed).toBe(true);
    await act(async () => { await hook.result.current.signInAppsScript(); });
    expect(hook.result.current.isSessionRestoreFailed).toBe(false);
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

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  expectTypeOf,
} from "vitest";
import { AppsScript } from "@gasboost/app";
import {
  AppsScriptBootstrap,
  type BootstrapOptions,
  type BootstrapPublicState,
  type BootstrapContext,
} from "../src";
import type { AppState } from "../src/types";

function fixture(overrides: Partial<BootstrapOptions> = {}) {
  let raw: string | null = null;
  let locked = false;
  const properties = {
    getProperty: vi.fn(() => raw),
    setProperty: vi.fn((_key: string, value: string) => {
      raw = value;
    }),
  };
  const lock = {
    waitLock: vi.fn(() => {
      if (locked) throw new Error("Script lock busy");
      locked = true;
    }),
    releaseLock: vi.fn(() => {
      locked = false;
    }),
  };
  let sequence = 0;
  const utilities = {
    getUuid: vi.fn(() => `uuid-${++sequence}`),
    DigestAlgorithm: { SHA_256: "SHA_256" },
    Charset: { UTF_8: "UTF_8" },
    computeDigest: vi.fn(() => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, -1, -6]),
  };
  const activeUser = { getEmail: vi.fn(() => "admin@example.com") };
  vi.stubGlobal("PropertiesService", { getScriptProperties: () => properties });
  vi.stubGlobal("LockService", { getScriptLock: () => lock });
  vi.stubGlobal("Utilities", utilities);
  vi.stubGlobal("Session", { getActiveUser: () => activeUser });
  vi.stubGlobal("ScriptApp", { getScriptId: () => "script-id" });
  const order: string[] = [];
  const db = {
    migrate: vi.fn(() => {
      order.push("migrate");
    }),
  };
  const auth = {
    registration: {
      methods: { emailPassword: true, appsScript: true },
      ensure: vi.fn(async (input: { id: string }) => {
        order.push("register");
        return { id: input.id };
      }),
    },
    password: {
      forgot: vi.fn(async () => {
        order.push("notify");
      }),
    },
  };
  const authorization = {
    role: {
      assign: vi.fn(async () => {
        order.push("role");
      }),
    },
  };
  const options = { db, auth, authorization, ...overrides };
  const bootstrap = new AppsScriptBootstrap(options);
  let publicState: BootstrapPublicState | undefined;
  const app = new AppsScript()
    .get(
      (_request, context) => {
        publicState = context.state.get(bootstrap.KEY);
        expectTypeOf(publicState).toEqualTypeOf<BootstrapPublicState>();
        return {} as GoogleAppsScript.HTML.HtmlOutput;
      },
      [bootstrap.middleware()],
    )
    .calls(bootstrap.handlers());
  const get = () => {
    app.callGet({} as GoogleAppsScript.Events.DoGet);
    return publicState!;
  };
  const initialize = (token: unknown = state().bootstrap?.token) =>
    bootstrap.handlers().initializeApp({ token } as { token: string });
  const state = (): AppState => JSON.parse(raw!);
  const setState = (value: unknown) => {
    raw = JSON.stringify(value);
  };
  return {
    bootstrap,
    app,
    get,
    initialize,
    state,
    setState,
    db,
    auth,
    options,
    authorization,
    order,
    activeUser,
    properties,
    lock,
    utilities,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-04T00:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("GET bootstrap middleware", () => {
  it("issues a string token preserving leading zeros and exposes only public state", () => {
    const f = fixture();
    expect(f.get()).toEqual({
      initialized: false,
      settingsUrl: "https://script.google.com/home/projects/script-id/settings",
    });
    expect(f.state().bootstrap).toEqual({
      token: "012345",
      expiresAt: Date.now() + 30 * 60_000,
      attempts: 0,
    });
    expect(JSON.stringify(f.get())).not.toContain("012345");
    expect(f.properties.setProperty).toHaveBeenCalledOnce();
    expect(f.lock.releaseLock).toHaveBeenCalledTimes(2);
  });
  it("serializes repeat GETs, reuses tokens, and rotates only after TTL", () => {
    const f = fixture();
    f.get();
    const first = f.state().bootstrap;
    for (let i = 0; i < 20; i++) f.get();
    expect(f.properties.setProperty).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(30 * 60_000);
    f.utilities.computeDigest.mockReturnValue([9, 8, 7, 6, 5, 4]);
    f.get();
    expect(f.state().bootstrap?.token).toBe("987654");
    expect(f.state().bootstrap?.expiresAt).toBe(first!.expiresAt + 30 * 60_000);
  });
  it("checks state after acquiring the lock", () => {
    const f = fixture();
    f.lock.waitLock.mockImplementationOnce(() =>
      f.setState({
        initialized: false,
        bootstrap: {
          token: "654321",
          attempts: 2,
          expiresAt: Date.now() + 1000,
        },
      }),
    );
    f.get();
    expect(f.state().bootstrap?.token).toBe("654321");
    expect(f.properties.setProperty).not.toHaveBeenCalled();
  });
  it("does not issue tokens after completion", () => {
    const f = fixture();
    f.setState({ initialized: true });
    expect(f.get()).toEqual({ initialized: true });
    expect(f.properties.setProperty).not.toHaveBeenCalled();
  });
  it("uses configured digits, TTL and rejection sampling", () => {
    const f = fixture({ tokenDigits: 8, tokenTtlMinutes: 10 });
    f.utilities.computeDigest.mockReturnValue([-1, -6, 0, 1, 2, 3]);
    f.get();
    expect(f.state().bootstrap?.token).toBe("01230123");
    expect(f.state().bootstrap?.expiresAt).toBe(Date.now() + 600_000);
  });
});

describe("RPC authorization", () => {
  it("requires a GET-issued token and never migrates before verification", async () => {
    const f = fixture();
    await expect(f.initialize("123456")).rejects.toThrow(
      "issue a bootstrap token",
    );
    f.get();
    for (const value of [
      12345,
      undefined,
      null,
      "01234",
      "012345x",
      "999999",
    ]) {
      await expect(
        f.initialize(value === undefined ? null : value),
      ).rejects.toThrow();
    }
    expect(f.db.migrate).not.toHaveBeenCalled();
  });
  it("locks out at max attempts; repeated GETs cannot reset attempts", async () => {
    const f = fixture({ maxAttempts: 2 });
    f.get();
    await expect(f.initialize("no")).rejects.toThrow("Invalid");
    await expect(f.initialize("no")).rejects.toThrow("Invalid");
    for (let i = 0; i < 20; i++) f.get();
    await expect(f.initialize()).rejects.toThrow("locked");
    expect(f.state().bootstrap?.attempts).toBe(2);
    vi.advanceTimersByTime(30 * 60_000);
    await expect(f.initialize()).rejects.toThrow("expired");
    f.get();
    await expect(f.initialize()).resolves.toEqual({ initialized: true });
  });
  it("rejects empty active email without using the effective user", async () => {
    const f = fixture();
    f.get();
    f.activeUser.getEmail.mockReturnValue("");
    await expect(f.initialize()).rejects.toThrow("Active user email");
    expect(f.db.migrate).not.toHaveBeenCalled();
  });
  it("rejects corrupt stored state and releases locks", () => {
    const f = fixture();
    f.setState({ initialized: "yes" });
    expect(() => f.get()).toThrow("Invalid APP_STATE");
    f.setState({
      initialized: false,
      bootstrap: { token: "123456", expiresAt: null, attempts: 0 },
    });
    expect(() => f.get()).toThrow("Invalid bootstrap state");
    expect(f.lock.releaseLock).toHaveBeenCalledTimes(2);
  });
  it("keeps initialization handlers outside subsequently registered authentication", async () => {
    const f = fixture();
    f.get();
    const authentication = vi.fn(() => {
      throw new Error("Login required");
    });
    const app = f.app.use(authentication).call("private", () => "secret");
    await app.dispatch("initializeApp", { token: f.state().bootstrap!.token });
    expect(authentication).not.toHaveBeenCalled();
    await expect(app.dispatch("private")).rejects.toThrow("Login required");
  });
});

describe("provisioning and recovery", () => {
  it.each([
    [true, false],
    [false, true],
    [true, true],
  ])(
    "uses enabled Auth methods (%s, %s) and one user/role",
    async (emailPassword, appsScript) => {
      const f = fixture();
      f.auth.registration.methods = { emailPassword, appsScript };
      f.get();
      await f.initialize();
      expect(f.order).toEqual(
        emailPassword
          ? ["migrate", "register", "role", "notify"]
          : ["migrate", "register", "role"],
      );
      const input = f.auth.registration.ensure.mock.calls[0][0];
      expect(f.authorization.role.assign).toHaveBeenCalledExactlyOnceWith(
        input.id,
        "管理者",
      );
      expect(f.state()).toEqual({ initialized: true });
      expect(f.get()).toEqual({ initialized: true });
      await expect(f.initialize("012345")).rejects.toThrow(
        "already initialized",
      );
    },
  );
  it("rejects disabled methods and missing reset delivery before migration", async () => {
    const f = fixture();
    f.get();
    f.auth.registration.methods = { emailPassword: false, appsScript: false };
    await expect(f.initialize()).rejects.toThrow("No authentication");
    f.auth.registration.methods.emailPassword = true;
    delete (f.options.auth as { password?: unknown }).password;
    await expect(f.initialize()).rejects.toThrow("password reset delivery");
    expect(f.db.migrate).not.toHaveBeenCalled();
  });
  it("retries notification without recreating user, role, or migration", async () => {
    const f = fixture();
    f.get();
    f.auth.password.forgot.mockRejectedValueOnce(new Error("mail unavailable"));
    await expect(f.initialize()).rejects.toThrow("mail unavailable");
    expect(f.state().initialized).toBe(false);
    expect(f.state().progress?.roleAssigned).toBe(true);
    vi.advanceTimersByTime(30 * 60_000);
    f.get();
    await f.initialize();
    expect(f.db.migrate).toHaveBeenCalledOnce();
    expect(f.auth.registration.ensure).toHaveBeenCalledOnce();
    expect(f.authorization.role.assign).toHaveBeenCalledOnce();
    expect(f.auth.password.forgot).toHaveBeenCalledTimes(2);
  });
  it("retains the same administrator ID when registration writes then throws", async () => {
    const f = fixture();
    f.get();
    f.auth.registration.ensure.mockRejectedValueOnce(new Error("interrupted"));
    await expect(f.initialize()).rejects.toThrow("interrupted");
    const id = f.state().progress!.administrator.id;
    await f.initialize();
    expect(
      f.auth.registration.ensure.mock.calls.map(([input]) => input.id),
    ).toEqual([id, id]);
    expect(f.db.migrate).toHaveBeenCalledOnce();
  });
  it("repairs a lost checkpoint after an external write using the same stable ID", async () => {
    const f = fixture();
    f.get();
    const save = f.properties.setProperty.getMockImplementation()!;
    let failed = false;
    f.properties.setProperty.mockImplementation((key, value) => {
      if (!failed && JSON.parse(value).progress?.registered) {
        failed = true;
        throw new Error("properties unavailable");
      }
      save(key, value);
    });
    await expect(f.initialize()).rejects.toThrow("properties unavailable");
    const id = f.state().progress!.administrator.id;
    expect(f.state().progress?.registered).toBeUndefined();
    await f.initialize();
    expect(
      f.auth.registration.ensure.mock.calls.map(([input]) => input.id),
    ).toEqual([id, id]);
    expect(f.state().initialized).toBe(true);
  });
  it("rejects a different recovery user and changed provider configuration", async () => {
    const f = fixture();
    f.get();
    f.db.migrate.mockImplementationOnce(() => {
      throw new Error("migration failed");
    });
    await expect(f.initialize()).rejects.toThrow("migration failed");
    f.activeUser.getEmail.mockReturnValue("other@example.com");
    await expect(f.initialize()).rejects.toThrow("original active user");
    f.activeUser.getEmail.mockReturnValue("admin@example.com");
    f.auth.registration.methods.appsScript = false;
    await expect(f.initialize()).rejects.toThrow(
      "original authentication configuration",
    );
    f.auth.registration.methods.appsScript = true;
    await f.initialize();
  });
  it("retains its lease while native ScriptLock is available to DB and GET", async () => {
    const f = fixture();
    f.get();
    let finish!: () => void;
    f.db.migrate.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }) as never,
    );
    const first = f.initialize();
    const lease = f.state().lease;
    expect(lease).toEqual({
      id: expect.any(String),
      expiresAt: Date.now() + 10 * 60_000,
    });
    // Model a dependency acquiring/releasing the same native lock between checkpoints.
    f.lock.waitLock();
    f.lock.releaseLock();
    expect(f.get()).toEqual({
      initialized: false,
      settingsUrl: "https://script.google.com/home/projects/script-id/settings",
    });
    const otherRequest = new AppsScriptBootstrap(f.options);
    await expect(
      otherRequest
        .handlers()
        .initializeApp({ token: f.state().bootstrap!.token }),
    ).rejects.toThrow("already in progress");
    expect(f.state().lease).toEqual(lease);
    finish();
    await first;
    expect(f.auth.registration.ensure).toHaveBeenCalledOnce();
    expect(f.state()).toEqual({ initialized: true });
  });
  it("does not lose concurrent token changes at a checkpoint", async () => {
    const f = fixture({ tokenTtlMinutes: 1 });
    f.get();
    let finish!: () => void;
    f.db.migrate.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }) as never,
    );
    f.auth.registration.ensure.mockRejectedValueOnce(
      new Error("stop after migration"),
    );
    const first = f.initialize();
    const lease = f.state().lease;
    vi.advanceTimersByTime(60_000);
    f.utilities.computeDigest.mockReturnValue([9, 8, 7, 6, 5, 4]);
    f.get();
    const challenge = f.state().bootstrap;
    expect(challenge?.token).toBe("987654");
    expect(f.state().lease).toEqual(lease);
    finish();
    await expect(first).rejects.toThrow("stop after migration");
    expect(f.state().bootstrap).toEqual(challenge);
    expect(f.state().progress?.migrated).toBe(true);
    expect(f.state().lease).toBeUndefined();
  });
  it("recovers a terminated execution only after its lease expires, preserving the user ID", async () => {
    const f = fixture();
    f.get();
    const progress = {
      administrator: {
        id: "original-admin",
        email: "admin@example.com",
        name: "Admin",
        role: "管理者",
      },
      methods: { emailPassword: true, appsScript: true },
      migrated: true,
    };
    const lease = {
      id: "terminated-execution",
      expiresAt: Date.now() + 10 * 60_000,
    };
    f.setState({ ...f.state(), progress, lease });
    await expect(f.initialize()).rejects.toThrow("already in progress");
    vi.advanceTimersByTime(6 * 60_000);
    await expect(f.initialize()).rejects.toThrow("already in progress");
    vi.advanceTimersByTime(4 * 60_000);
    await f.initialize();
    expect(f.db.migrate).not.toHaveBeenCalled();
    expect(f.auth.registration.ensure).toHaveBeenCalledWith(
      expect.objectContaining({ id: "original-admin" }),
    );
    expect(f.state()).toEqual({ initialized: true });
  });
  it("fences an expired owner and never clears its successor's lease", async () => {
    const f = fixture();
    f.get();
    let firstFinish!: () => void;
    let secondFinish!: () => void;
    f.db.migrate
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            firstFinish = resolve;
          }) as never,
      )
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            secondFinish = resolve;
          }) as never,
      );
    const first = f.initialize();
    const oldLease = f.state().lease;
    vi.advanceTimersByTime(10 * 60_000);
    const second = f.initialize();
    const successor = f.state().lease;
    expect(successor?.id).not.toBe(oldLease?.id);
    firstFinish();
    await expect(first).rejects.toThrow("lease was lost or expired");
    expect(f.state().lease).toEqual(successor);
    expect(f.state().progress?.migrated).toBeUndefined();
    expect(f.auth.registration.ensure).not.toHaveBeenCalled();
    secondFinish();
    await second;
    expect(f.auth.registration.ensure).toHaveBeenCalledOnce();
    expect(f.state()).toEqual({ initialized: true });
  });
  it("refuses to checkpoint after lease expiry even without a successor", async () => {
    const f = fixture();
    f.get();
    f.db.migrate.mockImplementationOnce(() => {
      vi.advanceTimersByTime(10 * 60_000);
    });
    await expect(f.initialize()).rejects.toThrow("lease was lost or expired");
    expect(f.state().initialized).toBe(false);
    expect(f.state().progress?.migrated).toBeUndefined();
    expect(f.state().lease).toBeUndefined();
    expect(f.auth.registration.ensure).not.toHaveBeenCalled();
    await f.initialize();
    expect(f.state().initialized).toBe(true);
  });
  it("supports individual overrides and retries failed hooks without replaying standard steps", async () => {
    const notify = vi.fn(async () => {});
    const hook = vi
      .fn(async (_context: BootstrapContext) => {})
      .mockRejectedValueOnce(new Error("hook failed"));
    const f = fixture({ overrides: { notify }, afterInitialize: hook });
    f.get();
    await expect(f.initialize()).rejects.toThrow("hook failed");
    await f.initialize();
    expect(notify).toHaveBeenCalledOnce();
    expect(hook).toHaveBeenCalledTimes(2);
    expect(f.auth.password.forgot).not.toHaveBeenCalled();
    expect(f.auth.registration.ensure).toHaveBeenCalledOnce();
    expect(Object.isFrozen(hook.mock.calls[0][0])).toBe(true);
  });
});

it.each([
  { tokenDigits: 2 },
  { tokenDigits: 6.5 },
  { tokenTtlMinutes: 0 },
  { tokenTtlMinutes: Infinity },
  { maxAttempts: 0 },
])("rejects invalid settings %s", (settings) => {
  expect(() => fixture(settings)).toThrow();
});

it("fails closed on a corrupt execution lease", () => {
  const f = fixture();
  f.get();
  f.setState({ ...f.state(), lease: { id: "", expiresAt: null } });
  expect(() => f.get()).toThrow("Invalid bootstrap lease state");
});

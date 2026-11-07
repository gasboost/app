import { User, Account, type AppsScriptAuthRepository } from "@gasboost/auth";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  expectTypeOf,
} from "vitest";
import {
  AppsScript,
  AppsScriptError,
  type InferAppsScript,
} from "@gasboost/app";
import {
  appsScriptClient,
  AppsScriptRpcError,
  FetchTransport,
} from "@gasboost/client";
import { BOOTSTRAP_ERROR_CODES, BootstrapError } from "../src/errors";
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
    getUuid: vi.fn(
      () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
    ),
  };
  const effectiveUser = { getEmail: vi.fn(() => "admin@example.com") };
  vi.stubGlobal("PropertiesService", { getScriptProperties: () => properties });
  vi.stubGlobal("LockService", { getScriptLock: () => lock });
  vi.stubGlobal("Utilities", utilities);
  const activeUser = { getEmail: vi.fn(() => "admin@example.com") };
  vi.stubGlobal("Session", {
    getEffectiveUser: () => effectiveUser,
    getActiveUser: () => activeUser,
  });
  const getUrl = vi.fn(
    () => "https://script.google.com/macros/s/deployment-id/exec",
  );
  vi.stubGlobal("ScriptApp", { getService: () => ({ getUrl }) });
  const mail = {
    sendEmail: vi.fn(
      (_message: { to: string; subject: string; body: string }) => {},
    ),
  };
  vi.stubGlobal("MailApp", mail);
  const order: string[] = [];
  const db = {
    migrate: vi.fn(() => {
      order.push("migrate");
    }),
  };
  const users = new Map<string, User>();
  const accounts: Account[] = [];
  const makeAccount = (userId: string, provider: string, email: string) =>
    new Account({
      id: utilities.getUuid(),
      userId,
      identity: {
        providerName: provider as "appsScript" | "emailPassword",
        accountId: email,
      },
    });
  const registration = (provider: string) =>
    vi.fn(async (input: { name: string; email: string }) => {
      order.push("register");
      const id = utilities.getUuid();
      const account = makeAccount(id, provider, input.email);
      accounts.push(account);
      const user = new User({ id, name: input.name, accounts: [account] });
      users.set(id, user);
      return user;
    });
  const auth = {
    registration: {
      methods: { emailPassword: true, appsScript: true },
      appsScript: registration("appsScript"),
      email: registration("emailPassword"),
    },
    account: {
      add: vi.fn(
        async (id: string, input: { provider: string; email: string }) => {
          const account = makeAccount(id, input.provider, input.email);
          accounts.push(account);
          return account;
        },
      ),
    },
    password: {
      forgot: vi.fn(async () => {
        order.push("notify");
      }),
    },
  };
  const authRepository = {
    user: {
      find: vi.fn(async (id: string) => {
        const user = users.get(id);
        return user
          ? new User({
              ...user,
              accounts: accounts.filter((account) => account.userId === id),
            })
          : null;
      }),
      create: vi.fn(async (user: User) => {
        users.set(user.id, user);
        return user;
      }),
    },
    account: {
      findByIdentity: vi.fn(
        async (provider: string, email: string) =>
          accounts.find(
            (account) =>
              account.identity.providerName === provider &&
              account.identity.accountId === email,
          ) ?? null,
      ),
    },
    passwordCredential: {
      findByResetTokenHash: vi.fn(async (_hash: string) => null),
      save: vi.fn(async (_credential: unknown) => {}),
    },
  } satisfies AppsScriptAuthRepository;
  const authorization = {
    role: {
      assign: vi.fn(async () => {
        order.push("role");
      }),
    },
  };
  const options = { db, auth, authRepository, authorization, ...overrides };
  const bootstrap = new AppsScriptBootstrap(options);
  let publicState: BootstrapPublicState | undefined;
  const app = new AppsScript()
    .get((request) => {
      publicState = bootstrap.handle(request);
      expectTypeOf(publicState).toEqualTypeOf<BootstrapPublicState>();
      return {} as GoogleAppsScript.HTML.HtmlOutput;
    })
    .calls(bootstrap.handlers());
  const get = (token?: string) => {
    app.callGet({
      parameter: token === undefined ? {} : { token },
      parameters: {},
    } as GoogleAppsScript.Events.DoGet);
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
    authRepository,
    options,
    authorization,
    order,
    effectiveUser,
    properties,
    lock,
    activeUser,
    users,
    accounts,
    utilities,
    mail,
    getUrl,
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

describe("synchronous GET state and setup notification", () => {
  it("sends one owner-only /exec link and returns no secrets or Promise", () => {
    const f = fixture();
    const state = f.get();
    expect(state).toEqual({ initialized: false });
    expect(state).not.toBeInstanceOf(Promise);
    expect(f.state().bootstrap).toEqual({
      token: expect.any(String),
      email: "admin@example.com",
      attempts: 0,
      expiresAt: Date.now() + 30 * 60_000,
      notified: true,
    });
    expect(f.state().bootstrap!.token).toHaveLength(72);
    expect(f.mail.sendEmail).toHaveBeenCalledExactlyOnceWith({
      to: "admin@example.com",
      subject: expect.any(String),
      body: expect.stringContaining(
        `https://script.google.com/macros/s/deployment-id/exec?token=${f.state().bootstrap!.token}`,
      ),
    });
    expect(f.state().lease).toBeUndefined();
    for (let i = 0; i < 20; i++)
      expect(f.get()).toEqual({ initialized: false });
    expect(f.mail.sendEmail).toHaveBeenCalledOnce();
    expect(f.db.migrate).not.toHaveBeenCalled();
    expect(f.auth.registration.appsScript).not.toHaveBeenCalled();
  });
  it("rejects a duplicate notification request while the first is sending", () => {
    const f = fixture();
    f.mail.sendEmail.mockImplementationOnce(() => {
      expect(f.get()).toEqual({ initialized: false });
    });
    f.get();
    expect(f.mail.sendEmail).toHaveBeenCalledOnce();
  });
  it("retries failed notification with the same token and rotates only after expiry", () => {
    const f = fixture();
    f.mail.sendEmail.mockImplementationOnce(() => {
      throw new Error("mail offline");
    });
    expect(() => f.get()).toThrow("mail offline");
    const token = f.state().bootstrap!.token;
    expect(f.state().bootstrap!.notified).toBe(false);
    expect(f.state().lease).toBeUndefined();
    f.get();
    expect(f.mail.sendEmail).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(60_000);
    f.get();
    expect(f.state().bootstrap!.token).toBe(token);
    expect(f.mail.sendEmail).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(30 * 60_000);
    f.get();
    expect(f.state().bootstrap!.token).not.toBe(token);
    expect(f.mail.sendEmail).toHaveBeenCalledTimes(3);
  });
  it.each([
    "https://script.google.com/macros/s/id/dev",
    "https://example.com/exec",
    "",
  ])("rejects invalid deployment URL %s without writes or mail", (url) => {
    const f = fixture();
    f.getUrl.mockReturnValue(url);
    expect(() => f.get()).toThrow("/exec URL");
    expect(f.properties.setProperty).not.toHaveBeenCalled();
    expect(f.mail.sendEmail).not.toHaveBeenCalled();
  });
  it("returns initialized without Session, URL, property writes or notification", () => {
    const f = fixture();
    f.setState({ initialized: true });
    expect(f.get("anything")).toEqual({ initialized: true });
    expect(f.effectiveUser.getEmail).not.toHaveBeenCalled();
    expect(f.getUrl).not.toHaveBeenCalled();
    expect(f.properties.setProperty).not.toHaveBeenCalled();
    expect(f.mail.sendEmail).not.toHaveBeenCalled();
  });
  it("rejects a changed EffectiveUser without rebinding or resending", () => {
    const f = fixture();
    f.get();
    const previous = f.state();
    f.effectiveUser.getEmail.mockReturnValue("other@example.com");
    expect(() => f.get()).toThrow("original effective user");
    expect(f.state()).toEqual(previous);
    expect(f.mail.sendEmail).toHaveBeenCalledOnce();
  });
  it("uses a valid link only for public state; GET never initializes", () => {
    const f = fixture();
    f.get();
    expect(f.get(f.state().bootstrap!.token)).toEqual({ initialized: false });
    expect(f.mail.sendEmail).toHaveBeenCalledOnce();
    expect(f.db.migrate).not.toHaveBeenCalled();
    expect(() => f.get("invalid")).toThrow("Invalid bootstrap token");
    expect(f.mail.sendEmail).toHaveBeenCalledOnce();
    expect(f.auth.registration.appsScript).not.toHaveBeenCalled();
  });
  it("reissues a legacy v0.1 challenge without resetting existing progress", () => {
    const f = fixture();
    f.setState({
      initialized: false,
      bootstrap: {
        token: "123456",
        expiresAt: Date.now() + 60000,
        attempts: 3,
      },
      progress: {
        administrator: {
          id: "existing",
          name: "Admin",
          role: "管理者",
          email: "admin@example.com",
        },
        methods: { emailPassword: true, appsScript: true },
        migrated: true,
      },
    });
    f.get();
    expect(f.state().bootstrap!.token).toHaveLength(72);
    expect(f.state().progress!.administrator.id).toBe("existing");
    expect(f.state().progress!.migrated).toBe(true);
  });
});

describe("RPC authorization", () => {
  it("requires a GET-issued token and never migrates before verification", async () => {
    const f = fixture();
    await expect(f.initialize("123456")).rejects.toThrow(
      "issue a bootstrap link",
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
  it("rejects an empty EffectiveUser before initialization", async () => {
    const f = fixture();
    f.get();
    f.effectiveUser.getEmail.mockReturnValue("");
    await expect(f.initialize()).rejects.toThrow("Effective user email");
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
    expect(f.lock.releaseLock).toHaveBeenCalled();
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
    await expect(app.dispatch("private")).rejects.toThrow(
      "An unexpected error occurred",
    );
  });
});

describe("registration and recovery", () => {
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
      const input = (
        appsScript ? f.auth.registration.appsScript : f.auth.registration.email
      ).mock.calls[0][0];
      expect(input).not.toHaveProperty("id");
      expect(input.email).toBe("admin@example.com");
      expect(f.authorization.role.assign).toHaveBeenCalledExactlyOnceWith(
        [...f.users.keys()][0],
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
    expect(f.auth.registration.appsScript).toHaveBeenCalledOnce();
    expect(f.authorization.role.assign).toHaveBeenCalledOnce();
    expect(f.auth.password.forgot).toHaveBeenCalledTimes(2);
  });
  it("recovers a registration write that threw before returning", async () => {
    const f = fixture();
    f.get();
    const register = f.auth.registration.appsScript.getMockImplementation()!;
    f.auth.registration.appsScript.mockImplementationOnce(async (input) => {
      await register(input);
      throw new Error("interrupted after write");
    });
    await expect(f.initialize()).rejects.toThrow("interrupted after write");
    const id = [...f.users.keys()][0];
    expect(f.state().progress!.administrator.id).toBeUndefined();
    await f.initialize();
    expect(f.auth.registration.appsScript).toHaveBeenCalledOnce();
    expect(f.users.size).toBe(1);
    expect(f.users.has(id)).toBe(true);
    expect(f.accounts).toHaveLength(2);
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
    const id = [...f.users.keys()][0];
    expect(f.state().progress!.administrator.id).toBeUndefined();
    expect(f.state().progress?.registered).toBeUndefined();
    await f.initialize();
    expect([...f.users.keys()]).toEqual([id]);
    expect(f.auth.registration.appsScript).toHaveBeenCalledExactlyOnceWith({
      name: "システム管理者",
      email: "admin@example.com",
    });
    expect(f.state().initialized).toBe(true);
  });
  it("rejects a different recovery user and changed provider configuration", async () => {
    const f = fixture();
    f.get();
    f.db.migrate.mockImplementationOnce(() => {
      throw new Error("migration failed");
    });
    await expect(f.initialize()).rejects.toThrow("migration failed");
    f.effectiveUser.getEmail.mockReturnValue("other@example.com");
    await expect(f.initialize()).rejects.toThrow("original effective user");
    f.effectiveUser.getEmail.mockReturnValue("admin@example.com");
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
      kind: "initialization",
    });
    // Model a dependency acquiring/releasing the same native lock between checkpoints.
    f.lock.waitLock();
    f.lock.releaseLock();
    expect(f.get()).toEqual({
      initialized: false,
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
    expect(f.auth.registration.appsScript).toHaveBeenCalledOnce();
    expect(f.state()).toEqual({ initialized: true });
  });
  it("does not renew tokens or resend mail during an active initialization lease", async () => {
    const f = fixture({ tokenTtlMinutes: 1 });
    f.get();
    let finish!: () => void;
    f.db.migrate.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }) as never,
    );
    const first = f.initialize();
    const previous = f.state().bootstrap;
    vi.advanceTimersByTime(60_000);
    f.get();
    expect(f.state().bootstrap).toEqual(previous);
    expect(f.mail.sendEmail).toHaveBeenCalledOnce();
    finish();
    await first;
    expect(f.state()).toEqual({ initialized: true });
  });
  it("reclaims a terminated execution after lease expiry without rerunning migration", async () => {
    const f = fixture();
    f.get();
    const progress = {
      administrator: {
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
    expect(f.auth.registration.appsScript).toHaveBeenCalledWith({
      name: "Admin",
      email: "admin@example.com",
    });
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
    expect(f.auth.registration.appsScript).not.toHaveBeenCalled();
    secondFinish();
    await second;
    expect(f.auth.registration.appsScript).toHaveBeenCalledOnce();
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
    expect(f.auth.registration.appsScript).not.toHaveBeenCalled();
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
    expect(f.auth.registration.appsScript).toHaveBeenCalledOnce();
    expect(Object.isFrozen(hook.mock.calls[0][0])).toBe(true);
  });
});

it.each([
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

describe("rejected input never reaches initialization side effects", () => {
  it.each([
    "invalid",
    "expired",
    "locked",
    "owner",
    "empty-owner",
    "lease",
    "initialized",
    "undelivered",
    "missing",
  ])(
    "RPC rejects %s before every standard or custom action",
    async (reason) => {
      const hooks = {
        migrate: vi.fn(async () => {}),
        assignRole: vi.fn(async () => {}),
        notify: vi.fn(async () => {}),
      };
      const afterInitialize = vi.fn(async () => {});
      const f = fixture({ overrides: hooks, afterInitialize });
      f.get();
      let token = f.state().bootstrap!.token;
      const state = f.state();
      if (reason === "invalid") token = "attacker";
      if (reason === "expired") state.bootstrap!.expiresAt = Date.now();
      if (reason === "locked") state.bootstrap!.attempts = 5;
      if (reason === "owner")
        f.effectiveUser.getEmail.mockReturnValue("visitor@example.com");
      if (reason === "empty-owner")
        f.effectiveUser.getEmail.mockReturnValue("");
      if (reason === "lease")
        state.lease = {
          id: "notification",
          kind: "notification",
          expiresAt: Date.now() + 60000,
        };
      if (reason === "initialized") state.initialized = true;
      if (reason === "undelivered") state.bootstrap!.notified = false;
      if (reason === "missing") delete state.bootstrap;
      f.setState(state);
      f.mail.sendEmail.mockClear();
      await expect(f.initialize(token)).rejects.toThrow();
      for (const fn of [
        f.db.migrate,
        f.auth.registration.appsScript,
        f.auth.registration.email,
        f.auth.account.add,
        f.authRepository.account.findByIdentity,
        f.authRepository.user.find,
        f.authRepository.user.create,
        f.authorization.role.assign,
        f.auth.password.forgot,
        ...Object.values(hooks),
        afterInitialize,
        f.mail.sendEmail,
      ])
        expect(fn).not.toHaveBeenCalled();
    },
  );
  it.each(["bad", "", "expired", "owner", "locked", "missing"])(
    "GET rejects %s without DB, Auth, role, reset delivery or hook calls",
    (reason) => {
      const afterInitialize = vi.fn(async () => {});
      const f = fixture({ afterInitialize });
      f.get();
      const state = f.state();
      let token = state.bootstrap!.token;
      if (reason === "bad" || reason === "") token = reason;
      if (reason === "expired") state.bootstrap!.expiresAt = Date.now();
      if (reason === "owner")
        f.effectiveUser.getEmail.mockReturnValue("other@example.com");
      if (reason === "locked") state.bootstrap!.attempts = 5;
      if (reason === "missing") delete state.bootstrap;
      f.setState(state);
      f.mail.sendEmail.mockClear();
      expect(() => f.get(token)).toThrow();
      for (const fn of [
        f.db.migrate,
        f.auth.registration.appsScript,
        f.auth.registration.email,
        f.auth.account.add,
        f.authRepository.account.findByIdentity,
        f.authRepository.user.find,
        f.authRepository.user.create,
        f.authorization.role.assign,
        f.auth.password.forgot,
        afterInitialize,
        f.mail.sendEmail,
      ])
        expect(fn).not.toHaveBeenCalled();
    },
  );
});

it("spaces retries after mail succeeded but its completion checkpoint failed", () => {
  const f = fixture();
  const save = f.properties.setProperty.getMockImplementation()!;
  let failed = false;
  f.properties.setProperty.mockImplementation((key, value) => {
    if (!failed && JSON.parse(value).bootstrap?.notified) {
      failed = true;
      throw new Error("checkpoint unavailable");
    }
    save(key, value);
  });
  expect(() => f.get()).toThrow("checkpoint unavailable");
  const token = f.state().bootstrap!.token;
  expect(f.state().bootstrap!.notified).toBe(false);
  for (let i = 0; i < 10; i++) f.get();
  expect(f.mail.sendEmail).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(60_000);
  f.get();
  expect(f.mail.sendEmail).toHaveBeenCalledTimes(2);
  expect(f.state().bootstrap!.token).toBe(token);
  expect(f.state().bootstrap!.notified).toBe(true);
  expect(f.db.migrate).not.toHaveBeenCalled();
});

it("ignores a supplied recipient and rejects empty EffectiveUser before notifying", () => {
  const f = fixture();
  f.app.callGet({
    parameter: { email: "attacker@example.com" },
    parameters: {},
  } as unknown as GoogleAppsScript.Events.DoGet);
  expect(f.mail.sendEmail.mock.calls[0][0].to).toBe("admin@example.com");
  const g = fixture();
  g.effectiveUser.getEmail.mockReturnValue("");
  expect(() => g.get()).toThrow("Effective user email");
  expect(g.mail.sendEmail).not.toHaveBeenCalled();
  expect(g.properties.setProperty).not.toHaveBeenCalled();
});

it.each(["", "visitor@example.com", " admin@example.com"])(
  "rejects ActiveUser %s before all initialization calls",
  async (active) => {
    const hook = vi.fn(async () => {});
    const f = fixture({ afterInitialize: hook });
    f.get();
    f.activeUser.getEmail.mockReturnValue(active);
    await expect(f.initialize()).rejects.toThrow("Active and effective users");
    for (const fn of [
      f.db.migrate,
      f.authRepository.user.find,
      f.authRepository.user.create,
      f.auth.registration.email,
      f.auth.registration.appsScript,
      f.auth.account.add,
      f.authRepository.account.findByIdentity,
      f.authorization.role.assign,
      f.auth.password.forgot,
      hook,
    ])
      expect(fn).not.toHaveBeenCalled();
  },
);

it.each([
  "existing",
  "missing-user",
  "foreign-second",
  "wrong-user",
  "wrong-identity",
  "missing-user-account",
])("checks persisted registration consistency: %s", async (partial) => {
  const f = fixture();
  f.get();
  const first = new Account({
    id: "first",
    userId: "stable",
    identity: { providerName: "appsScript", accountId: "admin@example.com" },
  });
  f.accounts.push(first);
  if (partial !== "missing-user")
    f.users.set(
      "stable",
      new User({ id: "stable", name: "Admin", accounts: [first] }),
    );
  if (partial === "foreign-second")
    f.accounts.push(
      new Account({
        id: "second",
        userId: "other",
        identity: {
          providerName: "emailPassword",
          accountId: "admin@example.com",
        },
      }),
    );
  if (partial === "wrong-user")
    f.authRepository.user.find.mockResolvedValueOnce(
      new User({ id: "other", name: "Other", accounts: [first] }),
    );
  if (partial === "wrong-identity")
    f.authRepository.account.findByIdentity.mockResolvedValueOnce(
      new Account({
        ...first,
        identity: {
          providerName: "appsScript",
          accountId: "other@example.com",
        },
      }),
    );
  if (partial === "missing-user-account")
    f.authRepository.user.find.mockResolvedValueOnce(
      new User({ id: "stable", name: "Admin", accounts: [] }),
    );
  if (partial === "existing") {
    await f.initialize();
    expect(f.users.size).toBe(1);
    expect(f.accounts).toHaveLength(2);
    expect(f.authorization.role.assign).toHaveBeenCalledExactlyOnceWith(
      "stable",
      "管理者",
    );
  } else {
    await expect(f.initialize()).rejects.toThrow();
    expect(f.authRepository.user.create).not.toHaveBeenCalled();
    expect(f.auth.account.add).not.toHaveBeenCalled();
    expect(f.authorization.role.assign).not.toHaveBeenCalled();
    expect(f.auth.password.forgot).not.toHaveBeenCalled();
  }
  expect(f.auth.registration.appsScript).not.toHaveBeenCalled();
  expect(f.auth.registration.email).not.toHaveBeenCalled();
});

it("does not add a second Account twice after an interrupted Account write", async () => {
  const f = fixture();
  f.get();
  const add = f.auth.account.add.getMockImplementation()!;
  f.auth.account.add.mockImplementationOnce(async (id, input) => {
    await add(id, input);
    throw new Error("account write interrupted");
  });
  await expect(f.initialize()).rejects.toThrow("account write interrupted");
  await f.initialize();
  expect(f.auth.registration.appsScript).toHaveBeenCalledOnce();
  expect(f.auth.account.add).toHaveBeenCalledOnce();
  expect(f.users.size).toBe(1);
  expect(f.accounts).toHaveLength(2);
});

describe("coded bootstrap errors", () => {
  function rpc(f: ReturnType<typeof fixture>) {
    const payloads: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, options: RequestInit) => {
        const { input } = JSON.parse(options.body as string);
        try {
          return new Response(
            (await f.app.dispatch("initializeApp", input)).contents,
          );
        } catch (cause) {
          const error = cause as Error;
          const payload = JSON.stringify({
            error: {
              name: error.name,
              message: error.message,
              stack: error.stack,
            },
          });
          payloads.push(payload);
          return new Response(payload, { status: 500 });
        }
      }),
    );
    const { client } = appsScriptClient<InferAppsScript<typeof f.app>>({
      transport: new FetchTransport({ endpoint: "/rpc" }),
    });
    return { client, payloads };
  }

  it.each([
    ["invalid", BOOTSTRAP_ERROR_CODES.INVALID_TOKEN],
    ["missing", BOOTSTRAP_ERROR_CODES.INVALID_TOKEN],
    ["expired", BOOTSTRAP_ERROR_CODES.TOKEN_EXPIRED],
    ["locked", BOOTSTRAP_ERROR_CODES.LOCKED],
    ["lease", BOOTSTRAP_ERROR_CODES.IN_PROGRESS],
    ["initialized", BOOTSTRAP_ERROR_CODES.ALREADY_INITIALIZED],
    ["undelivered", BOOTSTRAP_ERROR_CODES.LINK_NOT_READY],
  ])(
    "propagates a safe code and message for %s through RPC",
    async (reason, code) => {
      const f = fixture();
      f.get();
      const state = f.state();
      const token = state.bootstrap!.token;
      if (reason === "missing") delete state.bootstrap;
      if (reason === "expired") state.bootstrap!.expiresAt = Date.now();
      if (reason === "locked") state.bootstrap!.attempts = 5;
      if (reason === "lease")
        state.lease = {
          id: "private-lease",
          kind: "notification",
          expiresAt: Date.now() + 60000,
        };
      if (reason === "initialized") state.initialized = true;
      if (reason === "undelivered") state.bootstrap!.notified = false;
      f.setState(state);
      const { client, payloads } = rpc(f);
      const error = await client
        .initializeApp({
          token: reason === "invalid" ? "invalid-secret-token" : token,
        })
        .catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(AppsScriptRpcError);
      expect(error).toMatchObject({ code, message: expect.any(String) });
      expect((error as Error).message).not.toBe("An unexpected error occurred");
      for (const secret of [
        token,
        "invalid-secret-token",
        "admin@example.com",
        "private-lease",
        '"stack"',
      ]) {
        expect(payloads.join()).not.toContain(secret);
      }
      expect(f.db.migrate).not.toHaveBeenCalled();
    },
  );

  it("converts at the initialization handler boundary but keeps GET errors synchronous", async () => {
    const f = fixture();
    f.get();
    const state = f.state();
    expect(() => f.get("invalid")).toThrow(BootstrapError);
    try {
      f.get("invalid");
    } catch (error) {
      expect(error).toMatchObject({
        code: BOOTSTRAP_ERROR_CODES.INVALID_TOKEN,
      });
      expect(error).not.toBeInstanceOf(AppsScriptError);
    }
    await expect(f.initialize("invalid")).rejects.toBeInstanceOf(
      AppsScriptError,
    );
    await expect(f.initialize("invalid")).rejects.toMatchObject({
      code: BOOTSTRAP_ERROR_CODES.INVALID_TOKEN,
      message: "Invalid bootstrap token",
    });
    expect(f.state().bootstrap!.attempts).toBe(state.bootstrap!.attempts + 4);
    expect(f.get()).toEqual({ initialized: false });
  });

  it("keeps attempt limits, expiry, reissue and successful initialization over RPC", async () => {
    const f = fixture({ maxAttempts: 2, tokenTtlMinutes: 1 });
    f.get();
    const token = f.state().bootstrap!.token;
    const { client } = rpc(f);
    for (let i = 0; i < 2; i++) {
      await expect(
        client.initializeApp({ token: "invalid" }),
      ).rejects.toMatchObject({ code: BOOTSTRAP_ERROR_CODES.INVALID_TOKEN });
    }
    await expect(client.initializeApp({ token })).rejects.toMatchObject({
      code: BOOTSTRAP_ERROR_CODES.LOCKED,
    });
    expect(f.state().bootstrap!.attempts).toBe(2);
    vi.advanceTimersByTime(60000);
    await expect(client.initializeApp({ token })).rejects.toMatchObject({
      code: BOOTSTRAP_ERROR_CODES.TOKEN_EXPIRED,
    });
    f.get();
    await expect(
      client.initializeApp({ token: f.state().bootstrap!.token }),
    ).resolves.toEqual({ initialized: true });
    await expect(client.initializeApp({ token })).rejects.toMatchObject({
      code: BOOTSTRAP_ERROR_CODES.ALREADY_INITIALIZED,
    });
    expect(f.state()).toEqual({ initialized: true });
    expect(f.auth.registration.appsScript).toHaveBeenCalledOnce();
  });

  it.each([
    new Error("internal database secret"),
    { secret: "internal database secret" },
  ])(
    "passes unknown failures through to the common RPC boundary: %s",
    async (cause) => {
      const f = fixture();
      f.get();
      f.db.migrate.mockImplementation(() => {
        throw cause;
      });
      await expect(f.initialize()).rejects.toBe(cause);
      const { client, payloads } = rpc(f);
      const error = await client
        .initializeApp({ token: f.state().bootstrap!.token })
        .catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(AppsScriptRpcError);
      expect(error).toMatchObject({
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
      });
      expect(payloads.join()).not.toContain("internal database secret");
      expect(payloads.join()).not.toContain('"stack"');
      expect(f.state().lease).toBeUndefined();
      f.db.migrate.mockImplementation(() => {});
      await expect(
        client.initializeApp({ token: f.state().bootstrap!.token }),
      ).resolves.toEqual({ initialized: true });
    },
  );
});

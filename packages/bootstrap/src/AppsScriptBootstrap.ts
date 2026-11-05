import type { AppsScriptHttpRequest } from "@gasboost/app";
import type {
  AppState,
  BootstrapOptions,
  BootstrapPublicState,
  BootstrapAdministrator,
  BootstrapAccount,
} from "./types";

type BootstrapStep =
  "migrated" | "registered" | "roleAssigned" | "notified" | "hookCompleted";

export class AppsScriptBootstrap {
  // Exceeds the GAS Web App runtime limit (6 min); do not renew from a running request.
  private static readonly LEASE_MS = 10 * 60_000;
  private readonly ttl: number;
  private readonly maxAttempts: number;

  constructor(private readonly options: BootstrapOptions) {
    this.ttl = (options.tokenTtlMinutes ?? 30) * 60_000;
    this.maxAttempts = options.maxAttempts ?? 5;
    if (
      !Number.isFinite(this.ttl) ||
      this.ttl < 60_000 ||
      this.ttl > 86_400_000
    ) {
      throw new Error("tokenTtlMinutes must be between 1 and 1440");
    }
    if (
      !Number.isInteger(this.maxAttempts) ||
      this.maxAttempts < 1 ||
      this.maxAttempts > 100
    ) {
      throw new Error("maxAttempts must be an integer between 1 and 100");
    }
  }

  /** Synchronous state/notification only. Database initialization is an authenticated RPC. */
  public handle(request: AppsScriptHttpRequest): BootstrapPublicState {
    const result = this.withScriptLock<{
      state: BootstrapPublicState;
      notice?: { leaseId: string; email: string; url: string };
    }>(() => {
      const state = this.read();
      if (state.initialized) return { state: { initialized: true } };
      const email = this.effectiveEmail();
      if (
        (state.bootstrap?.email && state.bootstrap.email !== email) ||
        (state.progress && state.progress.administrator.email !== email)
      ) {
        throw new Error("Bootstrap requires the original effective user");
      }
      const token = request.query("token");
      if (Object.hasOwn(request.query(), "token")) {
        this.verify(state, token, email);
        return { state: { initialized: false } };
      }
      if (state.lease && state.lease.expiresAt > Date.now())
        return { state: { initialized: false } };
      if (
        state.bootstrap?.email &&
        state.bootstrap.expiresAt > Date.now() &&
        state.bootstrap.notified
      ) {
        return { state: { initialized: false } };
      }
      if (
        state.bootstrap?.email &&
        state.bootstrap.expiresAt > Date.now() &&
        (state.bootstrap.retryAt ?? 0) > Date.now()
      )
        return { state: { initialized: false } };
      // No property writes or mail if the deployment URL is invalid.
      const baseUrl = ScriptApp.getService().getUrl();
      if (
        !baseUrl ||
        !/^https:\/\/script\.google\.com\/(?:a\/macros\/[^/]+\/s|macros\/s)\/[A-Za-z0-9_-]+\/exec$/.test(
          baseUrl,
        )
      ) {
        throw new Error(
          "Bootstrap requires a deployed /exec URL; /dev is not supported",
        );
      }
      if (!state.bootstrap?.email || state.bootstrap.expiresAt <= Date.now()) {
        state.bootstrap = {
          token: this.token(),
          expiresAt: Date.now() + this.ttl,
          attempts: 0,
          email,
          notified: false,
        };
      }
      if (state.bootstrap.attempts >= this.maxAttempts)
        throw new Error("Bootstrap is locked until token expiry");
      // Persist retry spacing before the external send, including ambiguous send/checkpoint failures.
      state.bootstrap.retryAt = Date.now() + 60_000;
      const leaseId = Utilities.getUuid();
      state.lease = {
        id: leaseId,
        expiresAt: Date.now() + AppsScriptBootstrap.LEASE_MS,
        kind: "notification",
      };
      this.write(state);
      return {
        state: { initialized: false },
        notice: {
          leaseId,
          email,
          url: `${baseUrl}?token=${encodeURIComponent(state.bootstrap.token)}`,
        },
      };
    });
    if (result.notice) {
      const { leaseId, email, url } = result.notice;
      try {
        MailApp.sendEmail({
          to: email,
          subject: "アプリの初期設定",
          body: `次のリンクからアプリの初期設定を行ってください。\n${url}\nこのリンクを第三者へ共有しないでください。`,
        });
        this.withReservation(leaseId, (state) => {
          state.bootstrap!.notified = true;
          delete state.bootstrap!.retryAt;
          this.write(state);
        });
      } finally {
        this.release(leaseId);
      }
    }
    return result.state;
  }

  public handlers() {
    return {
      initializeApp: (input: { token: string }) => this.initialize(input),
    };
  }

  private async initialize(input: {
    token: string;
  }): Promise<BootstrapPublicState> {
    const { leaseId, administrator, methods } = this.acquire(input);
    try {
      await this.step(leaseId, "migrated", async () => {
        if (this.options.overrides?.migrate)
          await this.options.overrides.migrate(administrator);
        else await this.options.db.migrate();
      });
      await this.step(leaseId, "registered", async () => {
        const user = this.options.overrides?.registerAdministrator
          ? await this.options.overrides.registerAdministrator(administrator)
          : await this.register(administrator, methods);
        if (user.id !== administrator.id)
          throw new Error("Registration must preserve the bootstrap user ID");
      });
      await this.step(leaseId, "roleAssigned", async () => {
        if (this.options.overrides?.assignRole)
          await this.options.overrides.assignRole(administrator);
        else
          await this.options.authorization.role.assign(
            administrator.id,
            administrator.role,
          );
      });
      await this.step(leaseId, "notified", async () => {
        if (this.options.overrides?.notify)
          await this.options.overrides.notify(administrator);
        else if (methods.emailPassword)
          await this.options.auth.password!.forgot({
            email: administrator.email,
          });
      });
      await this.step(leaseId, "hookCompleted", async () => {
        await this.options.afterInitialize?.(administrator);
      });
      this.withLease(leaseId, () => this.write({ initialized: true }));
      return { initialized: true };
    } finally {
      this.release(leaseId);
    }
  }

  private acquire(input: { token: string }) {
    return this.withScriptLock(() => {
      const state = this.read();
      if (state.initialized)
        throw new Error("Application is already initialized");
      if (state.lease && state.lease.expiresAt > Date.now()) {
        throw new Error(
          "Bootstrap initialization is already in progress; retry later",
        );
      }
      const email = this.effectiveEmail();
      this.verify(state, input?.token, email);
      const activeEmail = Session.getActiveUser().getEmail();
      if (!activeEmail.trim() || activeEmail !== email)
        throw new Error(
          "Active and effective users must both be present and match",
        );
      const methods = this.options.auth.registration.methods;
      if (!methods.emailPassword && !methods.appsScript)
        throw new Error("No authentication method is enabled");
      if (
        methods.emailPassword &&
        !this.options.auth.password &&
        !this.options.overrides?.notify
      ) {
        throw new Error(
          "Email authentication requires password reset delivery",
        );
      }
      if (!state.progress) {
        state.progress = {
          administrator: {
            id: Utilities.getUuid(),
            email,
            name: this.options.administrator?.name ?? "システム管理者",
            role: this.options.administrator?.role ?? "管理者",
          },
          methods: { ...methods },
        };
      }
      const progress = state.progress;
      if (progress.administrator.email !== email)
        throw new Error(
          "Bootstrap recovery requires the original effective user",
        );
      if (
        progress.methods.emailPassword !== methods.emailPassword ||
        progress.methods.appsScript !== methods.appsScript
      ) {
        throw new Error(
          "Restore the original authentication configuration before retrying bootstrap",
        );
      }
      const leaseId = Utilities.getUuid();
      state.lease = {
        id: leaseId,
        expiresAt: Date.now() + AppsScriptBootstrap.LEASE_MS,
        kind: "initialization",
      };
      // Commit the fixed administrator ID and lease before any external work.
      this.write(state);
      return {
        leaseId,
        administrator: Object.freeze({ ...progress.administrator }),
        methods: { ...progress.methods },
      };
    });
  }

  private async register(
    administrator: BootstrapAdministrator,
    methods: { emailPassword: boolean; appsScript: boolean },
  ): Promise<{ id: string }> {
    const { auth } = this.options;
    const { id, name, email } = administrator;
    const primary = methods.appsScript ? "appsScript" : "emailPassword";
    const password = () => Utilities.getUuid() + Utilities.getUuid();
    const check = (account: BootstrapAccount, provider: string) => {
      if (
        account.userId !== id ||
        account.identity.providerName !== provider ||
        account.identity.accountId !== email
      ) {
        throw new Error(
          "Account does not belong to the fixed administrator identity",
        );
      }
    };
    let user = await auth.user.find(id);
    if (!user) {
      const orphan = await auth.account.findByIdentity(primary, email);
      if (orphan) {
        check(orphan, primary);
        // Repair a missing User row only for an Account belonging to our pre-recorded ID.
        await auth.user.create({ id, name });
        user = await auth.user.find(id);
        if (!user) throw new Error("User recovery was not persisted");
      } else {
        user = methods.appsScript
          ? await auth.registration.appsScript({ id, name, email })
          : await auth.registration.email({
              id,
              name,
              email,
              password: password(),
            });
      }
    }
    if (user.id !== id)
      throw new Error("Registration must preserve the bootstrap user ID");
    for (const provider of ["appsScript", "emailPassword"] as const) {
      if (!methods[provider]) continue;
      const account = user.accounts.find(
        (account) => account.identity.providerName === provider,
      );
      if (account) {
        check(account, provider);
        continue;
      }
      const existing = await auth.account.findByIdentity(provider, email);
      if (existing) {
        check(existing, provider);
        const refreshed = await auth.user.find(id);
        if (
          !refreshed?.accounts.some(
            (account) =>
              account.identity.providerName === provider &&
              account.identity.accountId === email &&
              account.userId === id,
          )
        ) {
          throw new Error("Account recovery is inconsistent");
        }
        user = refreshed;
        continue;
      }
      await auth.account.add(
        id,
        provider === "emailPassword"
          ? { provider, email, password: password() }
          : { provider, email },
      );
    }
    return { id };
  }

  private async step(
    leaseId: string,
    step: BootstrapStep,
    run: () => Promise<void>,
  ): Promise<void> {
    if (this.withLease(leaseId, (_state, progress) => progress[step])) return;
    // No native lock across DB/Auth/notification/hook calls: SheetORM v4 uses ScriptLock itself.
    await run();
    this.withLease(leaseId, (state, progress) => {
      progress[step] = true;
      this.write(state);
    });
  }

  private withLease<T>(
    leaseId: string,
    run: (state: AppState, progress: NonNullable<AppState["progress"]>) => T,
  ): T {
    return this.withReservation(leaseId, (state) => {
      if (!state.progress) throw new Error("Invalid bootstrap recovery state");
      return run(state, state.progress);
    });
  }

  private withReservation<T>(leaseId: string, run: (state: AppState) => T): T {
    return this.withScriptLock(() => {
      const state = this.read();
      if (
        state.initialized ||
        state.lease?.id !== leaseId ||
        state.lease.expiresAt <= Date.now()
      ) {
        throw new Error("Bootstrap execution lease was lost or expired");
      }
      return run(state);
    });
  }

  private release(leaseId: string): void {
    this.withScriptLock(() => {
      const state = this.read();
      if (state.lease?.id !== leaseId) return;
      delete state.lease;
      this.write(state);
    });
  }

  private effectiveEmail(): string {
    const email = Session.getEffectiveUser().getEmail();
    if (!email.trim()) throw new Error("Effective user email is unavailable");
    return email;
  }

  private verify(state: AppState, token: unknown, email: string): void {
    const challenge = state.bootstrap;
    if (!challenge?.email)
      throw new Error("Open the application to issue a bootstrap link");
    if (challenge.expiresAt <= Date.now())
      throw new Error("Bootstrap token has expired; reload the application");
    if (challenge.attempts >= this.maxAttempts)
      throw new Error("Bootstrap is locked until token expiry");
    if (typeof token !== "string" || !this.equal(token, challenge.token)) {
      challenge.attempts += 1;
      this.write(state);
      throw new Error("Invalid bootstrap token");
    }
    if (challenge.email !== email)
      throw new Error("Bootstrap requires the original effective user");
    if (!challenge.notified)
      throw new Error(
        "Bootstrap link delivery is incomplete; open /exec without token to retry",
      );
  }

  private withScriptLock<T>(run: () => T): T {
    const lock = LockService.getScriptLock();
    lock.waitLock(30_000);
    try {
      return run();
    } finally {
      lock.releaseLock();
    }
  }

  private read(): AppState {
    const raw =
      PropertiesService.getScriptProperties().getProperty("APP_STATE");
    if (raw === null) return { initialized: false };
    const state: AppState = JSON.parse(raw);
    // Fail closed instead of replacing corrupt state and creating another administrator.
    if (!state || typeof state.initialized !== "boolean")
      throw new Error("Invalid APP_STATE");
    if (
      state.bootstrap &&
      (typeof state.bootstrap.token !== "string" ||
        state.bootstrap.token.length > 256 ||
        !state.bootstrap.token.length ||
        !Number.isFinite(state.bootstrap.expiresAt) ||
        !Number.isInteger(state.bootstrap.attempts) ||
        state.bootstrap.attempts < 0)
    ) {
      throw new Error("Invalid bootstrap state");
    }
    if (
      state.bootstrap?.email !== undefined &&
      (typeof state.bootstrap.email !== "string" ||
        !state.bootstrap.email ||
        typeof state.bootstrap.notified !== "boolean" ||
        (state.bootstrap.retryAt !== undefined &&
          !Number.isFinite(state.bootstrap.retryAt)))
    ) {
      throw new Error("Invalid bootstrap notification state");
    }
    if (
      state.lease &&
      (typeof state.lease.id !== "string" ||
        !state.lease.id ||
        !Number.isFinite(state.lease.expiresAt) ||
        (!state.progress && state.lease.kind !== "notification") ||
        (state.lease.kind !== undefined &&
          state.lease.kind !== "notification" &&
          state.lease.kind !== "initialization"))
    ) {
      throw new Error("Invalid bootstrap lease state");
    }
    if (
      state.progress &&
      (!state.progress.administrator?.id ||
        !state.progress.administrator.email ||
        typeof state.progress.administrator.name !== "string" ||
        typeof state.progress.administrator.role !== "string" ||
        typeof state.progress.methods?.emailPassword !== "boolean" ||
        typeof state.progress.methods.appsScript !== "boolean")
    ) {
      throw new Error("Invalid bootstrap recovery state");
    }
    return state;
  }

  private write(state: AppState): void {
    PropertiesService.getScriptProperties().setProperty(
      "APP_STATE",
      JSON.stringify(state),
    );
  }

  private token(): string {
    return Utilities.getUuid() + Utilities.getUuid();
  }

  private equal(left: string, right: string): boolean {
    let difference = left.length ^ right.length;
    for (let index = 0; index < right.length; index++) {
      difference |= (left.charCodeAt(index) || 0) ^ right.charCodeAt(index);
    }
    return difference === 0;
  }
}

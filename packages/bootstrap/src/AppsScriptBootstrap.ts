import type { AppsScriptMiddleware } from "@gasboost/app";
import type { AppState, BootstrapOptions, BootstrapPublicState } from "./types";

type BootstrapStep =
  "migrated" | "registered" | "roleAssigned" | "notified" | "hookCompleted";

export class AppsScriptBootstrap {
  // Exceeds the GAS Web App runtime limit (6 min); do not renew from a running request.
  private static readonly LEASE_MS = 10 * 60_000;
  public readonly KEY = "bootstrap" as const;
  private readonly digits: number;
  private readonly ttl: number;
  private readonly maxAttempts: number;

  constructor(private readonly options: BootstrapOptions) {
    this.digits = options.tokenDigits ?? 6;
    this.ttl = (options.tokenTtlMinutes ?? 30) * 60_000;
    this.maxAttempts = options.maxAttempts ?? 5;
    if (!Number.isInteger(this.digits) || this.digits < 6 || this.digits > 32) {
      throw new Error("tokenDigits must be an integer between 6 and 32");
    }
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

  public middleware(): AppsScriptMiddleware<
    {},
    { bootstrap: BootstrapPublicState }
  > {
    return (context, next) => {
      const lock = LockService.getScriptLock();
      lock.waitLock(30_000);
      try {
        const state = this.read();
        if (!state.initialized) {
          if (!state.bootstrap || state.bootstrap.expiresAt <= Date.now()) {
            state.bootstrap = {
              token: this.token(),
              expiresAt: Date.now() + this.ttl,
              attempts: 0,
            };
            this.write(state);
          }
          context.state.set(this.KEY, {
            initialized: false,
            settingsUrl: `https://script.google.com/home/projects/${encodeURIComponent(ScriptApp.getScriptId())}/settings`,
          });
        } else {
          context.state.set(this.KEY, { initialized: true });
        }
      } finally {
        lock.releaseLock();
      }
      return next();
    };
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
          : await this.options.auth.registration.ensure({
              ...administrator,
              ...(methods.emailPassword
                ? { password: Utilities.getUuid() + Utilities.getUuid() }
                : {}),
            });
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
      this.withScriptLock(() => {
        const state = this.read();
        // A stale execution must never release a successor's lease.
        if (state.lease?.id !== leaseId) return;
        delete state.lease;
        this.write(state);
      });
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
      const challenge = state.bootstrap;
      if (!challenge)
        throw new Error("Open the application to issue a bootstrap token");
      if (challenge.expiresAt <= Date.now())
        throw new Error("Bootstrap token has expired; reload the application");
      if (challenge.attempts >= this.maxAttempts)
        throw new Error("Bootstrap is locked until token expiry");
      if (
        typeof input?.token !== "string" ||
        !this.equal(input.token, challenge.token)
      ) {
        challenge.attempts += 1;
        this.write(state);
        throw new Error("Invalid bootstrap token");
      }
      const email = Session.getActiveUser().getEmail().trim();
      if (!email)
        throw new Error(
          "Active user email is unavailable; check the GAS deployment settings",
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
        throw new Error("Bootstrap recovery requires the original active user");
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
    return this.withScriptLock(() => {
      const state = this.read();
      if (
        state.initialized ||
        state.lease?.id !== leaseId ||
        state.lease.expiresAt <= Date.now() ||
        !state.progress
      ) {
        throw new Error("Bootstrap execution lease was lost or expired");
      }
      // Read current state at every checkpoint, preserving concurrent GET/token updates.
      return run(state, state.progress);
    });
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
    // Fail closed instead of replacing corrupt state and provisioning another administrator.
    if (!state || typeof state.initialized !== "boolean")
      throw new Error("Invalid APP_STATE");
    if (
      state.bootstrap &&
      (typeof state.bootstrap.token !== "string" ||
        !/^\d{6,32}$/.test(state.bootstrap.token) ||
        !Number.isFinite(state.bootstrap.expiresAt) ||
        !Number.isInteger(state.bootstrap.attempts) ||
        state.bootstrap.attempts < 0)
    ) {
      throw new Error("Invalid bootstrap state");
    }
    if (
      state.lease &&
      (typeof state.lease.id !== "string" ||
        !state.lease.id ||
        !Number.isFinite(state.lease.expiresAt) ||
        !state.progress)
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
    // UUID entropy from GAS, SHA-256, rejection sampling (no modulo bias).
    let result = "";
    while (result.length < this.digits) {
      const bytes = Utilities.computeDigest(
        Utilities.DigestAlgorithm.SHA_256,
        Utilities.getUuid() + Utilities.getUuid(),
        Utilities.Charset.UTF_8,
      );
      for (const signed of bytes) {
        const byte = signed & 255;
        if (byte < 250) result += String(byte % 10);
        if (result.length === this.digits) break;
      }
    }
    return result;
  }

  private equal(left: string, right: string): boolean {
    let difference = left.length ^ right.length;
    for (let index = 0; index < right.length; index++) {
      difference |= (left.charCodeAt(index) || 0) ^ right.charCodeAt(index);
    }
    return difference === 0;
  }
}

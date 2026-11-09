import type { AppsScriptAuthRepository } from "@gasboost/auth";

export type { BootstrapPublicState } from "./BootstrapPublicState";

export type BootstrapAccount = {
  userId: string;
  identity: { providerName: string; accountId: string };
};
export type BootstrapUser = {
  id: string;
  accounts: readonly BootstrapAccount[];
};

/** Public server management APIs. */
export interface BootstrapAuth {
  registration: {
    readonly methods: {
      readonly emailPassword: boolean;
      readonly appsScript: boolean;
    };
    email(input: {
      name: string;
      email: string;
      password: string;
    }): Promise<BootstrapUser>;
    appsScript(input: { name: string; email: string }): Promise<BootstrapUser>;
  };
  account: {
    add(
      userId: string,
      input:
        | { provider: "appsScript"; email: string }
        | { provider: "emailPassword"; email: string; password: string },
    ): Promise<BootstrapAccount>;
  };
  password?: { forgot(input: { email: string }): Promise<void> };
}

export type BootstrapAdministrator = {
  id: string;
  email: string;
  name: string;
  role: string;
};
export type BootstrapContext = Readonly<BootstrapAdministrator>;
export type BootstrapOptions = {
  db: { migrate(): void | Promise<void> };
  auth: BootstrapAuth;
  /** The same repository instance used to construct auth. */
  authRepository: AppsScriptAuthRepository;
  authorization: {
    role: { assign(userId: string, role: string): Promise<void> };
  };
  administrator?: { name?: string; role?: string };
  tokenTtlMinutes?: number;
  maxAttempts?: number;
  /** Replacements must be idempotent: a process may stop after an external write. */
  overrides?: {
    migrate?(
      context: Readonly<Omit<BootstrapAdministrator, "id"> & { id?: string }>,
    ): void | Promise<void>;
    assignRole?(context: BootstrapContext): Promise<void>;
    notify?(context: BootstrapContext): Promise<void>;
  };
  /** Retried if it throws, or execution stops before the completion write. */
  afterInitialize?(context: BootstrapContext): void | Promise<void>;
};

export type AppState = {
  initialized: boolean;
  bootstrap?: {
    token: string;
    expiresAt: number;
    attempts: number;
    email?: string;
    notified?: boolean;
    retryAt?: number;
  };
  /** Exclusive execution reservation; mutated only while holding ScriptLock. */
  lease?: {
    id: string;
    expiresAt: number;
    kind?: "notification" | "initialization";
  };
  progress?: {
    administrator: Omit<BootstrapAdministrator, "id"> & { id?: string };
    methods: { emailPassword: boolean; appsScript: boolean };
    migrated?: boolean;
    registered?: boolean;
    roleAssigned?: boolean;
    notified?: boolean;
    hookCompleted?: boolean;
  };
};

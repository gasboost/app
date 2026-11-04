/** Safe to embed in HTML. Secrets and recovery data never appear here. */
export type BootstrapPublicState = {
  initialized: boolean;
  settingsUrl?: string;
};

/** Structural subset of @gasboost/auth >=0.8.0; no runtime Auth import. */
export interface BootstrapAuth {
  registration: {
    readonly methods: {
      readonly emailPassword: boolean;
      readonly appsScript: boolean;
    };
    ensure(input: {
      id: string;
      name: string;
      email: string;
      password?: string;
    }): Promise<{ id: string }>;
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
  authorization: {
    role: { assign(userId: string, role: string): Promise<void> };
  };
  administrator?: { name?: string; role?: string };
  tokenDigits?: number;
  tokenTtlMinutes?: number;
  maxAttempts?: number;
  /** Replacements must be idempotent: a process may stop after an external write. */
  overrides?: {
    migrate?(context: BootstrapContext): void | Promise<void>;
    registerAdministrator?(context: BootstrapContext): Promise<{ id: string }>;
    assignRole?(context: BootstrapContext): Promise<void>;
    notify?(context: BootstrapContext): Promise<void>;
  };
  /** Retried if it throws, or execution stops before the completion write. */
  afterInitialize?(context: BootstrapContext): void | Promise<void>;
};

export type AppState = {
  initialized: boolean;
  bootstrap?: { token: string; expiresAt: number; attempts: number };
  progress?: {
    administrator: BootstrapAdministrator;
    methods: { emailPassword: boolean; appsScript: boolean };
    migrated?: boolean;
    registered?: boolean;
    roleAssigned?: boolean;
    notified?: boolean;
    hookCompleted?: boolean;
  };
};

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { AppsScriptBootstrap } from "../dist/index.js";
import { AppsScript, AppsScriptHttpRequest } from "@gasboost/app";
import { appsScriptClient } from "@gasboost/client";

const requirePublished = createRequire(import.meta.url);
const {
  AppsScriptAuth,
  AppsScriptAuthorization,
  createAuthTables,
  createAuthorizationTables,
} = requirePublished("@gasboost/auth");
const { AuthorizationPolicy } = requirePublished(
  "@gasboost/auth/authorization",
);
const { SheetOrmAuthRepository, SheetOrmAuthorizationRepository } =
  requirePublished("@gasboost/auth-sheetorm");
const { SheetDB, SheetTable } = requirePublished("@gasboost/sheetorm");
const { NodeUtilities } = requirePublished("@gasboost/fake-node");
const { NodeLockService } = requirePublished("@gasboost/fake-node");
const { InMemoryCacheService } = requirePublished("@gasboost/fake-core");

// Real Auth and DB APIs, in-memory sheet gateway; no Google services or mail are contacted.
class Gateway {
  records = new Map();
  current = "";
  onWrite = () => {};
  table(sheetName, dbId) {
    this.current = `${dbId}:${sheetName}`;
  }
  read() {
    return structuredClone(this.records.get(this.current) ?? []);
  }
  readMany(tables) {
    return new Map(
      tables.map(({ dbId, sheetName }) => {
        const key = `${dbId}:${sheetName}`;
        return [key, structuredClone(this.records.get(key) ?? [])];
      }),
    );
  }
  insert(records) {
    this.onWrite();
    this.records.set(this.current, [
      ...this.read(),
      ...structuredClone(records),
    ]);
  }
  update(records, current) {
    this.onWrite();
    records.forEach((record) => current.replace({ ...record }));
    this.records.set(this.current, structuredClone(current.getValues()));
  }
  delete(keys, current) {
    this.onWrite();
    keys.forEach((key) => current.remove(key));
    this.records.set(this.current, structuredClone(current.getValues()));
  }
  rewrite(records) {
    this.onWrite();
    this.records.set(this.current, structuredClone(records));
  }
  setColumns() {
    this.onWrite();
  }
  protect() {}
  count() {
    return this.read().length;
  }
  lastId(key) {
    return Math.max(
      0,
      ...this.read().map((record) =>
        typeof record[key] === "number" ? record[key] : 0,
      ),
    );
  }
}

for (const [emailPassword, appsScript] of [
  [true, false],
  [false, true],
  [true, true],
]) {
  test(`real Auth/SheetORM: email=${emailPassword}, GAS=${appsScript}`, async () => {
    const authTables = createAuthTables();
    const roleTables = createAuthorizationTables();
    const utilities = new NodeUtilities();
    const cacheService = new InMemoryCacheService();
    const scriptId = utilities.getUuid();
    const lockService = new NodeLockService({ scriptId, userId: "admin" });
    const competitorLocks = new NodeLockService({
      scriptId,
      userId: "other-request",
    });
    // Keep real shared handles; fail fast on a collision instead of waiting minutes in a regression.
    const getScriptLock = lockService.getScriptLock.bind(lockService);
    lockService.getScriptLock = () => {
      const lock = getScriptLock();
      const tryLock = lock.tryLock.bind(lock);
      lock.tryLock = () => {
        if (!tryLock(0))
          throw new Error("Nested acquisition of the shared ScriptLock");
        return true;
      };
      return lock;
    };
    function assertNativeLock(held) {
      const probe = competitorLocks.getScriptLock();
      const acquired = probe.tryLock(0);
      if (acquired) probe.releaseLock();
      assert.equal(
        acquired,
        !held,
        held
          ? "APP_STATE access must hold ScriptLock"
          : "external work must release ScriptLock",
      );
    }
    const gateway = new Gateway();
    const db = new SheetDB({
      tables: [
        authTables.user,
        authTables.account,
        authTables.passwordReset,
        roleTables.role,
        roleTables.permission,
      ].map(
        (table) => new SheetTable({ ...table, dbId: "bootstrap-integration" }),
      ),
      gateway,
      cacheService,
      utilities,
      lockService,
    });
    let raw = null;
    let failRegistrationCheckpoint = true;
    const propertiesService = {
      getScriptProperties: () => ({
        getProperty: () => {
          assertNativeLock(true);
          return raw;
        },
        setProperty: (_key, value) => {
          assertNativeLock(true);
          if (
            failRegistrationCheckpoint &&
            JSON.parse(value).progress?.registered
          ) {
            failRegistrationCheckpoint = false;
            throw new Error("registration checkpoint interrupted");
          }
          raw = value;
        },
      }),
    };
    let activeEmail = "admin@example.com";
    const session = {
      getActiveUser: () => ({ getEmail: () => activeEmail }),
      getEffectiveUser: () => ({ getEmail: () => "admin@example.com" }),
    };
    const setupMessages = [];
    Object.assign(globalThis, {
      Utilities: utilities,
      PropertiesService: propertiesService,
      Session: session,
      ScriptApp: {
        getService: () => ({
          getUrl: () => "https://script.google.com/macros/s/integration/exec",
        }),
      },
      MailApp: {
        sendEmail: (message) => {
          assertNativeLock(false);
          setupMessages.push(message);
        },
      },
      LockService: lockService,
    });
    const repository = new SheetOrmAuthRepository({
      db,
      schema: authTables.schema,
    });
    const messages = [];
    const auth = new AppsScriptAuth({
      repository,
      session: { storageType: "cache" },
      runtime: { utilities, session, propertiesService, cacheService },
      emailPassword: {
        enabled: emailPassword,
        pepper: "integration-pepper",
        iterations: 1,
        passwordReset: {
          delivery: {
            async send(message) {
              await assertExclusive("notify");
              messages.push(message);
              if (messages.length === 1)
                throw new Error("notification interrupted");
            },
          },
        },
      },
      appsScript: { enabled: appsScript },
    });
    const authorization = new AppsScriptAuthorization({
      policy: new AuthorizationPolicy({ app: ["manage"] }).linkRole("管理者", {
        app: ["manage"],
      }),
      repository: new SheetOrmAuthorizationRepository({
        db,
        schema: roleTables.schema,
      }),
    });
    const observedStages = [];
    const options = {
      db,
      auth,
      authRepository: repository,
      authorization,
      afterInitialize: () => assertExclusive("hook"),
    };
    const competingRequest = new AppsScriptBootstrap(options);
    async function assertExclusive(stage) {
      assertNativeLock(false);
      const lease = JSON.parse(raw).lease;
      assert.ok(lease?.id);
      assert.ok(lease.expiresAt > Date.now());
      await assert.rejects(
        competingRequest
          .handlers()
          .initializeApp({ token: JSON.parse(raw).bootstrap.token }),
        /already in progress/,
      );
      assert.deepEqual(JSON.parse(raw).lease, lease);
      observedStages.push(stage);
    }
    // Probe from inside real SheetORM writes, after its short internal lock was released.
    const probes = [];
    gateway.onWrite = () => {
      probes.push(assertExclusive("DB write"));
    };
    const migrate = db.migrate.bind(db);
    db.migrate = async () => {
      await assertExclusive("migrate");
      migrate();
    };
    let registrationCalls = 0;
    const interruptRegistration = (user) => {
      registrationCalls++;
      throw new Error("registration write interrupted");
    };
    const register = auth.registration.appsScript.bind(auth.registration);
    auth.registration.appsScript = async (input) => {
      await assertExclusive("register");
      return interruptRegistration(await register(input));
    };
    const registerEmail = auth.registration.email.bind(auth.registration);
    auth.registration.email = async (input) => {
      await assertExclusive("register");
      return interruptRegistration(await registerEmail(input));
    };
    let accountCalls = 0;
    const addAccount = auth.account.add.bind(auth.account);
    auth.account.add = async (...args) => {
      const account = await addAccount(...args);
      accountCalls++;
      if (accountCalls === 1) throw new Error("account write interrupted");
      return account;
    };
    const assign = authorization.role.assign.bind(authorization.role);
    authorization.role.assign = async (...args) => {
      await assertExclusive("assign");
      return assign(...args);
    };
    const bootstrap = new AppsScriptBootstrap(options);
    const app = new AppsScript()
      .get((request) => {
        const state = bootstrap.handle(request);
        assert.deepEqual(state, { initialized: false });
        return {};
      })
      .calls(bootstrap.handlers());
    const request = new AppsScriptHttpRequest({
      parameter: {},
      parameters: {},
    });
    assert.deepEqual(bootstrap.handle(request), { initialized: false });
    assert.equal(setupMessages.length, 1);
    const input = {
      token: new URL(setupMessages[0].body.split("\n")[1]).searchParams.get(
        "token",
      ),
    };
    assert.equal(input.token, JSON.parse(raw).bootstrap.token);
    assert.deepEqual(
      bootstrap.handle(
        new AppsScriptHttpRequest({
          parameter: { token: input.token },
          parameters: {},
        }),
      ),
      { initialized: false },
    );
    assert.equal(setupMessages.length, 1);
    const { client } = appsScriptClient({
      transport: {
        call: (name, input, metadata) => app.dispatch(name, input, metadata),
      },
    });
    for (const invalidActive of ["", "visitor@example.com"]) {
      activeEmail = invalidActive;
      await assert.rejects(
        client.initializeApp(input),
        /Active and effective users/,
      );
      assert.equal(gateway.records.size, 0);
      assert.deepEqual(observedStages, []);
    }
    activeEmail = "admin@example.com";
    await assert.rejects(
      client.initializeApp(input),
      /registration write interrupted/,
    );
    const registeredId = db.table("user").find()[0].id;
    assert.equal(JSON.parse(raw).progress.administrator.id, undefined);
    assert.equal(db.table("user").find().length, 1);
    assert.ok(registeredId);
    if (emailPassword && appsScript) {
      await assert.rejects(
        client.initializeApp(input),
        /account write interrupted/,
      );
    }
    await assert.rejects(
      client.initializeApp(input),
      /registration checkpoint interrupted/,
    );
    assert.equal(registrationCalls, 1);
    assert.equal(accountCalls, emailPassword && appsScript ? 1 : 0);
    if (emailPassword) {
      await assert.rejects(
        client.initializeApp(input),
        /notification interrupted/,
      );
      assert.equal(JSON.parse(raw).initialized, false);
    }
    await client.initializeApp(input);
    assert.deepEqual(JSON.parse(raw), { initialized: true });
    await Promise.all(probes);
    assert.ok(probes.length > 0);
    assert.ok(observedStages.includes("migrate"));
    assert.ok(observedStages.includes("register"));
    assert.ok(observedStages.includes("assign"));
    assert.ok(observedStages.includes("hook"));
    if (emailPassword) assert.ok(observedStages.includes("notify"));
    gateway.onWrite = () => {};
    const users = db.table("user").find();
    assert.equal(users.length, 1);
    assert.equal(users[0].id, registeredId);
    assert.equal(
      db.table("account").find().length,
      emailPassword && appsScript ? 2 : 1,
    );
    assert.equal(db.table("authorizationRole").find().length, 1);
    assert.equal(
      await authorization.can(users[0].id, { app: ["manage"] }),
      true,
    );
    if (emailPassword) {
      assert.equal(messages.length, 2);
      assert.notEqual(messages[0].token, messages[1].token);
      await assert.rejects(
        auth.password.reset({
          token: messages[0].token,
          newPassword: "old-token-rejected",
        }),
      );
      await auth.password.reset({
        token: messages[1].token,
        newPassword: "administrator-chosen-password",
      });
      const signedIn = await auth.signIn.email({
        email: "admin@example.com",
        password: "administrator-chosen-password",
      });
      assert.equal(signedIn.session.userId, users[0].id);
    }
    await assert.rejects(
      bootstrap.handlers().initializeApp(input),
      /already initialized/,
    );
    for (const name of [
      "Utilities",
      "PropertiesService",
      "Session",
      "ScriptApp",
      "LockService",
      "MailApp",
    ])
      delete globalThis[name];
  });
}

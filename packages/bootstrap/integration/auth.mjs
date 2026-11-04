// Run after building both workspaces:
// GASBOOST_AUTH_WORKSPACE=/path/to/auth pnpm --filter @gasboost/bootstrap test:integration
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test } from "node:test";
import { AppsScriptBootstrap } from "../dist/index.js";

const workspace = process.env.GASBOOST_AUTH_WORKSPACE;
if (!workspace)
  throw new Error(
    "Set GASBOOST_AUTH_WORKSPACE to the built gasboost/auth checkout (auth#49 or later)",
  );
const requireCore = createRequire(
  resolve(workspace, "packages/auth-core/package.json"),
);
const requireAdapter = createRequire(
  resolve(workspace, "packages/auth-sheetorm/package.json"),
);
const {
  AppsScriptAuth,
  AppsScriptAuthorization,
  createAuthTables,
  createAuthorizationTables,
} = requireCore("./dist/index.js");
const { AuthorizationPolicy } = requireCore("./dist/authorization/index.js");
const { SheetOrmAuthRepository, SheetOrmAuthorizationRepository } =
  requireAdapter("./dist/index.js");
const { SheetDB, SheetTable } = requireAdapter("@gasboost/sheetorm");
const { NodeUtilities } = requireCore("@gasboost/fake-node");
const { InMemoryCacheService } = requireCore("@gasboost/fake-core");

// Real Auth and DB APIs, in-memory sheet gateway; no Google services or mail are contacted.
class Gateway {
  records = new Map();
  current = "";
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
    this.records.set(this.current, [
      ...this.read(),
      ...structuredClone(records),
    ]);
  }
  update(records, current) {
    records.forEach((record) => current.replace({ ...record }));
    this.records.set(this.current, structuredClone(current.getValues()));
  }
  delete(keys, current) {
    keys.forEach((key) => current.remove(key));
    this.records.set(this.current, structuredClone(current.getValues()));
  }
  rewrite(records) {
    this.records.set(this.current, structuredClone(records));
  }
  setColumns() {}
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
      gateway: new Gateway(),
      cacheService,
      utilities,
    });
    let raw = null;
    const propertiesService = {
      getScriptProperties: () => ({
        getProperty: () => raw,
        setProperty: (_key, value) => {
          raw = value;
        },
      }),
    };
    const session = {
      getActiveUser: () => ({ getEmail: () => "admin@example.com" }),
    };
    let locked = false;
    Object.assign(globalThis, {
      Utilities: utilities,
      PropertiesService: propertiesService,
      Session: session,
      ScriptApp: { getScriptId: () => "integration" },
      LockService: {
        getScriptLock: () => ({
          waitLock() {
            assert.equal(locked, false);
            locked = true;
          },
          releaseLock() {
            locked = false;
          },
        }),
      },
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
    const bootstrap = new AppsScriptBootstrap({ db, auth, authorization });
    let state;
    bootstrap.middleware()(
      {
        state: {
          set: (_key, value) => {
            state = value;
          },
        },
      },
      () => {},
    );
    assert.deepEqual(state, {
      initialized: false,
      settingsUrl:
        "https://script.google.com/home/projects/integration/settings",
    });
    const input = { token: JSON.parse(raw).bootstrap.token };
    if (emailPassword) {
      await assert.rejects(
        bootstrap.handlers().initializeApp(input),
        /notification interrupted/,
      );
      assert.equal(JSON.parse(raw).initialized, false);
    }
    await bootstrap.handlers().initializeApp(input);
    assert.deepEqual(JSON.parse(raw), { initialized: true });
    const users = db.table("user").find();
    assert.equal(users.length, 1);
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
    ])
      delete globalThis[name];
  });
}

import { AppsScript, type InferAppsScript } from "../src/AppsScript";

const app = new AppsScript<{
  user: string;
  authenticated: boolean;
}>()
  .call("getUser", (id: string) => ({
    id,
    createdAt: new Date(),
  }))
  .use((state, next) => {
    state.set("user", "alice");
    state.set("authenticated", true);

    return next();
  })
  .call("sum", (a: number, b: number) => a + b);

type App = InferAppsScript<typeof app>;

const getUserArgs: App["getUser"]["args"] = ["123"];

const getUserResult: App["getUser"]["result"] = {
  id: "123",
  createdAt: new Date().toISOString(),
};

const sumArgs: App["sum"]["args"] = [1, 2];

const sumResult: App["sum"]["result"] = 3;

void getUserArgs;
void getUserResult;
void sumArgs;
void sumResult;

app.state.set("user", "alice");
app.state.set("authenticated", true);

const user: string | undefined = app.state.get("user");
const authenticated: boolean | undefined = app.state.get("authenticated");

void user;
void authenticated;

// @ts-expect-error 存在しないstate keyは設定できない
app.state.set("missing", "value");

// @ts-expect-error userにはstring以外を設定できない
app.state.set("user", 123);

// @ts-expect-error authenticatedにはboolean以外を設定できない
app.state.set("authenticated", "true");

// @ts-expect-error getUserの第1引数はstring
const invalidGetUserArgs: App["getUser"]["args"] = [123];

// @ts-expect-error sumの引数はnumber, number
const invalidSumArgs: App["sum"]["args"] = ["1", "2"];

const invalidGetUserResult: App["getUser"]["result"] = {
  id: "123",
  // @ts-expect-error Dateはclient側ではstringになる
  createdAt: new Date(),
};

void invalidGetUserArgs;
void invalidSumArgs;
void invalidGetUserResult;

const appWithMiddlewareBetweenCalls = new AppsScript<{
  user: string;
}>()
  .call("first", () => 1)
  .use((_state, next) => next())
  .call("second", () => "second");

type AppWithMiddlewareBetweenCalls = InferAppsScript<
  typeof appWithMiddlewareBetweenCalls
>;

const firstResult: AppWithMiddlewareBetweenCalls["first"]["result"] = 1;
const secondResult: AppWithMiddlewareBetweenCalls["second"]["result"] =
  "second";

void firstResult;
void secondResult;

const appWithCalls = new AppsScript().calls({
  getUser: (id: string) => ({
    id,
    createdAt: new Date(),
  }),
  sum: (a: number, b: number) => a + b,
} as const);

type AppWithCalls = InferAppsScript<typeof appWithCalls>;

const callsGetUserArgs: AppWithCalls["getUser"]["args"] = ["123"];
const callsGetUserResult: AppWithCalls["getUser"]["result"] = {
  id: "123",
  createdAt: new Date().toISOString(),
};
const callsSumArgs: AppWithCalls["sum"]["args"] = [1, 2];
const callsSumResult: AppWithCalls["sum"]["result"] = 3;

void callsGetUserArgs;
void callsGetUserResult;
void callsSumArgs;
void callsSumResult;

// @ts-expect-error getUserの引数はstring
const invalidCallsGetUserArgs: AppWithCalls["getUser"]["args"] = [123];

// @ts-expect-error sumの引数はnumber, number
const invalidCallsSumArgs: AppWithCalls["sum"]["args"] = ["1", "2"];

void invalidCallsGetUserArgs;
void invalidCallsSumArgs;

const handlers = {
  findUser: (id: string) => ({ id }),
  countUsers: () => 10,
};

const appWithHandlerObject = new AppsScript().calls(handlers);

type AppWithHandlerObject = InferAppsScript<typeof appWithHandlerObject>;

const findUserArgs: AppWithHandlerObject["findUser"]["args"] = ["1"];
const countUsersResult: AppWithHandlerObject["countUsers"]["result"] = 10;

void findUserArgs;
void countUsersResult;

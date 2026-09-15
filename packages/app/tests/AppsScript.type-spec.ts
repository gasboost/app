import {
  AppsScript,
  type AppsScriptCallInvocation,
  type AppsScriptGetInvocation,
  type AppsScriptInvocation,
  type AppsScriptMiddleware,
  type AppsScriptPostInvocation,
  type InferAppsScript,
} from "../src";

const app = new AppsScript<{
  user: string;
  authenticated: boolean;
}>()
  .call("getUser", ({ id }: { id: string }) => ({
    id,
    createdAt: new Date(),
  }))
  .use<{}, { user: string; authenticated: boolean }>((context, next) => {
    context.state.set("user", "alice");
    context.state.set("authenticated", true);

    return next();
  })
  .call("sum", ({ a, b }: { a: number; b: number }) => a + b);

type App = InferAppsScript<typeof app>;

const getUserInput: App["getUser"]["input"] = { id: "123" };

const getUserResult: App["getUser"]["result"] = {
  id: "123",
  createdAt: new Date().toISOString(),
};

const sumInput: App["sum"]["input"] = { a: 1, b: 2 };

const sumResult: App["sum"]["result"] = 3;

void getUserInput;
void getUserResult;
void sumInput;
void sumResult;

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
  .use((_context, next) => next())
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
  getUser: ({ id }: { id: string }) => ({
    id,
    createdAt: new Date(),
  }),
  sum: ({ a, b }: { a: number; b: number }) => a + b,
} as const);

type AppWithCalls = InferAppsScript<typeof appWithCalls>;

const callsGetUserArgs: AppWithCalls["getUser"]["input"] = { id: "123" };
const callsGetUserResult: AppWithCalls["getUser"]["result"] = {
  id: "123",
  createdAt: new Date().toISOString(),
};
const callsSumArgs: AppWithCalls["sum"]["input"] = { a: 1, b: 2 };
const callsSumResult: AppWithCalls["sum"]["result"] = 3;

void callsGetUserArgs;
void callsGetUserResult;
void callsSumArgs;
void callsSumResult;

// @ts-expect-error getUserの引数はstring
const invalidCallsGetUserArgs: AppWithCalls["getUser"]["input"] = { id: 123 };

// @ts-expect-error sumの引数はnumber, number
const invalidCallsSumArgs: AppWithCalls["sum"]["input"] = { a: "1", b: "2" };

void invalidCallsGetUserArgs;
void invalidCallsSumArgs;

const handlers = {
  findUser: ({ id }: { id: string }) => ({ id }),
  countUsers: ({}) => 10,
};

const appWithHandlerObject = new AppsScript().calls(handlers);

type AppWithHandlerObject = InferAppsScript<typeof appWithHandlerObject>;

const findUserArgs: AppWithHandlerObject["findUser"]["input"] = { id: "1" };
const countUsersResult: AppWithHandlerObject["countUsers"]["result"] = 10;

void findUserArgs;
void countUsersResult;

const contextMiddleware: AppsScriptMiddleware<{
  user: string;
}> = (context, next) => {
  const middlewareUser: string | undefined = context.state.get("user");

  void middlewareUser;

  switch (context.invocation.type) {
    case "get": {
      const invocation: AppsScriptGetInvocation = context.invocation;
      const token: string | undefined = invocation.request.query("token");

      void token;

      break;
    }

    case "post": {
      const invocation: AppsScriptPostInvocation = context.invocation;
      const token: string | undefined = invocation.request.query("token");
      const body: unknown = invocation.request.json();

      void token;
      void body;

      break;
    }

    case "call": {
      const invocation: AppsScriptCallInvocation = context.invocation;
      const name: string = invocation.name;
      const args: unknown = invocation.input;

      void name;
      void args;

      break;
    }
  }

  return next();
};

void contextMiddleware;

const acceptsInvocation = (_invocation: AppsScriptInvocation): void => {};

const getInvocation = null as unknown as AppsScriptGetInvocation;
const postInvocation = null as unknown as AppsScriptPostInvocation;
const callInvocation = null as unknown as AppsScriptCallInvocation;

acceptsInvocation(getInvocation);
acceptsInvocation(postInvocation);
acceptsInvocation(callInvocation);

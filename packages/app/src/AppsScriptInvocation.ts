import type { AppsScriptHttpRequest } from "./AppsScriptHttpRequest";
import type { AppsScriptPostRequest } from "./AppsScriptPostRequest";

export type AppsScriptGetInvocation = {
  readonly type: "get";
  readonly request: AppsScriptHttpRequest;
};

export type AppsScriptPostInvocation = {
  readonly type: "post";
  readonly request: AppsScriptPostRequest;
};

export type AppsScriptCallInvocation = {
  readonly type: "call";
  readonly name: string;
  readonly args: readonly unknown[];
};

export type AppsScriptInvocation =
  | AppsScriptGetInvocation
  | AppsScriptPostInvocation
  | AppsScriptCallInvocation;

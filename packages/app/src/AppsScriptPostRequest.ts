import { AppsScriptHttpRequest } from "./AppsScriptHttpRequest";

export class AppsScriptPostRequest extends AppsScriptHttpRequest {
  constructor(private postEvent: GoogleAppsScript.Events.DoPost) {
    super(postEvent);
  }

  public text() {
    return this.postEvent.postData.contents;
  }

  public json<T = unknown>(): T {
    return JSON.parse(this.postEvent.postData.contents) as T;
  }
}

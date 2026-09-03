import { AppsScriptHttpRequest } from "./AppsScriptHttpRequest";

export class AppsScriptPostRequest extends AppsScriptHttpRequest {
  constructor(private postEvent: GoogleAppsScript.Events.DoPost) {
    super(postEvent);
  }

  public text() {
    return this.postEvent.postData.contents;
  }

  public json() {
    return JSON.parse(this.postEvent.postData.contents);
  }
}

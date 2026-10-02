import { APPS_SCRIPT_BRIDGE_RUNTIME_BUNDLE } from "../generated/runtime-bundle";

export interface AppsScriptBridgeOptions {
  allowedOrigins: string[];
}

declare const HtmlService: GoogleAppsScript.HTML.HtmlService;

export class AppsScriptBridge {
  public readonly allowedOrigins: string[];

  public constructor(options: AppsScriptBridgeOptions) {
    this.allowedOrigins = [...options.allowedOrigins];
  }

  public html(): GoogleAppsScript.HTML.HtmlOutput {
    const escapedConfig = JSON.stringify({
      allowedOrigins: this.allowedOrigins,
    }).replace(/</g, "\\u003c");

    return HtmlService.createHtmlOutput(
      [
        "<!doctype html>",
        '<html lang="en">',
        "<head>",
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width,initial-scale=1">',
        "<title>Gasboost Bridge</title>",
        "</head>",
        "<body>",
        `<script>window.__GASBOOST_BRIDGE__=${escapedConfig};</script>`,
        `<script>${APPS_SCRIPT_BRIDGE_RUNTIME_BUNDLE}</script>`,
        "</body>",
        "</html>",
      ].join(""),
    ).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
}

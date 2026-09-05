export type GoogleScriptRun = {
  withSuccessHandler<T = unknown>(
    callback: (result: T) => void,
  ): GoogleScriptRun;
  withFailureHandler(callback: (error: Error) => void): GoogleScriptRun;
  // GAS は run.任意のサーバー関数名(...) を呼ぶので index signature を持たせる
  [serverFunctionName: string]: any;
};

export type GoogleScriptHistoryEvent = {
  state: Record<string, unknown>;
  location: {
    hash: string;
    parameter: Record<string, string>;
    parameters: Record<string, string[]>;
  };
};

export type GoogleScriptUrlLocation = {
  hash: string;
  parameter: Record<string, string>;
  parameters: Record<string, string[]>;
};

export type GoogleApi = {
  script: {
    run: GoogleScriptRun;
    history: {
      push: (
        stateObject: Record<string, unknown>,
        params: Record<string, unknown>,
        hash: string,
      ) => void;
      replace: (
        stateObject: Record<string, unknown>,
        params: Record<string, unknown>,
        hash: string,
      ) => void;
      setChangeHandler: (
        callback: (event: GoogleScriptHistoryEvent) => void,
      ) => void;
    };
    url: {
      getLocation: (
        callback: (location: GoogleScriptUrlLocation) => void,
      ) => void;
    };
  };
};

/**
 * google.script.* は Apps Script のランタイムが注入するグローバル。
 * ここでは「型付きで参照」だけ提供する。
 */
export const google = (globalThis as any).google as GoogleApi;

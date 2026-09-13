import { appsScriptClient } from "@gasboost/client";

type App = {
  hello: {
    args: [name: string];
    result: string;
  };
};

export const { client } = appsScriptClient<App>();

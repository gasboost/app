import type { AppType } from "../.build/backend/tests/consumer/backend/main";

type Client<T> = {
  [K in keyof T]: T[K] extends {
    args: infer TArgs extends unknown[];
    result: infer TResult;
  }
    ? (...args: TArgs) => Promise<TResult>
    : never;
};

declare const client: Client<AppType>;

client.getUser("123");
client.digest("hello");

// GAS固有のglobalはfrontendから参照できてはいけない

// @ts-expect-error SpreadsheetApp must not be available in frontend
SpreadsheetApp.getActiveSpreadsheet();

// @ts-expect-error Utilities must not be available in frontend
Utilities.getUuid();

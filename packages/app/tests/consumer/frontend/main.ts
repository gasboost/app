import type { AppType } from "../backend/main";

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

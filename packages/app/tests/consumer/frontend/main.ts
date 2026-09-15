import type { AppType } from "../backend/main";

type Client<T> = {
  [K in keyof T]: T[K] extends {
    input: infer TInput;
    result: infer TResult;
  }
    ? (input: TInput) => Promise<TResult>
    : never;
};

declare const client: Client<AppType>;

client.getUser({
  id: "123",
});

client.digest({
  value: "hello",
});

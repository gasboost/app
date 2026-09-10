import { AppsScript } from "@gasboost/app";

declare const Utilities: {
  getUuid(): string;
};
const value = Utilities.getUuid();

const app = new AppsScript().call("runtimeValue", () => value);

export default app;

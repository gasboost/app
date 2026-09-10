import { AppsScript } from "@gasboost/app";

declare const Utilities: {
  getUuid(): string;
};
const uuid = Utilities.getUuid();

const app = new AppsScript().call("uuid", () => uuid);

export default app;

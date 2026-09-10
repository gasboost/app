import { AppsScript } from "@gasboost/app";

const handlers = {
  first: () => 1,
  second: () => 2,
};

const app = new AppsScript();

for (const [name, handler] of Object.entries(handlers)) {
  app.call(name, handler);
}

export default app;

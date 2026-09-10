import { AppsScript } from "@gasboost/app";
import { handlers } from "./handlers";

const app = new AppsScript().calls(handlers);

export default app;

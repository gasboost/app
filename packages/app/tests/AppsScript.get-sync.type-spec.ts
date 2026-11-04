import { AppsScript } from "../src";

// A native output is valid; a Promise of the same output is not a GAS GET response.
const output = {} as GoogleAppsScript.HTML.HtmlOutput;
new AppsScript().get(() => output);
// @ts-expect-error GAS Web Apps reject a Promise returned from doGet.
new AppsScript().get(async () => output);
// @ts-expect-error Immediately resolved Promises must not bypass the sync GET contract.
new AppsScript().get(() => Promise.resolve(output));

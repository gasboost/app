import type { AppsScriptAnalysis } from "./analyzer";

const reservedNames = new Set(["doGet", "doPost"]);

function ensureValidGlobalFunctionName(name: string): void {
  if (reservedNames.has(name)) {
    throw new Error(`RPC name "${name}" is reserved by Google Apps Script.`);
  }

  if (!/^[$A-Z_a-z][$\w]*$/u.test(name)) {
    throw new Error(`RPC name "${name}" is not a valid JavaScript identifier.`);
  }
}

export function createGlobalCode(analysis: AppsScriptAnalysis): string {
  const declarations: string[] = [];

  if (analysis.hasGet) {
    declarations.push("function doGet() {}");
  }

  if (analysis.hasPost) {
    declarations.push("function doPost() {}");
  }

  for (const name of analysis.calls) {
    ensureValidGlobalFunctionName(name);

    declarations.push(`function ${name}() {}`);
  }

  return declarations.join("\n");
}

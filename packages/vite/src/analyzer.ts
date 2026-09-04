import fs from "node:fs";
import path from "node:path";

import type {
  CallExpression,
  Expression,
  Node,
  SourceFile,
  VariableDeclaration,
} from "typescript/unstable/ast";
import {
  isCallExpression,
  isIdentifier,
  isNewExpression,
  isPropertyAccessExpression,
  isStringLiteral,
  isVariableDeclaration,
} from "typescript/unstable/ast/is";
import { createVirtualFileSystem } from "typescript/unstable/fs";
import { API } from "typescript/unstable/sync";

export interface AppsScriptAnalysis {
  hasGet: boolean;
  hasPost: boolean;
  calls: string[];
}

export function analyzeAppsScript(entry: string): AppsScriptAnalysis {
  const absoluteEntry = path.resolve(entry);

  if (!fs.existsSync(absoluteEntry)) {
    throw new Error(`Entry file not found: ${absoluteEntry}`);
  }

  const sourceText = fs.readFileSync(absoluteEntry, "utf8");

  const sourceFile = createSourceFile(absoluteEntry, sourceText);

  const appVariables = findAppsScriptVariables(sourceFile);

  if (appVariables.length === 0) {
    throw new Error("AppsScript instance not found.");
  }

  if (appVariables.length > 1) {
    throw new Error("Multiple AppsScript instances found in entry.");
  }

  const appVariable = appVariables[0];

  ensureDefaultExport(sourceFile, appVariable);

  const result: AppsScriptAnalysis = {
    hasGet: false,
    hasPost: false,
    calls: [],
  };

  const callNames = new Set<string>();

  function register(expression: CallExpression): void {
    if (!isPropertyAccessExpression(expression.expression)) {
      return;
    }

    const propertyAccess = expression.expression;

    const method = propertyAccess.name.text;

    if (!isAppsScriptTarget(propertyAccess.expression, appVariable)) {
      return;
    }

    if (method === "get") {
      if (result.hasGet) {
        throw new Error("Duplicate GET handler registration.");
      }

      result.hasGet = true;
      return;
    }

    if (method === "post") {
      if (result.hasPost) {
        throw new Error("Duplicate POST handler registration.");
      }

      result.hasPost = true;
      return;
    }

    if (method !== "call") {
      return;
    }

    const name = expression.arguments[0];

    if (!name) {
      throw new Error(".call() requires a function name.");
    }

    if (!isStringLiteral(name)) {
      throw new Error(".call() function name must be a string literal.");
    }

    if (callNames.has(name.text)) {
      throw new Error(`Duplicate RPC registration: "${name.text}".`);
    }

    callNames.add(name.text);
    result.calls.unshift(name.text);
  }

  function visit(node: Node): void {
    if (isCallExpression(node)) {
      register(node);
    }

    node.forEachChild(visit);
  }

  visit(sourceFile);

  return result;
}

function createSourceFile(
  absoluteEntry: string,
  sourceText: string,
): SourceFile {
  const virtualEntry = "/entry.ts";
  const virtualConfig = "/tsconfig.json";

  const virtualFs = createVirtualFileSystem({
    [virtualConfig]: JSON.stringify({
      files: [virtualEntry],
    }),
    [virtualEntry]: sourceText,
  });

  const api = new API({
    cwd: "/",
    fs: virtualFs,
  });

  const snapshot = api.updateSnapshot({
    openProject: virtualConfig,
  });

  const project = snapshot.getProject(virtualConfig);

  if (!project) {
    throw new Error("Failed to create TypeScript project.");
  }

  const sourceFile = project.program.getSourceFile(virtualEntry);

  if (!sourceFile) {
    throw new Error(`Failed to parse entry: ${absoluteEntry}`);
  }

  return sourceFile;
}

function findAppsScriptVariables(sourceFile: SourceFile): string[] {
  const names: string[] = [];

  function visit(node: Node): void {
    if (isVariableDeclaration(node) && isAppsScriptVariableDeclaration(node)) {
      names.push(node.name.text);
    }

    node.forEachChild(visit);
  }

  visit(sourceFile);

  return names;
}

function isAppsScriptVariableDeclaration(
  node: VariableDeclaration,
): node is VariableDeclaration & {
  name: import("typescript/unstable/ast").Identifier;
} {
  if (!isIdentifier(node.name)) {
    return false;
  }

  if (!node.initializer) {
    return false;
  }

  return containsAppsScriptConstructor(node.initializer);
}
function containsAppsScriptConstructor(expression: Expression): boolean {
  if (
    isNewExpression(expression) &&
    isIdentifier(expression.expression) &&
    expression.expression.text === "AppsScript"
  ) {
    return true;
  }

  if (
    isCallExpression(expression) &&
    isPropertyAccessExpression(expression.expression)
  ) {
    return containsAppsScriptConstructor(expression.expression.expression);
  }

  return false;
}

function isAppsScriptTarget(
  expression: Expression,
  appVariable: string,
): boolean {
  if (isIdentifier(expression) && expression.text === appVariable) {
    return true;
  }

  if (
    isNewExpression(expression) &&
    isIdentifier(expression.expression) &&
    expression.expression.text === "AppsScript"
  ) {
    return true;
  }

  if (
    isCallExpression(expression) &&
    isPropertyAccessExpression(expression.expression)
  ) {
    return isAppsScriptTarget(expression.expression.expression, appVariable);
  }

  return false;
}

function ensureDefaultExport(
  sourceFile: SourceFile,
  appVariable: string,
): void {
  let found = false;

  for (const statement of sourceFile.statements) {
    const text = statement.getText();

    if (text === `export default ${appVariable};`) {
      found = true;
      break;
    }
  }

  if (!found) {
    throw new Error("AppsScript instance must be default exported.");
  }
}

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const sourcePath = new URL("../src/semantic/preflight-runtime.ts", import.meta.url);

async function parseRuntime(): Promise<ts.SourceFile> {
  return ts.createSourceFile(
    "preflight-runtime.ts",
    await readFile(sourcePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

function collect<T extends ts.Node>(
  source: ts.SourceFile,
  select: (node: ts.Node) => node is T,
): T[] {
  const selected: T[] = [];
  const visit = (node: ts.Node): void => {
    if (select(node)) selected.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return selected;
}

function registeredHandlers(source: ts.SourceFile): ts.ArrowFunction[] {
  return collect(
    source,
    (node): node is ts.CallExpression =>
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "pi" &&
      node.expression.name.text === "on" &&
      node.arguments.length === 2 &&
      ts.isStringLiteral(node.arguments[0]) &&
      node.arguments[0].text === "before_agent_start" &&
      ts.isArrowFunction(node.arguments[1]),
  ).map((call) => call.arguments[1] as ts.ArrowFunction);
}

test("TypeScript AST proves correlation preparation precedes canonical slot publication and return", async () => {
  const source = await parseRuntime();
  const handlers = registeredHandlers(source);
  assert.equal(handlers.length, 1);
  const callback = handlers[0];
  assert.ok(callback && ts.isBlock(callback.body));
  const statements = callback.body.statements;
  const correlation = statements.at(-3);
  const assignment = statements.at(-2);
  const returned = statements.at(-1);
  assert.ok(correlation && ts.isIfStatement(correlation));
  assert.match(correlation.expression.getText(source), /agentPromptObservation\.prepare/);
  assert.ok(assignment && ts.isExpressionStatement(assignment));
  assert.ok(ts.isBinaryExpression(assignment.expression));
  assert.equal(assignment.expression.operatorToken.kind, ts.SyntaxKind.EqualsToken);
  assert.ok(ts.isIdentifier(assignment.expression.left));
  assert.equal(assignment.expression.left.text, "latestObservationRecord");
  assert.ok(ts.isIdentifier(assignment.expression.right));
  assert.equal(assignment.expression.right.text, "predecessor");
  assert.ok(returned && ts.isReturnStatement(returned));
  assert.ok(returned.expression && ts.isIdentifier(returned.expression));
  assert.equal(returned.expression.text, "preparedReturn");
});

test("TypeScript AST proves one let-declared observation slot", async () => {
  const source = await parseRuntime();
  const slots = collect(
    source,
    (node): node is ts.VariableDeclaration =>
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "latestObservationRecord",
  );
  assert.equal(slots.length, 1);
  const slot = slots[0];
  assert.ok(slot);
  assert.equal(slot.initializer, undefined);
  assert.ok(slot.parent && ts.isVariableDeclarationList(slot.parent));
  assert.equal(slot.parent.flags & ts.NodeFlags.Let, ts.NodeFlags.Let);
  assert.equal(slot.parent.declarations.length, 1);
  assert.ok(slot.type && ts.isUnionTypeNode(slot.type));
  assert.deepEqual(
    slot.type.types.map((type) => type.getText(source)),
    ["handler.HandlerObservationRecord", "undefined"],
  );
});

test("source order retains post-builder and post-correlation stale-state rejection", async () => {
  const source = await parseRuntime();
  const handler = registeredHandlers(source)[0];
  assert.ok(handler);
  const text = handler.getText(source);
  const builder = text.indexOf("handler.tryBuildRecord");
  const postBuilderCurrentCheck = text.indexOf("if (!attemptIsCurrent())", builder);
  const preparation = text.indexOf("agentPromptObservation.prepare", builder);
  assert.ok(builder >= 0);
  assert.ok(postBuilderCurrentCheck > builder);
  assert.ok(preparation > postBuilderCurrentCheck);

  const state = ts.createSourceFile(
    "agent-prompt-observation-state.ts",
    await readFile(
      new URL("../src/semantic/agent-prompt-observation-state.ts", import.meta.url),
      "utf8",
    ),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const coordinator = state.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === "createAgentPromptObservationRuntime",
  );
  assert.ok(coordinator);
  const coordinatorText = coordinator.getText(state);
  const supportCheck = coordinatorText.indexOf("supportsAgentPromptObservation(host)");
  const tokenRead = coordinatorText.indexOf("correlatedPromptRunToken(event)", supportCheck);
  const finalCurrentCheck = coordinatorText.indexOf("if (!isCurrent())", tokenRead);
  const statePreparation = coordinatorText.indexOf("state.prepare(token, predecessor)", tokenRead);
  assert.ok(supportCheck >= 0);
  assert.ok(tokenRead > supportCheck);
  assert.ok(finalCurrentCheck > tokenRead);
  assert.ok(statePreparation > finalCurrentCheck);
});

import ts from 'typescript';

export interface Metrics {
  complexity: number;
  lines: number;
  maxDepth: number;
}

export function measureComplexity(sourceCode: string): Metrics {
  const sourceFile = ts.createSourceFile('temp.ts', sourceCode, ts.ScriptTarget.Latest, true);

  let complexity = 1;
  let maxDepth = 0;
  let currentDepth = 0;

  const BRANCHING_NODES = new Set([
    ts.SyntaxKind.IfStatement,
    ts.SyntaxKind.ConditionalExpression,
    ts.SyntaxKind.CaseClause,
    ts.SyntaxKind.ForStatement,
    ts.SyntaxKind.ForInStatement,
    ts.SyntaxKind.ForOfStatement,
    ts.SyntaxKind.WhileStatement,
    ts.SyntaxKind.DoStatement,
    ts.SyntaxKind.CatchClause,
    ts.SyntaxKind.AmpersandAmpersandToken,
    ts.SyntaxKind.BarBarToken,
    ts.SyntaxKind.QuestionQuestionToken,
  ]);

  const DEPTH_NODES = new Set([
    ts.SyntaxKind.IfStatement,
    ts.SyntaxKind.ForStatement,
    ts.SyntaxKind.ForInStatement,
    ts.SyntaxKind.ForOfStatement,
    ts.SyntaxKind.WhileStatement,
    ts.SyntaxKind.DoStatement,
    ts.SyntaxKind.SwitchStatement,
    ts.SyntaxKind.TryStatement,
  ]);

  function visit(node: ts.Node) {
    if (BRANCHING_NODES.has(node.kind)) complexity++;

    const isDepthNode = DEPTH_NODES.has(node.kind);
    if (isDepthNode) currentDepth++;
    if (currentDepth > maxDepth) maxDepth = currentDepth;

    ts.forEachChild(node, visit);

    if (isDepthNode) currentDepth--;
  }

  visit(sourceFile);

  const lines = sourceCode.split('\n').filter((l) => l.trim().length > 0).length;

  return { complexity, lines, maxDepth };
}

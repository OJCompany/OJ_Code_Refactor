import ts from 'typescript';
import fs from 'fs';
import path from 'path';

export interface NestingOccurrence {
  line: number;
  column: number;
  depth: number;
  snippet: string;
}

export interface NestingDetectResult {
  filePath: string;
  occurrences: NestingOccurrence[];
  sourceCode: string;
}

const NESTING_THRESHOLD = 3;

export function detectNesting(filePath: string): NestingDetectResult {
  const absolutePath = path.resolve(filePath);
  const sourceCode = fs.readFileSync(absolutePath, 'utf-8');

  const sourceFile = ts.createSourceFile(
    absolutePath,
    sourceCode,
    ts.ScriptTarget.Latest,
    true
  );

  const lines = sourceCode.split('\n');
  const occurrences: NestingOccurrence[] = [];

  function getLineCol(pos: number): { line: number; column: number } {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(pos);
    return { line: line + 1, column: character + 1 };
  }

  function getNestingDepth(node: ts.Node): number {
    const NESTING_NODES = new Set([
      ts.SyntaxKind.IfStatement,
      ts.SyntaxKind.ForStatement,
      ts.SyntaxKind.ForInStatement,
      ts.SyntaxKind.ForOfStatement,
      ts.SyntaxKind.WhileStatement,
      ts.SyntaxKind.SwitchStatement,
      ts.SyntaxKind.TryStatement,
    ]);

    let depth = 0;
    let current: ts.Node = node;
    while (current.parent) {
      if (NESTING_NODES.has(current.parent.kind)) depth++;
      current = current.parent;
    }
    return depth;
  }

  function visit(node: ts.Node) {
    if (node.kind === ts.SyntaxKind.IfStatement) {
      const depth = getNestingDepth(node);
      if (depth >= NESTING_THRESHOLD) {
        const { line, column } = getLineCol(node.getStart(sourceFile));
        occurrences.push({
          line,
          column,
          depth,
          snippet: lines[line - 1].trim(),
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return { filePath: absolutePath, occurrences, sourceCode };
}

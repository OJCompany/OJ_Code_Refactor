import ts from 'typescript';
import fs from 'fs';
import path from 'path';
import type { AnyOccurrence, DetectResult } from './types.js';

export function detect(filePath: string): DetectResult {
  const absolutePath = path.resolve(filePath);
  const sourceCode = fs.readFileSync(absolutePath, 'utf-8');

  const sourceFile = ts.createSourceFile(
    absolutePath,
    sourceCode,
    ts.ScriptTarget.Latest,
    true
  );

  const lines = sourceCode.split('\n');
  const occurrences: AnyOccurrence[] = [];

  function getLineCol(pos: number): { line: number; column: number } {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(pos);
    return { line: line + 1, column: character + 1 };
  }

  function isAnyKeyword(node: ts.Node): boolean {
    return node.kind === ts.SyntaxKind.AnyKeyword;
  }

  function visit(node: ts.Node) {
    // 함수/메서드 파라미터의 any
    if (ts.isParameter(node) && node.type && isAnyKeyword(node.type)) {
      const { line, column } = getLineCol(node.type.getStart(sourceFile));
      occurrences.push({
        line,
        column,
        snippet: lines[line - 1].trim(),
        context: 'parameter',
      });
    }

    // 함수 반환 타입의 any
    else if (
      (ts.isFunctionDeclaration(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isFunctionExpression(node)) &&
      node.type &&
      isAnyKeyword(node.type)
    ) {
      const { line, column } = getLineCol(node.type.getStart(sourceFile));
      occurrences.push({
        line,
        column,
        snippet: lines[line - 1].trim(),
        context: 'return',
      });
    }

    // 변수 선언의 any (const x: any = ...) — catch (err: any) 제외
    else if (
      ts.isVariableDeclaration(node) &&
      node.type &&
      isAnyKeyword(node.type) &&
      !ts.isCatchClause(node.parent)
    ) {
      const { line, column } = getLineCol(node.type.getStart(sourceFile));
      occurrences.push({
        line,
        column,
        snippet: lines[line - 1].trim(),
        context: 'variable',
      });
    }

    // 제네릭 타입 인자의 any (Array<any>, Promise<any> 등)
    else if (ts.isTypeReferenceNode(node)) {
      node.typeArguments?.forEach((arg) => {
        if (isAnyKeyword(arg)) {
          const { line, column } = getLineCol(arg.getStart(sourceFile));
          occurrences.push({
            line,
            column,
            snippet: lines[line - 1].trim(),
            context: 'generic',
          });
        }
      });
    }

    // 타입 단언의 any (x as any, <any>x)
    else if (
      (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) &&
      isAnyKeyword(node.type)
    ) {
      const { line, column } = getLineCol(node.type.getStart(sourceFile));
      occurrences.push({
        line,
        column,
        snippet: lines[line - 1].trim(),
        context: 'assertion',
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return {
    filePath: absolutePath,
    occurrences,
    sourceCode,
  };
}

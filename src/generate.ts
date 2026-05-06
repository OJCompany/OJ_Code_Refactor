import Anthropic from '@anthropic-ai/sdk';
import ts from 'typescript';
import type { DetectResult, RefactoringOption } from './types.js';
import type { NestingDetectResult } from './detectNesting.js';
import { measureComplexity } from './metrics.js';

const client = new Anthropic();

type CatalogType = 'replace-any' | 'guard-clauses';

interface Strategy {
  id: 1;
  name: string;
  tradeoff: string;
  instruction: string;
}

const REPLACE_ANY_STRATEGY: Strategy = {
  id: 1,
  name: 'unknown으로 교체',
  tradeoff: '타입 안전성 즉시 확보. 사용 전 타입 가드 필요.',
  instruction: `Replace every 'any' type with 'unknown'.
Use type guards (typeof, instanceof, or custom guards) where the value is actually used.
Do NOT change runtime logic — only fix the types.`,
};

const GUARD_CLAUSES_STRATEGY: Strategy = {
  id: 1,
  name: 'Guard Clauses (조기 반환)',
  tradeoff: '중첩 제거로 가독성 대폭 향상. 반환 포인트가 늘어남.',
  instruction: `Refactor deeply nested if statements using guard clauses (early return pattern).
Move all precondition checks to the top of the function as early returns.
The happy path should be at the lowest indentation level.
Do NOT change runtime logic — only restructure the control flow.`,
};

function validateLLMOutput(fullCode: string, originalSource: string): void {
  try {
    ts.createSourceFile('validate.ts', fullCode, ts.ScriptTarget.Latest, true);
  } catch {
    throw new Error('LLM 출력이 유효한 TypeScript가 아닙니다.');
  }

  const ratio = fullCode.length / originalSource.length;
  if (ratio < 0.5) {
    throw new Error(`LLM 출력이 원본 대비 너무 짧습니다 (${Math.round(ratio * 100)}%).`);
  }
}

function stripMarkdownFences(text: string): string {
  return text.replace(/^```(?:typescript|ts)?\n?/m, '').replace(/\n?```$/m, '').trim();
}

function buildPrompt(
  strategy: Strategy,
  sourceCode: string,
  locations: string,
  catalog: CatalogType
): string {
  const task =
    catalog === 'replace-any'
      ? "eliminate 'any' types"
      : 'remove deeply nested conditionals';

  return `You are a TypeScript expert. Refactor the following file to ${task}.

Strategy: ${strategy.name}
${strategy.instruction}

Detected locations:
${locations}

Return ONLY the complete refactored TypeScript file with no explanation, no markdown fences.

--- FILE START ---
${sourceCode}
--- FILE END ---`;
}

async function callLLM(
  strategy: Strategy,
  sourceCode: string,
  locations: string,
  summary: string,
  beforeSnippet: string,
  catalog: CatalogType
): Promise<RefactoringOption> {
  const prompt = buildPrompt(strategy, sourceCode, locations, catalog);

  const message = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = message.content.find((b): b is { type: 'text'; text: string } => b.type === 'text');
  if (!textBlock) throw new Error('LLM 응답에 텍스트 블록이 없습니다.');

  const fullCode = stripMarkdownFences(textBlock.text.trim());
  validateLLMOutput(fullCode, sourceCode);
  const afterSnippet = fullCode.split('\n').slice(0, 5).join('\n');

  const before = measureComplexity(sourceCode);
  const after = measureComplexity(fullCode);

  return {
    id: strategy.id,
    name: strategy.name,
    summary,
    tradeoff: strategy.tradeoff,
    before: beforeSnippet,
    after: afterSnippet,
    fullCode,
    metricsBeforeComplexity: before.complexity,
    metricsAfterComplexity: after.complexity,
    metricsBeforeLines: before.lines,
    metricsAfterLines: after.lines,
    metricsBeforeDepth: before.maxDepth,
    metricsAfterDepth: after.maxDepth,
  };
}

export async function generate(result: DetectResult): Promise<RefactoringOption> {
  const locations = result.occurrences
    .map((o) => `  - line ${o.line} [${o.context}]: ${o.snippet}`)
    .join('\n');

  const beforeSnippet = result.occurrences.slice(0, 2).map((o) => o.snippet).join('\n');
  const summary = `'any' ${result.occurrences.length}개를 ${REPLACE_ANY_STRATEGY.name} 방식으로 교체`;

  return callLLM(REPLACE_ANY_STRATEGY, result.sourceCode, locations, summary, beforeSnippet, 'replace-any');
}

export async function generateGuardClauses(result: NestingDetectResult): Promise<RefactoringOption> {
  const locations = result.occurrences
    .map((o) => `  - line ${o.line} [depth ${o.depth}]: ${o.snippet}`)
    .join('\n');

  const beforeSnippet = result.occurrences.slice(0, 2).map((o) => o.snippet).join('\n');
  const summary = `중첩 깊이 ${result.occurrences[0]?.depth ?? 3}짜리 조건문을 ${GUARD_CLAUSES_STRATEGY.name} 방식으로 리팩토링`;

  return callLLM(GUARD_CLAUSES_STRATEGY, result.sourceCode, locations, summary, beforeSnippet, 'guard-clauses');
}

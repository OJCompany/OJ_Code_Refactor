import Anthropic from '@anthropic-ai/sdk';
import type { DetectResult, RefactoringOption } from './types.js';
import type { NestingDetectResult } from './detectNesting.js';
import { measureComplexity } from './metrics.js';

const client = new Anthropic();

type CatalogType = 'replace-any' | 'guard-clauses';

interface Strategy {
  id: 1 | 2 | 3;
  name: string;
  tradeoff: string;
  instruction: string;
}

const REPLACE_ANY_STRATEGIES: Strategy[] = [
  {
    id: 1,
    name: 'unknown으로 교체',
    tradeoff: '타입 안전성 즉시 확보. 단, 사용 전 타입 가드 필요.',
    instruction: `Replace every 'any' type with 'unknown'.
Use type guards (typeof, instanceof, or custom guards) where the value is actually used.
Do NOT change runtime logic — only fix the types.`,
  },
  {
    id: 2,
    name: '인터페이스 정의',
    tradeoff: '코드 의도가 명확해짐. 단, 인터페이스 유지 비용 발생.',
    instruction: `Replace every 'any' type by defining proper interfaces or type aliases.
Infer the shape from how the variable is used in the code.
Name interfaces clearly (e.g. User, ApiResponse).
Do NOT change runtime logic — only fix the types.`,
  },
  {
    id: 3,
    name: 'Discriminated Union',
    tradeoff: '분기 처리가 exhaustive해짐. 단, 케이스가 많으면 복잡해질 수 있음.',
    instruction: `Replace every 'any' type with a discriminated union type.
Use a 'kind' or 'type' discriminant field to distinguish variants.
Model all observed shapes as union members.
Do NOT change runtime logic — only fix the types.`,
  },
];

const GUARD_CLAUSES_STRATEGIES: Strategy[] = [
  {
    id: 1,
    name: 'Guard Clauses (조기 반환)',
    tradeoff: '중첩 제거로 가독성 대폭 향상. 단, 반환 포인트가 늘어남.',
    instruction: `Refactor deeply nested if statements using guard clauses (early return pattern).
Move all precondition checks to the top of the function as early returns.
The happy path should be at the lowest indentation level.
Do NOT change runtime logic — only restructure the control flow.`,
  },
  {
    id: 2,
    name: 'Extract + Guard (함수 분리)',
    tradeoff: '각 함수가 단일 책임. 단, 함수 호출 스택이 깊어질 수 있음.',
    instruction: `Refactor deeply nested conditionals by extracting inner blocks into separate functions.
Each extracted function should use guard clauses internally.
Name functions by their intent (e.g. validateUser, processOrder).
Do NOT change runtime logic — only restructure.`,
  },
  {
    id: 3,
    name: 'Polymorphism / Strategy Pattern',
    tradeoff: '확장에 유리한 구조. 단, 단순 분기라면 오버엔지니어링일 수 있음.',
    instruction: `Refactor deeply nested conditionals using a strategy pattern or polymorphism.
Replace if/else chains with a lookup map or class hierarchy where appropriate.
Do NOT change runtime logic — only restructure.`,
  },
];

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

  const raw = (message.content[0] as { type: string; text: string }).text.trim();
  const fullCode = stripMarkdownFences(raw);
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

export async function generate(result: DetectResult): Promise<RefactoringOption[]> {
  const locations = result.occurrences
    .map((o) => `  - line ${o.line} [${o.context}]: ${o.snippet}`)
    .join('\n');

  const beforeSnippet = result.occurrences.slice(0, 2).map((o) => o.snippet).join('\n');
  const summary = `'any' ${result.occurrences.length}개를`;

  return Promise.all(
    REPLACE_ANY_STRATEGIES.map((s) =>
      callLLM(s, result.sourceCode, locations, `${summary} ${s.name} 방식으로 교체`, beforeSnippet, 'replace-any')
    )
  );
}

export async function generateGuardClauses(result: NestingDetectResult): Promise<RefactoringOption[]> {
  const locations = result.occurrences
    .map((o) => `  - line ${o.line} [depth ${o.depth}]: ${o.snippet}`)
    .join('\n');

  const beforeSnippet = result.occurrences.slice(0, 2).map((o) => o.snippet).join('\n');
  const summary = `중첩 깊이 ${result.occurrences[0]?.depth ?? 3}짜리 조건문을`;

  return Promise.all(
    GUARD_CLAUSES_STRATEGIES.map((s) =>
      callLLM(s, result.sourceCode, locations, `${summary} ${s.name} 방식으로 리팩토링`, beforeSnippet, 'guard-clauses')
    )
  );
}

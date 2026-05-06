import { spawn } from 'child_process';
import type { DetectResult, RefactoringOption } from './types.js';
import type { NestingDetectResult } from './detectNesting.js';
import { measureComplexity } from './metrics.js';

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

const TIDY_ANY_STRATEGY: Strategy = {
  id: 1,
  name: 'Tidy 리팩토링',
  tradeoff: '기존 로직 유지. 최소 변경으로 any를 가장 구체적인 타입으로 교체.',
  instruction: `You are a TypeScript expert performing a minimal "tidy refactoring".
Goal: eliminate every 'any' with the most specific type that fits actual usage.

Rules (follow strictly):
1. Infer types from how each variable is actually used — do not guess.
2. For structured objects, define a named interface or type alias (e.g. User, ApiResponse).
3. For truly dynamic values use 'unknown' with a type guard at the use site.
4. Do NOT rename variables, restructure logic, add comments, or change runtime behavior.
5. Keep the diff as small as possible — change ONLY type annotations.`,
};

function extractTypeScript(text: string): string {
  // 마크다운 코드 펜스가 있으면 그 안만 추출
  const fenced = text.match(/```(?:typescript|ts)?\n([\s\S]*?)\n?```/);
  if (fenced) return fenced[1].trim();

  // 펜스 없으면 TypeScript 코드가 시작되는 줄부터 추출
  const lines = text.split('\n');
  const tsStart = /^(import |export |interface |type |function |class |const |let |var |async |\/\/|\/\*)/;
  // 설명 텍스트로 보이는 줄 패턴 (마크다운 표, 볼드, 헤딩, 일반 문장)
  const nonTs = /^(\*\*|#{1,6} |\||-{3,})/;

  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    if (tsStart.test(lines[i])) { start = i; break; }
  }

  let end = lines.length;
  for (let i = lines.length - 1; i >= start; i--) {
    const t = lines[i].trim();
    if (t && !nonTs.test(t)) { end = i + 1; break; }
  }

  return lines.slice(start, end).join('\n').trim();
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

function callClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['-p', '--output-format', 'text'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(stderr.trim() || `claude 종료 코드: ${code}`));
      else resolve(stdout.trim());
    });
    proc.on('error', reject);

    proc.stdin.write(prompt);
    proc.stdin.end();
  });
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
  const raw = await callClaude(prompt);
  const fullCode = extractTypeScript(raw);
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

export async function generateTidy(result: DetectResult): Promise<RefactoringOption> {
  const locations = result.occurrences
    .map((o) => `  - line ${o.line} [${o.context}]: ${o.snippet}`)
    .join('\n');
  const beforeSnippet = result.occurrences.slice(0, 3).map((o) => o.snippet).join('\n');

  return callLLM(
    TIDY_ANY_STRATEGY,
    result.sourceCode,
    locations,
    `any ${result.occurrences.length}개를 최소 변경으로 타입 교체`,
    beforeSnippet,
    'replace-any'
  );
}

export async function generateTidyNesting(result: NestingDetectResult): Promise<RefactoringOption> {
  const locations = result.occurrences
    .map((o) => `  - line ${o.line} [depth ${o.depth}]: ${o.snippet}`)
    .join('\n');
  const beforeSnippet = result.occurrences.slice(0, 3).map((o) => o.snippet).join('\n');

  return callLLM(
    GUARD_CLAUSES_STRATEGIES[0],
    result.sourceCode,
    locations,
    `중첩 깊이 ${result.occurrences[0]?.depth ?? 3}짜리 조건문을 guard clauses로 최소 변경 리팩토링`,
    beforeSnippet,
    'guard-clauses'
  );
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

import ts from 'typescript';
import { spawn } from 'child_process';
import type { DetectResult, RefactoringOption } from './types.js';
import type { NestingDetectResult } from './detectNesting.js';
import { measureComplexity } from './metrics.js';

type CatalogType = 'replace-any' | 'guard-clauses';

interface Strategy {
  id: 1;
  name: string;
  tradeoff: string;
  instruction: string;
}

const REPLACE_ANY_STRATEGY: Strategy = {
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
5. Keep the diff as small as possible — change ONLY type annotations.
6. NEVER add or remove runtime expressions: no ??, ?., ||, &&, ternaries, or any other logic that wasn't in the original.
7. If a type mismatch requires a workaround, use a type assertion (e.g. value as string) — never add null-handling logic.`,
};

const GUARD_CLAUSES_STRATEGY: Strategy = {
  id: 1,
  name: 'Guard Clauses (조기 반환)',
  tradeoff: '중첩 제거로 가독성 대폭 향상. 단, 반환 포인트가 늘어남.',
  instruction: `Refactor deeply nested if statements using guard clauses (early return pattern).
Move all precondition checks to the top of the function as early returns.
The happy path should be at the lowest indentation level.
Do NOT change runtime logic — only restructure the control flow.`,
};

function validateLLMOutput(fullCode: string, originalSource: string): void {
  if (/^\s*\|[-|]+\|/m.test(fullCode) || /\*\*[^*]+\*\*/.test(fullCode.slice(0, 200))) {
    throw new Error('LLM이 코드 대신 마크다운 설명을 반환했습니다. 다시 시도해주세요.');
  }
  try {
    ts.createSourceFile('validate.ts', fullCode, ts.ScriptTarget.Latest, true);
  } catch {
    throw new Error('LLM 출력이 유효한 TypeScript가 아닙니다.');
  }
  const ratio = fullCode.length / originalSource.length;
  if (ratio < 0.3) {
    throw new Error(`LLM 출력이 원본 대비 너무 짧습니다 (${Math.round(ratio * 100)}%).`);
  }
}

function extractTypeScript(text: string): string {
  const fenced = text.match(/```(?:typescript|ts)?\n([\s\S]*?)\n?```/);
  if (fenced) return fenced[1].trim();

  // --- 구분선이 텍스트 후반부에 있을 때만 trailing 설명으로 간주하고 잘라냄
  const separatorMatch = text.search(/\n---+\n/);
  if (separatorMatch !== -1 && separatorMatch > text.length / 2) {
    text = text.substring(0, separatorMatch);
  }

  const lines = text.split('\n');
  const tsStart = /^(import |export |interface |type |function |class |const |let |var |async |\/\/|\/\*)/;
  // 마크다운 확정 패턴: 헤더, 볼드, 테이블, 수평선, 불릿 리스트 (- 또는 *)
  const nonTs = /^(\*\*|#{1,6} |\||-{3,}|[-*] )/;

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
  catalog: CatalogType,
  conventionRules?: string,
  feedbackReason?: string
): string {
  const task =
    catalog === 'replace-any'
      ? "eliminate 'any' types"
      : 'remove deeply nested conditionals';

  const conventionSection = conventionRules
    ? `\nCode conventions to follow:\n${conventionRules}\n`
    : '';

  const feedbackSection = feedbackReason
    ? `\nPREVIOUS ATTEMPT REJECTED — fix this issue before returning:\n${feedbackReason}\n`
    : '';

  return `You are a TypeScript expert. Refactor the following file to ${task}.

Strategy: ${strategy.name}
${strategy.instruction}
${conventionSection}${feedbackSection}
Detected locations:
${locations}

OUTPUT RULES (strictly enforced):
- Return ONLY raw TypeScript code. Nothing else.
- Do NOT write any explanation, summary, table, bullet list, or markdown.
- Do NOT use code fences (no \`\`\`typescript or \`\`\`).
- The very first character of your response must be the first character of the TypeScript file.
- The very last character must be the closing brace or semicolon of the last statement.

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
  catalog: CatalogType,
  conventionRules?: string,
  feedbackReason?: string
): Promise<RefactoringOption> {
  let fullCode = '';
  let lastError = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const prompt = buildPrompt(strategy, sourceCode, locations, catalog, conventionRules, attempt > 1 ? feedbackReason : undefined);
    const rawText = await callClaude(prompt);
    fullCode = extractTypeScript(rawText);
    try {
      validateLLMOutput(fullCode, sourceCode);
      break;
    } catch (err) {
      lastError = (err as Error).message;
      if (attempt === 3) throw new Error(lastError);
    }
  }
  const afterSnippet = fullCode.split('\n').slice(0, 5).join('\n');

  const before = measureComplexity(sourceCode);
  const after = measureComplexity(fullCode);

  return {
    id: 1,
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

export async function validateConvention(
  refactoredCode: string,
  conventionRules: string
): Promise<{ pass: boolean; reason: string }> {
  const prompt = `You are a TypeScript code reviewer. Check if the following refactored code strictly follows the given project conventions.

Conventions:
${conventionRules.slice(0, 8000)}

Refactored code:
${refactoredCode}

Reply with ONLY one of these two formats (no other text):
PASS
FAIL: [reason in Korean, one sentence]`;

  try {
    const raw = await callClaude(prompt);
    const text = raw.trim();
    if (text.startsWith('FAIL')) {
      return { pass: false, reason: text.replace(/^FAIL:\s*/, '') };
    }
    return { pass: true, reason: '' };
  } catch {
    return { pass: true, reason: '' };
  }
}

export async function generate(result: DetectResult, conventionRules?: string, feedbackReason?: string): Promise<RefactoringOption> {
  const locations = result.occurrences
    .map((o) => `  - line ${o.line} [${o.context}]: ${o.snippet}`)
    .join('\n');

  const beforeSnippet = result.occurrences.slice(0, 2).map((o) => o.snippet).join('\n');
  const summary = `'any' ${result.occurrences.length}개를 ${REPLACE_ANY_STRATEGY.name} 방식으로 교체`;

  return callLLM(REPLACE_ANY_STRATEGY, result.sourceCode, locations, summary, beforeSnippet, 'replace-any', conventionRules, feedbackReason);
}

export async function generateGuardClauses(result: NestingDetectResult, conventionRules?: string, feedbackReason?: string): Promise<RefactoringOption> {
  const locations = result.occurrences
    .map((o) => `  - line ${o.line} [depth ${o.depth}]: ${o.snippet}`)
    .join('\n');

  const beforeSnippet = result.occurrences.slice(0, 2).map((o) => o.snippet).join('\n');
  const summary = `중첩 깊이 ${result.occurrences[0]?.depth ?? 3}짜리 조건문을 ${GUARD_CLAUSES_STRATEGY.name} 방식으로 리팩토링`;

  return callLLM(GUARD_CLAUSES_STRATEGY, result.sourceCode, locations, summary, beforeSnippet, 'guard-clauses', conventionRules, feedbackReason);
}

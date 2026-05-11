import ts from 'typescript';
import { spawn } from 'child_process';
import type { DetectResult, RefactoringOption } from './types.js';
import type { NestingDetectResult } from './detectNesting.js';
import { measureComplexity } from './metrics.js';
import type { Lang } from './i18n.js';
import { t } from './i18n.js';

type CatalogType = 'replace-any' | 'guard-clauses';

interface Strategy {
  id: 1;
  name: string;
  tradeoff: string;
  instruction: string;
}

function makeStrategies(lang: Lang) {
  const msg = t(lang);
  const REPLACE_ANY: Strategy = {
    id: 1,
    name: msg.tidyName,
    tradeoff: msg.tidyTradeoff,
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

  const GUARD_CLAUSES: Strategy = {
    id: 1,
    name: msg.guardName,
    tradeoff: msg.guardTradeoff,
    instruction: `Refactor deeply nested if statements using guard clauses (early return pattern).
Move all precondition checks to the top of the function as early returns.
The happy path should be at the lowest indentation level.
Do NOT change runtime logic — only restructure the control flow.`,
  };

  return { REPLACE_ANY, GUARD_CLAUSES };
}

function validateLLMOutput(fullCode: string, originalSource: string): void {
  if (/^\s*\|[-|]+\|/m.test(fullCode) || /\*\*[^*]+\*\*/.test(fullCode.slice(0, 200))) {
    throw new Error('LLM returned markdown instead of code. Please retry.');
  }
  try {
    ts.createSourceFile('validate.ts', fullCode, ts.ScriptTarget.Latest, true);
  } catch {
    throw new Error('LLM output is not valid TypeScript.');
  }
  const ratio = fullCode.length / originalSource.length;
  if (ratio < 0.3) {
    throw new Error(`LLM output is too short relative to the original (${Math.round(ratio * 100)}%).`);
  }
}

function extractTypeScript(text: string): string {
  const fenced = text.match(/```(?:typescript|ts)?\n([\s\S]*?)\n?```/);
  if (fenced) return fenced[1].trim();

  const separatorMatch = text.search(/\n---+\n/);
  if (separatorMatch !== -1 && separatorMatch > text.length / 2) {
    text = text.substring(0, separatorMatch);
  }

  const lines = text.split('\n');
  const tsStart = /^(import |export |interface |type |function |class |const |let |var |async |\/\/|\/\*)/;
  const nonTs = /^(\*\*|#{1,6} |\||-{3,}|[-*] )/;

  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    if (tsStart.test(lines[i])) { start = i; break; }
  }

  let end = lines.length;
  for (let i = lines.length - 1; i >= start; i--) {
    const tr = lines[i].trim();
    if (tr && !nonTs.test(tr)) { end = i + 1; break; }
  }

  return lines.slice(start, end).join('\n').trim();
}

function buildPrompt(
  strategy: Strategy,
  sourceCode: string,
  locations: string,
  catalog: CatalogType,
  addComments: boolean,
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

  const commentSection = addComments
    ? '\nFor each line you change, add a concise inline comment (// ...) explaining WHY the change was made.\n'
    : '';

  return `You are a TypeScript expert. Refactor the following file to ${task}.

Strategy: ${strategy.name}
${strategy.instruction}
${conventionSection}${feedbackSection}${commentSection}
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
      if (code !== 0) reject(new Error(stderr.trim() || `claude exit code: ${code}`));
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
  addComments: boolean,
  conventionRules?: string,
  feedbackReason?: string
): Promise<RefactoringOption> {
  let fullCode = '';
  let lastError = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const prompt = buildPrompt(
      strategy, sourceCode, locations, catalog, addComments,
      conventionRules, attempt > 1 ? feedbackReason : undefined
    );
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
  conventionRules: string,
  lang: Lang = 'en'
): Promise<{ pass: boolean; reason: string }> {
  const msg = t(lang);
  const prompt = `You are a TypeScript code reviewer. Check if the following refactored code strictly follows the given project conventions.

Conventions:
${conventionRules.slice(0, 8000)}

Refactored code:
${refactoredCode}

${msg.validationReplyFormat}`;

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

export async function generate(
  result: DetectResult,
  lang: Lang = 'en',
  addComments = false,
  conventionRules?: string,
  feedbackReason?: string
): Promise<RefactoringOption> {
  const { REPLACE_ANY } = makeStrategies(lang);
  const msg = t(lang);

  const locations = result.occurrences
    .map((o) => `  - line ${o.line} [${o.context}]: ${o.snippet}`)
    .join('\n');
  const beforeSnippet = result.occurrences.slice(0, 2).map((o) => o.snippet).join('\n');
  const summary = msg.anySummary(result.occurrences.length, REPLACE_ANY.name);

  return callLLM(REPLACE_ANY, result.sourceCode, locations, summary, beforeSnippet, 'replace-any', addComments, conventionRules, feedbackReason);
}

export async function generateGuardClauses(
  result: NestingDetectResult,
  lang: Lang = 'en',
  addComments = false,
  conventionRules?: string,
  feedbackReason?: string
): Promise<RefactoringOption> {
  const { GUARD_CLAUSES } = makeStrategies(lang);
  const msg = t(lang);

  const locations = result.occurrences
    .map((o) => `  - line ${o.line} [depth ${o.depth}]: ${o.snippet}`)
    .join('\n');
  const beforeSnippet = result.occurrences.slice(0, 2).map((o) => o.snippet).join('\n');
  const depth = result.occurrences[0]?.depth ?? 3;
  const summary = msg.nestingSummary(depth, GUARD_CLAUSES.name);

  return callLLM(GUARD_CLAUSES, result.sourceCode, locations, summary, beforeSnippet, 'guard-clauses', addComments, conventionRules, feedbackReason);
}

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import prompts from 'prompts';

export interface ConventionContext {
  source: 'auto' | 'enterprise';
  label: string;
  rules: string;
  parallel?: boolean;
}

const ENTERPRISE: Record<string, { label: string; rules: string }[]> = {
  js: [
    {
      label: 'Airbnb JavaScript Style Guide',
      rules: `Airbnb JavaScript Style Guide — apply these rules strictly:
- Use const for all references; let if rebinding needed; never var
- Arrow functions for callbacks and anonymous functions
- Template literals instead of string concatenation
- Destructuring for objects and arrays
- Always === and !==; no == or !=
- No unused variables
- camelCase for variables/functions, PascalCase for classes, UPPER_CASE for module-level constants
- Max line length: 100 characters
- Always use semicolons
- Single quotes for strings (except to avoid escaping)
- Spaces after keywords (if, for, while), before opening braces
- Spread operator instead of .apply()`,
    },
    {
      label: 'Google JavaScript Style Guide',
      rules: `Google JavaScript Style Guide — apply these rules strictly:
- const and let only; never var
- Arrow functions preferred for callbacks
- Template literals for string interpolation
- Max line length: 80 characters
- Always use semicolons
- camelCase for identifiers, PascalCase for classes, UPPER_CASE for constants
- Single quotes for strings
- 2-space indentation
- No trailing whitespace
- Prefer for...of over forEach for simple iterations
- Named constants instead of magic numbers`,
    },
    {
      label: 'Standard JS',
      rules: `Standard JS — apply these rules strictly:
- No semicolons
- 2-space indentation
- Single quotes for strings
- Always === and !==
- No unused variables
- Space after keywords, before function declaration parentheses
- Always handle errors in callbacks
- Prefer const over let; never var
- camelCase for variables and functions
- Opening braces on same line`,
    },
  ],
  ts: [
    {
      label: 'Airbnb TypeScript Style Guide',
      rules: `Airbnb TypeScript Style Guide — apply these rules strictly:
- All Airbnb JavaScript rules apply
- No any type; use unknown for truly dynamic values with type guards at use sites
- Prefer interfaces over type aliases for object shapes
- Explicit return types on all exported/public functions
- Use type assertions sparingly; prefer type guards
- strict mode assumed in tsconfig
- readonly for immutable properties
- Avoid non-null assertions (!); use optional chaining (?.) and nullish coalescing (??) instead
- Descriptive generic names (T → TItem, TKey)
- No namespace; use ES modules`,
    },
    {
      label: 'Google TypeScript Style Guide',
      rules: `Google TypeScript Style Guide — apply these rules strictly:
- All Google JavaScript rules apply
- Never use any type
- Interfaces for public APIs, type aliases for unions/intersections
- Explicit return types for all public functions
- readonly where possible
- Avoid type assertions; use type narrowing instead
- strict, noImplicitAny, strictNullChecks assumed
- Optional parameters instead of overloads where possible
- Union types preferred over enums
- Use nullish coalescing (??) over || for null/undefined checks`,
    },
    {
      label: 'XO TypeScript Style Guide',
      rules: `XO TypeScript Style Guide — apply these rules strictly:
- ESLint recommended + stricter rules throughout
- No any type
- Explicit return types required
- Prefer const assertions
- No non-null assertions
- Strict null checks assumed
- Use type imports (import type { Foo })
- Prefer readonly arrays (ReadonlyArray<T> or readonly T[])
- No implicit any
- Consistent error handling with typed catch clauses
- Modern JS/TS patterns preferred`,
    },
  ],
};

function detectConfigFiles(cwd: string): string {
  const targets = [
    '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json',
    '.eslintrc.yml', '.eslintrc.yaml', 'eslint.config.js', 'eslint.config.mjs',
    '.prettierrc', '.prettierrc.js', '.prettierrc.json', '.prettierrc.yml',
    'tsconfig.json', 'biome.json', '.editorconfig',
  ];
  const parts: string[] = [];
  for (const file of targets) {
    const filePath = path.join(cwd, file);
    if (fs.existsSync(filePath)) {
      try { parts.push(`=== ${file} ===\n${fs.readFileSync(filePath, 'utf-8')}`); } catch {}
    }
  }
  return parts.join('\n\n');
}

function readConventionsFile(cwd: string): string {
  const p = path.join(cwd, 'CONVENTIONS.md');
  if (!fs.existsSync(p)) return '';
  try { return fs.readFileSync(p, 'utf-8').trim(); } catch { return ''; }
}

function appendOverride(rules: string, override: string): string {
  if (!override) return rules;
  const sep = rules ? '\n\n' : '';
  return `${rules}${sep}=== CONVENTIONS.md (project override — takes priority) ===\n${override}`;
}

function runRepomix(cwd: string, include?: string): string {
  const tmp = path.join(cwd, '.repomix-context.txt');
  try {
    const includeFlag = include
      ? `--include "${include}"`
      : '--include "**/*.ts" --ignore "dist/**,node_modules/**,**/*.d.ts"';
    execSync(`npx repomix ${includeFlag} --output "${tmp}" --style plain`, {
      cwd,
      stdio: 'pipe',
    });
    const content = fs.readFileSync(tmp, 'utf-8');
    fs.unlinkSync(tmp);
    return content;
  } catch {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    return '';
  }
}

const D = '\x1b[2m', R = '\x1b[0m';

export async function selectConvention(cwd: string): Promise<ConventionContext> {
  console.log();

  const { mode } = await prompts({
    type: 'select',
    name: 'mode',
    message: '코드 컨벤션 설정',
    choices: [
      { title: '프로젝트 컨벤션 자동 감지', description: 'eslint / tsconfig 기반 · 빠름',          value: 'auto' },
      { title: '기업 표준 컨벤션 선택',     description: 'Airbnb / Google / XO · 빠름',            value: 'enterprise' },
      { title: '파일 직접 지정 (repomix)',  description: '참고 파일 선택 · 정확도 높음 · 토큰 보통', value: 'repomix-file' },
      { title: '프로젝트 전체 분석 (repomix)', description: '전체 코드 분석 · 정확도 최고 · 토큰 많음', value: 'repomix-full' },
    ],
    hint: '↑↓ 이동  Enter 선택',
  }, { onCancel: () => process.exit(0) });

  const override = readConventionsFile(cwd);

  if (mode === 'auto') {
    const configs = detectConfigFiles(cwd);
    const rules = appendOverride(
      configs ? `Follow the project's existing code conventions below:\n\n${configs}` : '',
      override,
    );
    const label = configs
      ? override ? '프로젝트 컨벤션 + CONVENTIONS.md' : '프로젝트 컨벤션 자동 감지'
      : override ? 'CONVENTIONS.md' : '기본값';
    return { source: 'auto', label, rules };
  }

  if (mode === 'repomix-file') {
    const { input } = await prompts({
      type: 'text',
      name: 'input',
      message: '참고 파일 입력 (쉼표 구분, 예: src/utils.ts,src/types.ts)',
    }, { onCancel: () => process.exit(0) });
    process.stdout.write(`  ${D}▸ repomix 실행 중 ...${R}`);
    const raw = runRepomix(cwd, (input as string).trim());
    const context = raw.slice(0, 12000);
    process.stdout.write(`\r${' '.repeat(30)}\r`);
    const rules = appendOverride(
      context ? `Reference code from this project (use these patterns as style guide):\n\n${context}` : '',
      override,
    );
    return { source: 'auto', label: 'repomix (지정 파일) + CONVENTIONS.md', rules };
  }

  if (mode === 'repomix-full') {
    process.stdout.write(`  ${D}▸ repomix 전체 분석 중 ...${R}`);
    const raw = runRepomix(cwd);
    const context = raw.slice(0, 20000);
    process.stdout.write(`\r${' '.repeat(30)}\r`);
    const rules = appendOverride(
      context ? `Full project context (use these patterns as style guide):\n\n${context}` : '',
      override,
    );
    return { source: 'auto', label: 'repomix (전체 분석) + CONVENTIONS.md', rules, parallel: true };
  }

  // enterprise
  const { lang } = await prompts({
    type: 'select',
    name: 'lang',
    message: '언어 선택',
    choices: [
      { title: 'JavaScript', value: 'js' },
      { title: 'TypeScript', value: 'ts' },
    ],
    hint: '↑↓ 이동  Enter 선택',
  }, { onCancel: () => process.exit(0) });

  const styles = ENTERPRISE[lang as string];

  const { styleIdx } = await prompts({
    type: 'select',
    name: 'styleIdx',
    message: `${lang === 'ts' ? 'TypeScript' : 'JavaScript'} 기업 스타일 선택`,
    choices: styles.map((s, i) => ({ title: s.label, value: i })),
    hint: '↑↓ 이동  Enter 선택',
  }, { onCancel: () => process.exit(0) });

  const selected = styles[styleIdx as number];
  const rules = appendOverride(selected.rules, override);
  const label = override ? `${selected.label} + CONVENTIONS.md` : selected.label;
  return { source: 'enterprise', label, rules };
}

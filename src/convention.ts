import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { execSync } from 'child_process';

export interface ConventionContext {
  source: 'auto' | 'enterprise';
  label: string;
  rules: string;
  parallel?: boolean;
}

const D = '\x1b[2m', B = '\x1b[1m', R = '\x1b[0m';

const ENTERPRISE: Record<string, Record<string, { label: string; rules: string }>> = {
  js: {
    '1': {
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
    '2': {
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
    '3': {
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
  },
  ts: {
    '1': {
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
    '2': {
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
    '3': {
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
  },
};

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise(resolve => rl.question(question, answer => resolve(answer.trim())));
}

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
      try {
        parts.push(`=== ${file} ===\n${fs.readFileSync(filePath, 'utf-8')}`);
      } catch {}
    }
  }
  return parts.join('\n\n');
}

function readConventionsFile(cwd: string): string {
  const conventionsPath = path.join(cwd, 'CONVENTIONS.md');
  if (!fs.existsSync(conventionsPath)) return '';
  try {
    return fs.readFileSync(conventionsPath, 'utf-8').trim();
  } catch {
    return '';
  }
}

function appendOverride(rules: string, override: string): string {
  if (!override) return rules;
  const separator = rules ? '\n\n' : '';
  return `${rules}${separator}=== CONVENTIONS.md (project override — takes priority) ===\n${override}`;
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

export async function selectConvention(cwd: string): Promise<ConventionContext> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log(`\n  ${B}◆  컨텍스트 설정${R}\n`);
    console.log(`  ${D}[1]${R} 프로젝트 컨벤션 자동 감지     ${D}eslint / tsconfig 기반 · 빠름${R}`);
    console.log(`  ${D}[2]${R} 기업 표준 컨벤션 선택         ${D}Airbnb / Google / XO · 빠름${R}`);
    console.log(`  ${D}[3]${R} 파일 직접 지정 (repomix)      ${D}참고 파일 선택 · 정확도 높음 · 토큰 보통${R}`);
    console.log(`  ${D}[4]${R} 프로젝트 전체 분석 (repomix)  ${D}전체 코드 분석 · 정확도 최고 · 토큰 많음${R}\n`);

    const choice = await ask(rl, `  선택 (1~4): `);
    const override = readConventionsFile(cwd);

    if (choice === '3') {
      const input = await ask(rl, `  참고 파일 입력 ${D}(쉼표 구분, 예: src/utils.ts,src/types.ts)${R}: `);
      rl.close();
      process.stdout.write(`  ${D}▸ repomix 실행 중 ...${R}`);
      const raw = runRepomix(cwd, input.trim());
      const context = raw.slice(0, 12000);
      process.stdout.write(`\r${' '.repeat(30)}\r`);
      const rules = appendOverride(
        context ? `Reference code from this project (use these patterns as style guide):\n\n${context}` : '',
        override,
      );
      return { source: 'auto', label: `repomix (지정 파일) + CONVENTIONS.md`, rules };
    }

    if (choice === '4') {
      rl.close();
      process.stdout.write(`  ${D}▸ repomix 전체 분석 중 ...${R}`);
      const raw = runRepomix(cwd);
      const context = raw.slice(0, 20000);
      process.stdout.write(`\r${' '.repeat(30)}\r`);
      const rules = appendOverride(
        context ? `Full project context (use these patterns as style guide):\n\n${context}` : '',
        override,
      );
      return { source: 'auto', label: `repomix (전체 분석) + CONVENTIONS.md`, rules, parallel: true };
    }

    if (choice === '2') {
      console.log(`\n  ${B}◆  언어 선택${R}\n`);
      console.log(`  ${D}[1]${R} JavaScript`);
      console.log(`  ${D}[2]${R} TypeScript\n`);

      const lang = await ask(rl, `  선택 (1/2): `);
      const langKey = lang === '2' ? 'ts' : 'js';
      const langLabel = langKey === 'ts' ? 'TypeScript' : 'JavaScript';
      const styles = ENTERPRISE[langKey];

      console.log(`\n  ${B}◆  ${langLabel} 기업 스타일 선택${R}\n`);
      for (const [key, val] of Object.entries(styles)) {
        console.log(`  ${D}[${key}]${R} ${val.label}`);
      }
      console.log();

      const styleChoice = await ask(rl, `  선택 (1~${Object.keys(styles).length}): `);
      rl.close();

      const selected = styles[styleChoice] ?? styles['1'];
      const rules = appendOverride(selected.rules, override);
      const label = override ? `${selected.label} + CONVENTIONS.md` : selected.label;
      return { source: 'enterprise', label, rules };
    }

    // 1번 (기본값)
    const configs = detectConfigFiles(cwd);
    rl.close();
    const rules = appendOverride(
      configs ? `Follow the project's existing code conventions below:\n\n${configs}` : '',
      override,
    );
    const label = configs
      ? override ? '프로젝트 컨벤션 + CONVENTIONS.md' : '프로젝트 컨벤션 자동 감지'
      : override ? 'CONVENTIONS.md' : '기본값';
    return { source: 'auto', label, rules };

  } catch (err) {
    rl.close();
    throw err;
  }
}

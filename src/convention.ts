import fs from 'fs';
import path from 'path';
import prompts from 'prompts';
import type { Lang } from './i18n.js';
import { t } from './i18n.js';

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

export async function selectConvention(cwd: string, lang: Lang): Promise<ConventionContext> {
  const msg = t(lang);

  const { source } = await prompts({
    type: 'select',
    name: 'source',
    message: msg.conventionHeader,
    choices: [
      { title: msg.conventionChoices[0].title, description: msg.conventionChoices[0].description, value: 'auto' },
      { title: msg.conventionChoices[1].title, description: msg.conventionChoices[1].description, value: 'enterprise' },
    ],
    hint: '↑↓  Enter',
  }, { onCancel: () => process.exit(0) });

  const override = readConventionsFile(cwd);

  if (source !== 'enterprise') {
    const configs = detectConfigFiles(cwd);
    const rules = appendOverride(
      configs ? `Follow the project's existing code conventions below:\n\n${configs}` : '',
      override,
    );
    const labels = msg.conventionLabels;
    const label = configs
      ? (override ? labels.autoWithOverride : labels.auto)
      : (override ? labels.overrideOnly : labels.default);
    return { source: 'auto', label, rules };
  }

  const { langKey } = await prompts({
    type: 'select',
    name: 'langKey',
    message: msg.languageHeader,
    choices: [
      { title: 'JavaScript', value: 'js' },
      { title: 'TypeScript', value: 'ts' },
    ],
    hint: '↑↓  Enter',
  }, { onCancel: () => process.exit(0) });

  const styles = ENTERPRISE[langKey as string];
  const langLabel = langKey === 'ts' ? 'TypeScript' : 'JavaScript';

  const { styleIdx } = await prompts({
    type: 'select',
    name: 'styleIdx',
    message: msg.styleHeader(langLabel),
    choices: styles.map((s, i) => ({ title: s.label, value: i })),
    hint: '↑↓  Enter',
  }, { onCancel: () => process.exit(0) });

  const selected = styles[styleIdx as number];
  const rules = appendOverride(selected.rules, override);
  const label = override ? `${selected.label} + CONVENTIONS.md` : selected.label;
  return { source: 'enterprise', label, rules, parallel: true };
}

import { execSync } from 'child_process';
import readline from 'readline';
import { detect } from './detect.js';
import { detectNesting } from './detectNesting.js';
import { generate as generateTidy, generateGuardClauses as generateTidyNesting } from './generate.js';
import { apply, rollback } from './apply.js';
import { formatSingle } from './format.js';
import { selectConvention, type ConventionContext } from './convention.js';

const D = '\x1b[2m', B = '\x1b[1m', G = '\x1b[32m', R2 = '\x1b[31m', Y = '\x1b[33m', R = '\x1b[0m';

function tscCheck(filePath: string): { ok: boolean; error: string } {
  try {
    execSync(`npx tsc --noEmit --strict --lib ES2022,DOM "${filePath}"`, { stdio: 'pipe' });
    return { ok: true, error: '' };
  } catch (err: any) {
    const stderr = err.stderr?.toString().trim();
    const stdout = err.stdout?.toString().trim();
    return { ok: false, error: stderr || stdout || '' };
  }
}

function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

function getChangedTsFiles(): string[] {
  const bases = ['develop', 'main', 'master'];
  for (const base of bases) {
    try {
      const out = execSync(`git diff ${base}...HEAD --name-only -- "*.ts"`, { stdio: 'pipe' })
        .toString()
        .trim();
      if (out) return out.split('\n').filter(f => f.endsWith('.ts'));
      return [];
    } catch {}
  }
  return [];
}

async function processFile(filePath: string, convention: ConventionContext): Promise<void> {
  const anyResult = detect(filePath);
  const nestingResult = detectNesting(filePath);
  const useNesting = anyResult.occurrences.length === 0 && nestingResult.occurrences.length > 0;

  if (anyResult.occurrences.length === 0 && nestingResult.occurrences.length === 0) {
    console.log(`  ${D}skip${R}  ${filePath}  ${D}— 스멜 없음${R}`);
    return;
  }

  const count = useNesting ? nestingResult.occurrences.length : anyResult.occurrences.length;
  const label = useNesting ? `중첩 조건문 ${count}건` : `any 타입 ${count}건`;
  const fname = filePath.split('/').pop();

  console.log(`\n  ${B}◆  ${fname}${R}  ${D}·  ${label}${R}\n`);

  let option;
  try {
    process.stdout.write(`  ${D}▸ 리팩토링 생성 중 ...${R}`);
    option = useNesting
      ? await generateTidyNesting(nestingResult, convention.rules || undefined)
      : await generateTidy(anyResult, convention.rules || undefined);
    process.stdout.write(`\r${' '.repeat(30)}\r`);
  } catch (err) {
    console.error(`\n  ${R2}✗  generate 실패:${R} ${(err as Error).message}\n`);
    return;
  }

  const originalSource = useNesting ? nestingResult.sourceCode : anyResult.sourceCode;
  process.stdout.write(formatSingle(option, originalSource));

  const yes = await confirm(`  ${Y}?  이 변경사항을 적용할까요?${R}  ${D}(y/n):${R} `);
  if (!yes) {
    console.log(`  ${D}건너뜀${R}\n`);
    return;
  }

  const result = apply(filePath, option);

  process.stdout.write(`  ${D}▸ tsc 검증 중 ...${R}`);
  const check = tscCheck(filePath);
  process.stdout.write(`\r${' '.repeat(30)}\r`);

  if (!check.ok) {
    rollback(filePath);
    console.log(`  ${R2}✗  tsc 실패 — 원본 복구됨${R}\n`);
    console.error(check.error);
    return;
  }

  const bakName = result.filePath.split('/').pop();
  console.log(`  ${G}✓  tsc 통과${R}  ${D}·  백업: ${bakName}.bak${R}\n`);
}

async function runPRMode(): Promise<void> {
  const files = getChangedTsFiles();

  if (files.length === 0) {
    console.log(`\n  ${D}◆${R}  변경된 TypeScript 파일이 없습니다.\n`);
    return;
  }

  console.log(`\n  ${B}◆  PR 모드${R}  ${D}·  변경 파일 ${files.length}개${R}\n`);
  files.forEach((f, i) => console.log(`  ${D}${i + 1}.${R} ${f}`));

  const convention = await selectConvention(process.cwd());
  console.log(`\n  ${D}컨벤션: ${convention.label}${R}\n`);

  for (const file of files) {
    await processFile(file, convention);
  }

  console.log(`  ${G}◆  완료${R}\n`);
}

async function runSingleFile(filePath: string): Promise<void> {
  const convention = await selectConvention(process.cwd());
  console.log(`\n  ${D}컨벤션: ${convention.label}${R}\n`);
  await processFile(filePath, convention);
}

async function main() {
  const args = process.argv.slice(2);
  const isPR = args.includes('--pr');
  const filePath = args.find(a => !a.startsWith('--'));

  if (isPR) {
    await runPRMode();
  } else if (filePath) {
    await runSingleFile(filePath);
  } else {
    console.error(`사용법:\n  node dist/index.js <파일경로>\n  node dist/index.js --pr`);
    process.exit(1);
  }
}

main();

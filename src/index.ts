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

function getBaseBranch(): string {
  try {
    const remote = execSync('git rev-parse --abbrev-ref origin/HEAD', { stdio: 'pipe' })
      .toString().trim();
    return remote.replace('origin/', '');
  } catch {}
  for (const b of ['develop', 'main', 'master']) {
    try {
      execSync(`git rev-parse --verify ${b}`, { stdio: 'pipe' });
      return b;
    } catch {}
  }
  return 'main';
}

function getChangedTsFiles(): string[] {
  const base = getBaseBranch();
  try {
    const out = execSync(`git diff ${base}...HEAD --name-only -- "*.ts"`, { stdio: 'pipe' })
      .toString().trim();
    return out ? out.split('\n').filter(f => f.endsWith('.ts')) : [];
  } catch {
    return [];
  }
}

type ApplyRecord = { filePath: string };

async function processFile(
  filePath: string,
  convention: ConventionContext,
  applied: ApplyRecord[]
): Promise<'applied' | 'skipped' | 'failed'> {
  const anyResult = detect(filePath);
  const nestingResult = detectNesting(filePath);
  const useNesting = anyResult.occurrences.length === 0 && nestingResult.occurrences.length > 0;

  if (anyResult.occurrences.length === 0 && nestingResult.occurrences.length === 0) {
    console.log(`  ${D}skip${R}  ${filePath}  ${D}— 스멜 없음${R}`);
    return 'skipped';
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
    return 'failed';
  }

  const originalSource = useNesting ? nestingResult.sourceCode : anyResult.sourceCode;
  process.stdout.write(formatSingle(option, originalSource));

  const yes = await confirm(`  ${Y}?  이 변경사항을 적용할까요?${R}  ${D}(y/n):${R} `);
  if (!yes) {
    console.log(`  ${D}건너뜀${R}\n`);
    return 'skipped';
  }

  const result = apply(filePath, option);

  process.stdout.write(`  ${D}▸ tsc 검증 중 ...${R}`);
  const check = tscCheck(filePath);
  process.stdout.write(`\r${' '.repeat(30)}\r`);

  if (!check.ok) {
    rollback(filePath);
    console.log(`  ${R2}✗  tsc 실패 — 원본 복구됨${R}\n`);
    console.error(check.error);
    return 'failed';
  }

  applied.push({ filePath: result.filePath });
  const bakName = result.filePath.split('/').pop();
  console.log(`  ${G}✓  tsc 통과${R}  ${D}·  백업: ${bakName}.bak${R}\n`);
  return 'applied';
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

  const applied: ApplyRecord[] = [];
  let failed = 0;

  for (let i = 0; i < files.length; i++) {
    console.log(`  ${D}── 파일 ${i + 1}/${files.length}${R}  ${files[i]}\n`);
    const result = await processFile(files[i], convention, applied);
    if (result === 'failed') failed++;
  }

  console.log(`  ${D}────────────────────────────────────────────────────────────${R}`);
  console.log(`  ${G}◆  완료${R}  ${D}·  적용 ${applied.length}개  건너뜀 ${files.length - applied.length - failed}개  실패 ${failed}개${R}\n`);

  if (failed > 0 && applied.length > 0) {
    const revert = await confirm(`  ${Y}?  적용된 ${applied.length}개 파일도 되돌릴까요?${R}  ${D}(y/n):${R} `);
    if (revert) {
      for (const { filePath } of applied) {
        const ok = rollback(filePath);
        console.log(ok
          ? `  ${G}↩  복구됨:${R} ${filePath}`
          : `  ${R2}✗  백업 없음:${R} ${filePath}`
        );
      }
      console.log();
    }
  }
}

async function runSingleFile(filePath: string): Promise<void> {
  const convention = await selectConvention(process.cwd());
  console.log(`\n  ${D}컨벤션: ${convention.label}${R}\n`);
  await processFile(filePath, convention, []);
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

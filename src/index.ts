import { execSync } from 'child_process';
import { detect } from './detect.js';
import { detectNesting } from './detectNesting.js';
import { generate as generateTidy, generateGuardClauses as generateTidyNesting } from './generate.js';
import { apply, rollback } from './apply.js';
import { formatSingle } from './format.js';

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

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('사용법: node src/index.ts <파일경로>');
    process.exit(1);
  }

  // 1. detect — any 우선, 없으면 nesting fallback
  const anyResult = detect(filePath);
  const nestingResult = detectNesting(filePath);

  const useNesting =
    anyResult.occurrences.length === 0 && nestingResult.occurrences.length > 0;

  const D = '\x1b[2m', B = '\x1b[1m', G = '\x1b[32m', R2 = '\x1b[31m', R = '\x1b[0m';

  if (anyResult.occurrences.length === 0 && nestingResult.occurrences.length === 0) {
    console.log(`\n  ${D}◆${R}  리팩토링할 코드 스멜이 없습니다.\n`);
    process.exit(0);
  }

  const count  = useNesting ? nestingResult.occurrences.length : anyResult.occurrences.length;
  const label  = useNesting ? `중첩 조건문 ${count}건` : `any 타입 ${count}건`;
  const fname  = filePath.split('/').pop();

  console.log(`\n  ${B}◆  ${fname}${R}  ${D}·  ${label}${R}\n`);

  // 2. generate
  let option;
  try {
    process.stdout.write(`  ${D}▸ 리팩토링 생성 중 ...${R}`);
    option = useNesting
      ? await generateTidyNesting(nestingResult)
      : await generateTidy(anyResult);
    process.stdout.write(`\r${' '.repeat(30)}\r`);
  } catch (err) {
    console.error(`\n  ${R2}✗  generate 실패:${R} ${(err as Error).message}\n`);
    process.exit(1);
  }

  // 3. full diff 출력
  const originalSource = useNesting ? nestingResult.sourceCode : anyResult.sourceCode;
  process.stdout.write(formatSingle(option, originalSource));

  // 4. apply
  const result = apply(filePath, option);

  // 5. tsc 검증 — 실패 시 백업에서 복구
  process.stdout.write(`  ${D}▸ tsc 검증 중 ...${R}`);
  const check = tscCheck(filePath);
  process.stdout.write(`\r${' '.repeat(30)}\r`);

  if (!check.ok) {
    rollback(filePath);
    console.log(`  ${R2}✗  tsc 실패 — 원본 복구됨${R}\n`);
    console.error(check.error);
    process.exit(1);
  }

  const bakName = result.filePath.split('/').pop();
  console.log(`  ${G}✓  tsc 통과${R}  ${D}·  백업: ${bakName}.bak${R}\n`);
}

main();

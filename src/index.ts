import { execSync } from 'child_process';
import { detect } from './detect.js';
import { detectNesting } from './detectNesting.js';
import { generate as generateTidy, generateGuardClauses as generateTidyNesting } from './generate.js';
import { apply, rollback } from './apply.js';
import { formatSingle } from './format.js';

function tscCheck(filePath: string): { ok: boolean; error: string } {
  try {
    execSync(`npx tsc --noEmit --strict "${filePath}"`, { stdio: 'pipe' });
    return { ok: true, error: '' };
  } catch (err: any) {
    return { ok: false, error: (err.stderr ?? err.stdout ?? '').toString().trim() };
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

  if (anyResult.occurrences.length === 0 && nestingResult.occurrences.length === 0) {
    console.log('리팩토링할 코드 스멜이 없습니다.');
    process.exit(0);
  }

  const catalogLabel = useNesting
    ? `중첩 조건문 ${nestingResult.occurrences.length}건`
    : `any 타입 ${anyResult.occurrences.length}건`;

  console.log(`\n감지: ${filePath} — ${catalogLabel}`);

  // 2. generate
  let option;
  try {
    console.log('Tidy 리팩토링 생성 중...');
    option = useNesting
      ? await generateTidyNesting(nestingResult)
      : await generateTidy(anyResult);
  } catch (err) {
    console.error('generate 실패:', (err as Error).message);
    process.exit(1);
  }

  // 3. full diff 출력
  const originalSource = useNesting ? nestingResult.sourceCode : anyResult.sourceCode;
  process.stdout.write(formatSingle(option, originalSource));

  // 4. apply
  const result = apply(filePath, option);

  // 5. tsc 검증 — 실패 시 백업에서 복구
  process.stdout.write('tsc 검증 중...');
  const check = tscCheck(filePath);

  if (!check.ok) {
    rollback(filePath);
    console.log(' 실패 — 원본 복구됨');
    console.error('\n컴파일 오류:\n' + check.error);
    process.exit(1);
  }

  console.log(' 통과');
  console.log(`완료: ${result.filePath}`);
  console.log(`백업: ${result.filePath}.bak`);
}

main();

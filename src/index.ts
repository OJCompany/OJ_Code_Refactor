import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { detect } from './detect.js';
import { detectNesting } from './detectNesting.js';
import { generate as generateTidy, generateGuardClauses as generateTidyNesting, validateConvention } from './generate.js';
import { apply, rollback } from './apply.js';
import { formatSingle } from './format.js';
import { selectConvention } from './convention.js';

const D = '\x1b[2m', B = '\x1b[1m', G = '\x1b[32m', R2 = '\x1b[31m', Y = '\x1b[33m', R = '\x1b[0m';

function findTsConfig(startDir: string): string | null {
  let dir = startDir;
  while (true) {
    const candidate = path.join(dir, 'tsconfig.json');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function tscCheckAsync(filePath: string): Promise<{ ok: boolean; error: string }> {
  return new Promise(resolve => {
    const absPath = path.resolve(filePath);
    const tsconfig = findTsConfig(path.dirname(absPath));
    try {
      const cmd = tsconfig
        ? `npx tsc --noEmit -p "${tsconfig}"`
        : `npx tsc --noEmit --strict --lib ES2022,DOM "${absPath}"`;
      execSync(cmd, { stdio: 'pipe' });
      resolve({ ok: true, error: '' });
    } catch (err: any) {
      const raw: string = err.stderr?.toString() || err.stdout?.toString() || '';
      if (tsconfig) {
        const fileErrors = raw.split('\n').filter(l => l.startsWith(absPath)).join('\n').trim();
        if (!fileErrors) { resolve({ ok: true, error: '' }); return; }
        resolve({ ok: false, error: fileErrors });
      } else {
        resolve({ ok: false, error: raw.trim() });
      }
    }
  });
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('사용법: node dist/index.js <파일경로>');
    process.exit(1);
  }

  const anyResult = detect(filePath);
  const nestingResult = detectNesting(filePath);
  const useNesting = anyResult.occurrences.length === 0 && nestingResult.occurrences.length > 0;

  if (anyResult.occurrences.length === 0 && nestingResult.occurrences.length === 0) {
    console.log(`\n  ${D}◆${R}  리팩토링할 코드 스멜이 없습니다.\n`);
    process.exit(0);
  }

  const count = useNesting ? nestingResult.occurrences.length : anyResult.occurrences.length;
  const label = useNesting ? `중첩 조건문 ${count}건` : `any 타입 ${count}건`;
  const fname = filePath.split('/').pop();

  console.log(`\n  ${B}◆  ${fname}${R}  ${D}·  ${label}${R}\n`);

  const convention = await selectConvention(process.cwd());
  console.log(`\n  ${D}컨벤션: ${convention.label}${R}\n`);

  const originalSource = useNesting ? nestingResult.sourceCode : anyResult.sourceCode;

  async function generateOption(feedbackReason?: string) {
    process.stdout.write(`  ${D}▸ 리팩토링 생성 중 ...${R}`);
    try {
      const opt = useNesting
        ? await generateTidyNesting(nestingResult, convention.rules || undefined, feedbackReason)
        : await generateTidy(anyResult, convention.rules || undefined, feedbackReason);
      process.stdout.write(`\r${' '.repeat(30)}\r`);
      return opt;
    } catch (err) {
      process.stdout.write(`\r${' '.repeat(30)}\r`);
      console.error(`\n  ${R2}✗  generate 실패:${R} ${(err as Error).message}\n`);
      process.exit(1);
    }
  }

  let option = await generateOption();
  process.stdout.write(formatSingle(option, originalSource));

  const result = apply(filePath, option);

  if (convention.parallel && convention.rules) {
    // tsc + LLM 검증 병렬 실행
    process.stdout.write(`  ${Y}▸ 병렬 검증 중 ...${R}  ${D}(tsc + LLM 컨벤션)${R}`);
    const [tscResult, validation] = await Promise.all([
      tscCheckAsync(filePath),
      validateConvention(option.fullCode, convention.rules),
    ]);
    process.stdout.write(`\r${' '.repeat(60)}\r`);

    if (!tscResult.ok) {
      rollback(filePath);
      console.log(`  ${R2}✗  tsc 실패 — 원본 복구됨${R}\n`);
      console.error(tscResult.error);
      process.exit(1);
    }

    if (!validation.pass) {
      rollback(filePath);
      console.log(`  ${Y}↻  컨벤션 불일치 — 피드백 반영 후 재생성${R}  ${D}사유: ${validation.reason}${R}\n`);
      option = await generateOption(validation.reason);
      process.stdout.write(formatSingle(option, originalSource));
      apply(filePath, option);

      process.stdout.write(`  ${Y}▸ 재검증 중 ...${R}  ${D}(tsc + LLM 컨벤션)${R}`);
      const [tscResult2, validation2] = await Promise.all([
        tscCheckAsync(filePath),
        validateConvention(option.fullCode, convention.rules),
      ]);
      process.stdout.write(`\r${' '.repeat(60)}\r`);

      if (!tscResult2.ok) {
        rollback(filePath);
        console.log(`  ${R2}✗  tsc 실패 — 원본 복구됨${R}\n`);
        console.error(tscResult2.error);
        process.exit(1);
      }
      if (!validation2.pass) {
        rollback(filePath);
        console.log(`  ${R2}✗  컨벤션 재검증 실패 — 원본 복구됨${R}\n`);
        console.log(`  ${D}사유: ${validation2.reason}${R}\n`);
        process.exit(1);
      }
    }

    const bakName = result.filePath.split('/').pop();
    console.log(`  ${G}✓  tsc 통과${R}  ${G}✓  컨벤션 통과${R}  ${D}·  백업: ${bakName}.bak${R}\n`);

  } else {
    // 기본: tsc만 검증
    process.stdout.write(`  ${D}▸ tsc 검증 중 ...${R}`);
    const check = await tscCheckAsync(filePath);
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
}

main();

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import prompts from 'prompts';
import { detect } from './detect.js';
import { detectNesting } from './detectNesting.js';
import { generate as generateTidy, generateGuardClauses as generateTidyNesting, validateConvention } from './generate.js';
import { apply, rollback } from './apply.js';
import { formatSingle } from './format.js';
import { selectConvention, type ConventionContext } from './convention.js';

const D = '\x1b[2m', B = '\x1b[1m', G = '\x1b[32m', R2 = '\x1b[31m', Y = '\x1b[33m', R = '\x1b[0m';

// ─── tsconfig 탐색 + 파일 단위 tsc 검증 ───────────────────────────────────────

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

// ─── PR 모드 유틸 ─────────────────────────────────────────────────────────────

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

// ─── 쿼카 배너 + 로딩 애니메이션 ─────────────────────────────────────────────

function printBanner() {
  const Rb = '\x1b[0m', Bb = '\x1b[1m';
  const fg = (r: number, g: number, b: number) => `\x1b[38;2;${r};${g};${b}m`;
  const gradient = (text: string, from: [number,number,number], to: [number,number,number]) =>
    text.split('').map((ch, i) => {
      const t = text.length === 1 ? 0 : i / (text.length - 1);
      const r = Math.round(from[0] + (to[0] - from[0]) * t);
      const g = Math.round(from[1] + (to[1] - from[1]) * t);
      const bv = Math.round(from[2] + (to[2] - from[2]) * t);
      return fg(r, g, bv) + ch;
    }).join('') + Rb;

  const displayWidth = (s: string) => {
    const plain = s.replace(/\x1b\[[^m]*m/g, '');
    let w = 0;
    for (const ch of plain) {
      const cp = ch.codePointAt(0)!;
      w += (
        (cp >= 0x1100 && cp <= 0x115F) ||
        (cp >= 0x2E80 && cp <= 0x303E) ||
        (cp >= 0x3041 && cp <= 0x33FF) ||
        (cp >= 0x3400 && cp <= 0x4DBF) ||
        (cp >= 0x4E00 && cp <= 0x9FFF) ||
        (cp >= 0xAC00 && cp <= 0xD7AF) ||
        (cp >= 0xF900 && cp <= 0xFAFF) ||
        (cp >= 0xFF00 && cp <= 0xFF60)
      ) ? 2 : 1;
    }
    return w;
  };

  const PURPLE: [number,number,number] = [125, 86, 244];
  const PINK:   [number,number,number] = [255, 100, 180];
  const AQUA:   [number,number,number] = [100, 220, 200];
  const YELLOW: [number,number,number] = [255, 210, 80];
  const TAN:    [number,number,number] = [210, 170, 100];
  const BROWN:  [number,number,number] = [160, 110, 60];

  const borderC = fg(...PURPLE);
  const w = 44;
  const top    = borderC + '  ╭' + '─'.repeat(w) + '╮' + Rb;
  const bottom = borderC + '  ╰' + '─'.repeat(w) + '╯' + Rb;

  const bar = (content: string) => {
    const pad = w - displayWidth(content);
    return borderC + '  │' + Rb + content + ' '.repeat(Math.max(0, pad)) + borderC + '│' + Rb;
  };

  const titleLine = '  ' + Bb + gradient('OJ Refactor', PURPLE, PINK) + Rb;
  const subLine   = '  ' + fg(...AQUA) + 'TypeScript 리팩토링 도구' + Rb;
  const qLine1    = '  ' + fg(...TAN)   + Bb + '/\\ ___ /\\ ' + Rb
                  + '  ' + fg(...YELLOW) + Bb + '쿼카와 함께하는 클린코드' + Rb;
  const qLine2    = '  ' + fg(...TAN)   + Bb + '(  o\\_/o  )' + Rb;
  const qLine3    = '  ' + fg(...BROWN) + Bb + '(___~~~___)' + Rb;

  console.log(top);
  console.log(bar(titleLine));
  console.log(bar(subLine));
  console.log(bar(''));
  console.log(bar(qLine1));
  console.log(bar(qLine2));
  console.log(bar(qLine3));
  console.log(bar(''));
  console.log(bottom);
  console.log();
}

async function withQuokkaAnimation<T>(task: Promise<T>): Promise<T> {
  const TAN   = '\x1b[38;2;210;170;100m';
  const BROWN = '\x1b[38;2;160;110;60m';
  const DIM   = '\x1b[2m';
  const BLD   = '\x1b[1m';
  const RST   = '\x1b[0m';

  const frames = [
    [TAN+BLD+'  /\\ ___ /\\  '+RST, TAN+BLD+' (  o\\_/o  ) '+RST, BROWN+BLD+' (___~~~___) '+RST],
    [TAN+BLD+' /\\ ___ /\\   '+RST, TAN+BLD+'(  o\\_/o  )  '+RST, BROWN+BLD+'(___~~~___)  '+RST],
    [TAN+BLD+'  /\\ ___ /\\  '+RST, TAN+BLD+' (  o\\_/o  ) '+RST, BROWN+BLD+' (___~~~___) '+RST],
    [TAN+BLD+'   /\\ ___ /\\ '+RST, TAN+BLD+'  (  o\\_/o  )'+RST, BROWN+BLD+'  (___~~~___)'+RST],
  ];
  const dots = ['▸ 생성 중 .  ', '▸ 생성 중 .. ', '▸ 생성 중 ...'];

  const LINE_COUNT = 4;
  let frameIdx = 0;
  let done = false;

  process.stdout.write('\n'.repeat(LINE_COUNT));

  function render() {
    process.stdout.write(`\x1b[${LINE_COUNT}A`);
    const frame = frames[frameIdx % frames.length];
    for (const line of frame) {
      process.stdout.write(`\x1b[2K  ${line}\n`);
    }
    process.stdout.write(`\x1b[2K  ${DIM}${dots[frameIdx % dots.length]}${RST}\n`);
    frameIdx++;
  }

  function clear() {
    process.stdout.write(`\x1b[${LINE_COUNT}A`);
    for (let i = 0; i < LINE_COUNT; i++) process.stdout.write('\x1b[2K\n');
    process.stdout.write(`\x1b[${LINE_COUNT}A`);
  }

  render();
  const interval = setInterval(() => { if (!done) render(); }, 160);

  try {
    const result = await task;
    done = true;
    clearInterval(interval);
    clear();
    return result;
  } catch (err) {
    done = true;
    clearInterval(interval);
    clear();
    throw err;
  }
}

// ─── 파일 단위 리팩토링 (단일 + PR 모드 공용) ─────────────────────────────────

type ApplyRecord = { filePath: string };

async function processFile(
  filePath: string,
  convention: ConventionContext,
  applied: ApplyRecord[],
  feedbackReason?: string
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
  const originalSource = useNesting ? nestingResult.sourceCode : anyResult.sourceCode;

  console.log(`\n  ${B}◆  ${fname}${R}  ${D}·  ${label}${R}\n`);

  let option;
  try {
    option = await withQuokkaAnimation(
      useNesting
        ? generateTidyNesting(nestingResult, convention.rules || undefined, feedbackReason)
        : generateTidy(anyResult, convention.rules || undefined, feedbackReason)
    );
  } catch (err) {
    console.error(`\n  ${R2}✗  generate 실패:${R} ${(err as Error).message}\n`);
    return 'failed';
  }

  process.stdout.write(formatSingle(option, originalSource));

  const { yes } = await prompts({
    type: 'confirm',
    name: 'yes',
    message: '이 변경사항을 적용할까요?',
    initial: true,
  }, { onCancel: () => process.exit(0) });

  if (!yes) {
    console.log(`  ${D}건너뜀${R}\n`);
    return 'skipped';
  }

  const result = apply(filePath, option);

  if (convention.parallel && convention.rules) {
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
      return 'failed';
    }

    if (!validation.pass) {
      rollback(filePath);
      console.log(`  ${Y}↻  컨벤션 불일치 — 피드백 반영 후 재생성${R}  ${D}사유: ${validation.reason}${R}\n`);
      return processFile(filePath, convention, applied, validation.reason);
    }

    const bakName = result.filePath.split('/').pop();
    console.log(`  ${G}✓  tsc 통과${R}  ${G}✓  컨벤션 통과${R}  ${D}·  백업: ${bakName}.bak${R}\n`);
  } else {
    process.stdout.write(`  ${D}▸ tsc 검증 중 ...${R}`);
    const check = await tscCheckAsync(filePath);
    process.stdout.write(`\r${' '.repeat(30)}\r`);

    if (!check.ok) {
      rollback(filePath);
      console.log(`  ${R2}✗  tsc 실패 — 원본 복구됨${R}\n`);
      console.error(check.error);
      return 'failed';
    }

    const bakName = result.filePath.split('/').pop();
    console.log(`  ${G}✓  tsc 통과${R}  ${D}·  백업: ${bakName}.bak${R}\n`);
  }

  applied.push({ filePath: result.filePath });
  return 'applied';
}

// ─── PR 모드 ──────────────────────────────────────────────────────────────────

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
    const { revert } = await prompts({
      type: 'confirm',
      name: 'revert',
      message: `적용된 ${applied.length}개 파일도 되돌릴까요?`,
      initial: false,
    }, { onCancel: () => process.exit(0) });

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

// ─── 단일 파일 모드 ───────────────────────────────────────────────────────────

async function runSingleFile(filePath: string): Promise<void> {
  const convention = await selectConvention(process.cwd());
  console.log(`\n  ${D}컨벤션: ${convention.label}${R}\n`);
  await processFile(filePath, convention, []);
}

// ─── 진입점 ───────────────────────────────────────────────────────────────────

async function main() {
  printBanner();

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

import { execSync } from 'child_process';
import path from 'path';
import { detect } from './detect.js';
import { detectNesting } from './detectNesting.js';
import { generate as generateTidy, generateGuardClauses as generateTidyNesting } from './generate.js';
import { apply, rollback } from './apply.js';
import { formatSingle } from './format.js';
import { selectConvention } from './convention.js';

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

function printBanner() {
  const R = '\x1b[0m', B = '\x1b[1m';
  const fg = (r: number, g: number, b: number) => `\x1b[38;2;${r};${g};${b}m`;
  const gradient = (text: string, from: [number,number,number], to: [number,number,number]) =>
    text.split('').map((ch, i) => {
      const t = text.length === 1 ? 0 : i / (text.length - 1);
      const r = Math.round(from[0] + (to[0] - from[0]) * t);
      const g = Math.round(from[1] + (to[1] - from[1]) * t);
      const bv = Math.round(from[2] + (to[2] - from[2]) * t);
      return fg(r, g, bv) + ch;
    }).join('') + R;

  // 한글·CJK는 터미널에서 2컬럼 차지 — 폭 계산 시 반영
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
  const top    = borderC + '  ╭' + '─'.repeat(w) + '╮' + R;
  const bottom = borderC + '  ╰' + '─'.repeat(w) + '╯' + R;

  const bar = (content: string) => {
    const pad = w - displayWidth(content);
    return borderC + '  │' + R + content + ' '.repeat(Math.max(0, pad)) + borderC + '│' + R;
  };

  const titleLine = '  ' + B + gradient('OJ Refactor', PURPLE, PINK) + R;
  const subLine   = '  ' + fg(...AQUA) + 'TypeScript 리팩토링 도구' + R;
  const qLine1    = '  ' + fg(...TAN)   + B + '/\\ ___ /\\ ' + R
                  + '  ' + fg(...YELLOW) + B + '쿼카와 함께하는 클린코드' + R;
  const qLine2    = '  ' + fg(...TAN)   + B + '(  o\\_/o  )' + R;
  const qLine3    = '  ' + fg(...BROWN) + B + '(___~~~___)' + R;

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

  // 4 프레임 — 센터 → 왼쪽 → 센터 → 오른쪽
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

  // 애니메이션 영역 예약
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

async function main() {
  printBanner();

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

  // 2. 컨벤션 선택
  const cwd = process.cwd();
  const convention = await selectConvention(cwd);
  const D2 = '\x1b[2m', R3 = '\x1b[0m';
  console.log(`\n  ${D2}컨벤션: ${convention.label}${R3}\n`);

  // 3. generate (쿼카 댄스 애니메이션)
  let option;
  try {
    option = await withQuokkaAnimation(
      useNesting
        ? generateTidyNesting(nestingResult, convention.rules || undefined)
        : generateTidy(anyResult, convention.rules || undefined)
    );
  } catch (err) {
    console.error(`\n  ${R2}✗  generate 실패:${R} ${(err as Error).message}\n`);
    process.exit(1);
  }

  // 4. full diff 출력
  const originalSource = useNesting ? nestingResult.sourceCode : anyResult.sourceCode;
  process.stdout.write(formatSingle(option, originalSource));

  // 5. apply
  const result = apply(filePath, option);

  // 6. tsc 검증 — 실패 시 백업에서 복구
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

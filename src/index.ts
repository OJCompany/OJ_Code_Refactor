import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import prompts from 'prompts';
import { detect } from './detect.js';
import { detectNesting } from './detectNesting.js';
import { generate as generateTidy, generateGuardClauses as generateNesting, validateConvention } from './generate.js';
import { apply, rollback } from './apply.js';
import { formatSingle } from './format.js';
import { selectConvention, type ConventionContext } from './convention.js';
import { whenToTidy, analyzePRReadiness } from './tidyFirst.js';
import { buildCommitMessage, commitRefactoring } from './commitMessage.js';
import { detectRepoLanguage, t, type Lang } from './i18n.js';

const D = '\x1b[2m', B = '\x1b[1m', G = '\x1b[32m', R2 = '\x1b[31m', Y = '\x1b[33m', R = '\x1b[0m';

// ─── tsc check ───────────────────────────────────────────────────────────────

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
    } catch (err: unknown) {
      const e = err as { stderr?: Buffer; stdout?: Buffer };
      const raw: string = e.stderr?.toString() || e.stdout?.toString() || '';
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

// ─── PR mode utils ───────────────────────────────────────────────────────────

function getBaseBranch(): string {
  try {
    const remote = execSync('git rev-parse --abbrev-ref origin/HEAD', { stdio: 'pipe' })
      .toString().trim();
    return remote.replace('origin/', '');
  } catch {}
  for (const b of ['develop', 'main', 'master']) {
    try { execSync(`git rev-parse --verify ${b}`, { stdio: 'pipe' }); return b; } catch {}
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

// ─── Banner + animation ───────────────────────────────────────────────────────

const fg = (r: number, g: number, b: number) => `\x1b[38;2;${r};${g};${b}m`;
const PURPLE: [number,number,number] = [125, 86, 244];
const PINK:   [number,number,number] = [255, 100, 180];

const gradient = (text: string, from: [number,number,number], to: [number,number,number]) =>
  text.split('').map((ch, i) => {
    const tv = text.length === 1 ? 0 : i / (text.length - 1);
    const rv = Math.round(from[0] + (to[0] - from[0]) * tv);
    const gv = Math.round(from[1] + (to[1] - from[1]) * tv);
    const bv = Math.round(from[2] + (to[2] - from[2]) * tv);
    return fg(rv, gv, bv) + ch;
  }).join('') + R;

function printBanner(lang: Lang, quokka: boolean) {
  const msg = t(lang);
  const Rb = '\x1b[0m', Bb = '\x1b[1m';

  if (!quokka) {
    const title = Bb + gradient('OJ Refactor', PURPLE, PINK) + Rb;
    const sub   = `${D}${msg.bannerSub}${R}`;
    console.log(`\n  ${title}  ${sub}\n`);
    return;
  }

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

  const titleLine  = '  ' + Bb + gradient('OJ Refactor', PURPLE, PINK) + Rb;
  const subLine    = '  ' + fg(...AQUA) + msg.bannerSub + Rb;
  const qLine1     = '  ' + fg(...TAN)   + Bb + '/\\ ___ /\\ ' + Rb
                   + '  ' + fg(...YELLOW) + Bb + msg.bannerTagline + Rb;
  const qLine2     = '  ' + fg(...TAN)   + Bb + '(  o\\_/o  )' + Rb;
  const qLine3     = '  ' + fg(...BROWN) + Bb + '(___~~~___)' + Rb;

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

async function withSimpleSpinner<T>(task: Promise<T>, dots: readonly [string, string, string]): Promise<T> {
  const DIM = '\x1b[2m', RST = '\x1b[0m';
  let frameIdx = 0;
  let done = false;

  process.stdout.write('\n');
  function render() {
    process.stdout.write(`\x1b[1A\x1b[2K  ${DIM}${dots[frameIdx % dots.length]}${RST}\n`);
    frameIdx++;
  }

  render();
  const interval = setInterval(() => { if (!done) render(); }, 300);

  try {
    const result = await task;
    done = true;
    clearInterval(interval);
    process.stdout.write('\x1b[1A\x1b[2K');
    return result;
  } catch (err) {
    done = true;
    clearInterval(interval);
    process.stdout.write('\x1b[1A\x1b[2K');
    throw err;
  }
}

async function withQuokkaAnimation<T>(task: Promise<T>, dots: readonly [string, string, string]): Promise<T> {
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

// ─── Summary box ─────────────────────────────────────────────────────────────

function printSummary(lang: Lang, applied: number, skipped: number, failed: number, elapsedMs: number) {
  const msg = t(lang);
  const SEP = `  ${D}${'─'.repeat(60)}${R}`;
  console.log(SEP);
  console.log(`  ${B}${msg.summaryHeader}${R}`);
  console.log(`  ${G}${msg.summaryApplied(applied)}${R}`);
  console.log(`  ${D}${msg.summarySkipped(skipped)}${R}`);
  if (failed > 0) console.log(`  ${R2}${msg.summaryFailed(failed)}${R}`);
  console.log(`  ${D}${msg.summaryTime(elapsedMs)}${R}`);
  console.log();
}

// ─── Core refactoring loop ────────────────────────────────────────────────────

type ApplyRecord = { filePath: string };

async function processFile(
  filePath: string,
  convention: ConventionContext,
  applied: ApplyRecord[],
  lang: Lang,
  addComments: boolean,
  quokka: boolean,
  feedbackReason?: string,
  autoApply = false
): Promise<'applied' | 'skipped' | 'failed'> {
  const msg = t(lang);
  const anyResult = detect(filePath);
  const nestingResult = detectNesting(filePath);
  const useNesting = anyResult.occurrences.length === 0 && nestingResult.occurrences.length > 0;

  if (anyResult.occurrences.length === 0 && nestingResult.occurrences.length === 0) {
    console.log(`  ${D}skip${R}  ${filePath}  ${D}— ${msg.noSmell}${R}`);
    return 'skipped';
  }

  const count = useNesting ? nestingResult.occurrences.length : anyResult.occurrences.length;
  const label = useNesting ? msg.nestingLabel(count) : msg.anyLabel(count);
  const fname = filePath.split('/').pop();
  const originalSource = useNesting ? nestingResult.sourceCode : anyResult.sourceCode;
  const catalog = useNesting ? 'guard-clauses' : 'replace-any';

  const { timing, rationale } = whenToTidy(catalog, count);
  const timingColor = timing === 'first' ? Y : D;

  console.log(`\n  ${B}◆  ${fname}${R}  ${D}·  ${label}${R}`);
  console.log(`  ${timingColor}Tidy ${timing.toUpperCase()}${R}  ${D}${rationale}${R}\n`);

  const animate = quokka ? withQuokkaAnimation : withSimpleSpinner;
  let option;
  try {
    option = await animate(
      useNesting
        ? generateNesting(nestingResult, lang, addComments, convention.rules || undefined, feedbackReason)
        : generateTidy(anyResult, lang, addComments, convention.rules || undefined, feedbackReason),
      msg.generatingDots
    );
  } catch (err) {
    console.error(`\n  ${R2}${msg.generateFailed}${R} ${(err as Error).message}\n`);
    return 'failed';
  }

  process.stdout.write(formatSingle(option, originalSource));

  if (!autoApply) {
    const { yes } = await prompts({
      type: 'toggle',
      name: 'yes',
      message: msg.confirmApply,
      initial: true,
      active: 'yes',
      inactive: 'no',
    }, { onCancel: () => process.exit(0) });

    if (!yes) {
      console.log(`  ${D}${msg.skipped}${R}\n`);
      return 'skipped';
    }
  }

  const result = apply(filePath, option);

  if (convention.parallel && convention.rules) {
    process.stdout.write(`  ${Y}${msg.validatingParallel}${R}`);
    const [tscResult, validation] = await Promise.all([
      tscCheckAsync(filePath),
      validateConvention(option.fullCode, convention.rules, lang),
    ]);
    process.stdout.write(`\r${' '.repeat(60)}\r`);

    if (!tscResult.ok) {
      rollback(filePath);
      console.log(`  ${R2}${msg.tscFailed}${R}\n`);
      console.error(tscResult.error);
      return 'failed';
    }

    if (!validation.pass) {
      rollback(filePath);
      console.log(`  ${Y}${msg.conventionMismatch}${R}  ${D}${validation.reason}${R}\n`);
      return processFile(filePath, convention, applied, lang, addComments, quokka, validation.reason, autoApply);
    }

    const bakName = result.filePath.split('/').pop();
    console.log(`  ${G}${msg.tscPassed}${R}  ${G}${msg.conventionPassed}${R}  ${D}·  ${msg.backup} ${bakName}.bak${R}\n`);
  } else {
    process.stdout.write(`  ${D}${msg.validating}${R}`);
    const check = await tscCheckAsync(filePath);
    process.stdout.write(`\r${' '.repeat(40)}\r`);

    if (!check.ok) {
      rollback(filePath);
      console.log(`  ${R2}${msg.tscFailed}${R}\n`);
      console.error(check.error);
      return 'failed';
    }

    const bakName = result.filePath.split('/').pop();
    console.log(`  ${G}${msg.tscPassed}${R}  ${D}·  ${msg.backup} ${bakName}.bak${R}\n`);
  }

  applied.push({ filePath: result.filePath });

  // Tidy First — 자동 커밋 제안 (작업자 A의 summary 소비)
  const commitMsg = buildCommitMessage(catalog, option.summary, filePath);
  console.log(`  ${D}Tidy First 커밋 메시지:${R}  ${commitMsg}`);
  const { doCommit } = await prompts({
    type: 'confirm',
    name: 'doCommit',
    message: '이 메시지로 자동 커밋할까요?',
    initial: false,
  }, { onCancel: () => process.exit(0) });

  if (doCommit) {
    const ok = commitRefactoring(filePath, commitMsg);
    console.log(ok
      ? `  ${G}✓  커밋 완료${R}\n`
      : `  ${R2}✗  커밋 실패 — 수동으로 커밋해주세요${R}\n`
    );
  }

  return 'applied';
}

// ─── PR mode ──────────────────────────────────────────────────────────────────

async function runPRMode(lang: Lang, addComments: boolean, quokka: boolean): Promise<void> {
  const msg = t(lang);
  const files = getChangedTsFiles();

  if (files.length === 0) {
    console.log(`\n  ${D}${msg.noTsFiles}${R}\n`);
    return;
  }

  console.log(`\n  ${B}${msg.prHeader}${R}  ${D}·  ${msg.prFiles(files.length)}${R}\n`);
  files.forEach((f, i) => console.log(`  ${D}${i + 1}.${R} ${f}`));

  // Tidy First — uncommitted 변경사항 사전 검사 (Section 16: Separate Tidying)
  process.stdout.write(`\n  ${D}▸ Tidy First 사전 검사 중 ...${R}`);
  const readiness = await analyzePRReadiness(process.cwd());
  process.stdout.write(`\r${' '.repeat(40)}\r`);
  if (!readiness.clean && readiness.recommendation) {
    console.log(`  ${Y}⚠  ${readiness.recommendation}${R}\n`);
  }

  const convention = await selectConvention(process.cwd(), lang);
  console.log(`\n  ${D}${msg.conventionLine} ${convention.label}${R}\n`);

  const { mode } = await prompts({
    type: 'select',
    name: 'mode',
    message: msg.applyMode,
    choices: [
      { title: msg.autoApplyChoice.title, description: msg.autoApplyChoice.description, value: 'auto' },
      { title: msg.confirmEachChoice.title, description: msg.confirmEachChoice.description, value: 'confirm' },
    ],
    hint: '↑↓  Enter',
  }, { onCancel: () => process.exit(0) });

  const autoApply = mode === 'auto';
  const applied: ApplyRecord[] = [];
  let failed = 0;
  const startTime = Date.now();

  for (let i = 0; i < files.length; i++) {
    console.log(`  ${D}${msg.fileProgress(i + 1, files.length, files[i])}${R}\n`);
    const outcome = await processFile(files[i], convention, applied, lang, addComments, quokka, undefined, autoApply);
    if (outcome === 'failed') failed++;
  }

  const skippedCount = files.length - applied.length - failed;
  printSummary(lang, applied.length, skippedCount, failed, Date.now() - startTime);

  if (failed > 0 && applied.length > 0) {
    const { revert } = await prompts({
      type: 'toggle',
      name: 'revert',
      message: msg.rollbackPrompt(applied.length),
      initial: false,
      active: 'yes',
      inactive: 'no',
    }, { onCancel: () => process.exit(0) });

    if (revert) {
      for (const { filePath } of applied) {
        const ok = rollback(filePath);
        console.log(ok
          ? `  ${G}${msg.reverted}${R} ${filePath}`
          : `  ${R2}${msg.noBackup}${R} ${filePath}`
        );
      }
      console.log();
    }
  }
}

// ─── Single file mode ─────────────────────────────────────────────────────────

async function runSingleFile(filePath: string, lang: Lang, addComments: boolean, quokka: boolean): Promise<void> {
  const msg = t(lang);
  const convention = await selectConvention(process.cwd(), lang);
  console.log(`\n  ${D}${msg.conventionLine} ${convention.label}${R}\n`);
  const applied: ApplyRecord[] = [];
  const startTime = Date.now();
  const outcome = await processFile(filePath, convention, applied, lang, addComments, quokka);
  const failed = outcome === 'failed' ? 1 : 0;
  const skipped = outcome === 'skipped' ? 1 : 0;
  printSummary(lang, applied.length, skipped, failed, Date.now() - startTime);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main() {
  const detectedLang = detectRepoLanguage(process.cwd());

  // Language selection — always defaults to English (index 0)
  // Detection result shown as hint only
  const langHint = detectedLang === 'ko' ? '↑↓  Enter   (Korean project detected)' : '↑↓  Enter';
  const { lang } = await prompts({
    type: 'select',
    name: 'lang',
    message: 'Language',
    choices: [
      { title: 'English', value: 'en' },
      { title: '한국어', value: 'ko' },
    ],
    initial: 0,
    hint: langHint,
  }, { onCancel: () => process.exit(0) }) as { lang: Lang };

  const args = process.argv.slice(2);
  const quokka = args.includes('--quokka');
  printBanner(lang, quokka);
  const msg = t(lang);

  // Comment option
  const { addComments } = await prompts({
    type: 'toggle',
    name: 'addComments',
    message: msg.commentsQuestion,
    initial: false,
    active: 'yes',
    inactive: 'no',
  }, { onCancel: () => process.exit(0) });

  const isPR    = args.includes('--pr');
  const filePath = args.find(a => !a.startsWith('--'));

  if (isPR) {
    await runPRMode(lang, addComments as boolean, quokka);
  } else if (filePath) {
    await runSingleFile(filePath, lang, addComments as boolean, quokka);
  } else {
    console.error(msg.usage);
    process.exit(1);
  }
}

main();

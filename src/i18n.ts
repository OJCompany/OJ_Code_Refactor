import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export type Lang = 'en' | 'ko';

const KO_CHAR = /[가-힯ᄀ-ᇿ㄰-㆏]/;

export function detectRepoLanguage(cwd: string): Lang {
  const check = (text: string) => KO_CHAR.test(text);

  for (const name of ['CONVENTIONS.md', 'README.md', 'README']) {
    const p = path.join(cwd, name);
    if (fs.existsSync(p)) {
      try {
        if (check(fs.readFileSync(p, 'utf-8').slice(0, 3000))) return 'ko';
        break;
      } catch {}
    }
  }

  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { description?: string };
      if (pkg.description && check(pkg.description)) return 'ko';
    } catch {}
  }

  try {
    const log = execSync('git log --oneline -10', { cwd, stdio: 'pipe' }).toString();
    if (check(log)) return 'ko';
  } catch {}

  return 'en';
}

export interface Messages {
  // banner
  bannerSub: string;
  bannerTagline: string;
  // processFile
  noSmell: string;
  anyLabel: (n: number) => string;
  nestingLabel: (n: number) => string;
  generatingDots: readonly [string, string, string];
  generateFailed: string;
  confirmApply: string;
  skipped: string;
  validating: string;
  validatingParallel: string;
  tscFailed: string;
  tscPassed: string;
  conventionMismatch: string;
  conventionPassed: string;
  backup: string;
  // PR mode
  noTsFiles: string;
  prHeader: string;
  prFiles: (n: number) => string;
  conventionLine: string;
  applyMode: string;
  autoApplyChoice: { title: string; description: string };
  confirmEachChoice: { title: string; description: string };
  fileProgress: (i: number, total: number, file: string) => string;
  // summary
  summaryHeader: string;
  summaryApplied: (n: number) => string;
  summarySkipped: (n: number) => string;
  summaryFailed: (n: number) => string;
  summaryTime: (ms: number) => string;
  // rollback
  rollbackPrompt: (n: number) => string;
  reverted: string;
  noBackup: string;
  // usage
  usage: string;
  // startup
  langQuestion: string;
  langEnChoice: string;
  langKoChoice: string;
  commentsQuestion: string;
  // generate
  tidyName: string;
  tidyTradeoff: string;
  guardName: string;
  guardTradeoff: string;
  anySummary: (n: number, strategy: string) => string;
  nestingSummary: (depth: number, strategy: string) => string;
  validationReplyFormat: string;
  maxRetryReached: string;
  // convention
  conventionHeader: string;
  conventionChoices: readonly [{ title: string; description: string }, { title: string; description: string }];
  languageHeader: string;
  styleHeader: (lang: string) => string;
  conventionLabels: {
    auto: string;
    autoWithOverride: string;
    overrideOnly: string;
    default: string;
  };
}

const en: Messages = {
  bannerSub: 'TypeScript Refactoring Tool',
  bannerTagline: 'Clean code · powered by Quokka',
  noSmell: 'no issues detected',
  anyLabel: (n) => `any type · ${n} occurrence${n === 1 ? '' : 's'}`,
  nestingLabel: (n) => `deep nesting · ${n} block${n === 1 ? '' : 's'}`,
  generatingDots: ['▸  Generating .  ', '▸  Generating .. ', '▸  Generating ...'],
  generateFailed: '✗  Generation failed:',
  confirmApply: 'Apply this change?',
  skipped: 'skipped',
  validating: '▸  Running tsc ...',
  validatingParallel: '▸  Validating (tsc + convention) ...',
  tscFailed: '✗  tsc failed — original restored',
  tscPassed: '✓  tsc passed',
  conventionMismatch: '↻  Convention mismatch — regenerating with feedback',
  conventionPassed: '✓  Convention passed',
  backup: 'backup:',
  noTsFiles: '◆  No changed TypeScript files found.',
  prHeader: '◆  PR Mode',
  prFiles: (n) => `${n} file${n === 1 ? '' : 's'} changed`,
  conventionLine: 'Convention:',
  applyMode: 'Apply mode',
  autoApplyChoice: { title: 'Auto-apply all', description: 'Refactor all files without confirmation' },
  confirmEachChoice: { title: 'Confirm per file', description: 'Review each file before applying' },
  fileProgress: (i, total, file) => `── File ${i}/${total}  ${file}`,
  summaryHeader: '◆  Refactoring Complete',
  summaryApplied: (n) => `Applied  ${n}`,
  summarySkipped: (n) => `Skipped  ${n}`,
  summaryFailed: (n) => `Failed   ${n}`,
  summaryTime: (ms) => `Duration ${(ms / 1000).toFixed(1)}s`,
  rollbackPrompt: (n) => `Revert the ${n} applied file${n === 1 ? '' : 's'} as well?`,
  reverted: '↩  Reverted:',
  noBackup: '✗  No backup:',
  usage: 'Usage:\n  node dist/index.js <file>\n  node dist/index.js --pr',
  langQuestion: 'Language',
  langEnChoice: 'English',
  langKoChoice: '한국어',
  commentsQuestion: 'Add inline comments to refactored lines?',
  tidyName: 'Tidy Refactoring',
  tidyTradeoff: 'Preserves existing logic. Replaces any with the most specific type.',
  guardName: 'Guard Clauses (Early Return)',
  guardTradeoff: 'Significantly improves readability by eliminating nesting. Adds multiple return points.',
  anySummary: (n, s) => `Replace ${n} 'any' occurrence${n === 1 ? '' : 's'} using ${s}`,
  nestingSummary: (depth, s) => `Refactor nesting depth ${depth} using ${s}`,
  validationReplyFormat: 'Reply with ONLY one of these two formats (no other text):\nPASS\nFAIL: [reason in one sentence]',
  maxRetryReached: 'Convention check failed after 1 retry — skipping file.',
  conventionHeader: '◆  Code Convention',
  conventionChoices: [
    { title: 'Auto-detect project conventions', description: 'Reads .eslintrc, tsconfig, and other config files' },
    { title: 'Enterprise standard', description: 'Choose from Airbnb, Google, or XO style guides' },
  ],
  languageHeader: '◆  Language',
  styleHeader: (lang) => `◆  ${lang} Style`,
  conventionLabels: {
    auto: 'Project conventions (auto-detected)',
    autoWithOverride: 'Project conventions + CONVENTIONS.md',
    overrideOnly: 'CONVENTIONS.md',
    default: 'Default (none)',
  },
};

const ko: Messages = {
  bannerSub: 'TypeScript 리팩토링 도구',
  bannerTagline: '쿼카와 함께하는 클린코드',
  noSmell: '스멜 없음',
  anyLabel: (n) => `any 타입 ${n}건`,
  nestingLabel: (n) => `중첩 조건문 ${n}건`,
  generatingDots: ['▸  생성 중 .  ', '▸  생성 중 .. ', '▸  생성 중 ...'],
  generateFailed: '✗  generate 실패:',
  confirmApply: '이 변경사항을 적용할까요?',
  skipped: '건너뜀',
  validating: '▸  tsc 검증 중 ...',
  validatingParallel: '▸  병렬 검증 중 ...  (tsc + 컨벤션)',
  tscFailed: '✗  tsc 실패 — 원본 복구됨',
  tscPassed: '✓  tsc 통과',
  conventionMismatch: '↻  컨벤션 불일치 — 피드백 반영 후 재생성',
  conventionPassed: '✓  컨벤션 통과',
  backup: '백업:',
  noTsFiles: '◆  변경된 TypeScript 파일이 없습니다.',
  prHeader: '◆  PR 모드',
  prFiles: (n) => `변경 파일 ${n}개`,
  conventionLine: '컨벤션:',
  applyMode: '적용 방식',
  autoApplyChoice: { title: '전체 자동 적용', description: '확인 없이 모든 파일 리팩토링' },
  confirmEachChoice: { title: '파일별 확인', description: '파일마다 y/n 선택' },
  fileProgress: (i, total, file) => `── 파일 ${i}/${total}  ${file}`,
  summaryHeader: '◆  작업 완료',
  summaryApplied: (n) => `적용   ${n}`,
  summarySkipped: (n) => `건너뜀 ${n}`,
  summaryFailed: (n) => `실패   ${n}`,
  summaryTime: (ms) => `소요   ${(ms / 1000).toFixed(1)}s`,
  rollbackPrompt: (n) => `적용된 ${n}개 파일도 되돌릴까요?`,
  reverted: '↩  복구됨:',
  noBackup: '✗  백업 없음:',
  usage: '사용법:\n  node dist/index.js <파일경로>\n  node dist/index.js --pr',
  langQuestion: '언어',
  langEnChoice: 'English',
  langKoChoice: '한국어',
  commentsQuestion: '변경된 코드에 인라인 주석을 추가할까요?',
  tidyName: 'Tidy 리팩토링',
  tidyTradeoff: '기존 로직 유지. 최소 변경으로 any를 가장 구체적인 타입으로 교체.',
  guardName: 'Guard Clauses (조기 반환)',
  guardTradeoff: '중첩 제거로 가독성 대폭 향상. 단, 반환 포인트가 늘어남.',
  anySummary: (n, s) => `'any' ${n}개를 ${s} 방식으로 교체`,
  nestingSummary: (depth, s) => `중첩 깊이 ${depth}짜리 조건문을 ${s} 방식으로 리팩토링`,
  validationReplyFormat: 'Reply with ONLY one of these two formats (no other text):\nPASS\nFAIL: [reason in Korean, one sentence]',
  maxRetryReached: '컨벤션 재시도 1회 실패 — 파일 건너뜀.',
  conventionHeader: '◆  코드 컨벤션 설정',
  conventionChoices: [
    { title: '프로젝트 컨벤션 자동 감지', description: '.eslintrc, tsconfig 등 읽기' },
    { title: '기업 표준 컨벤션 사용', description: 'Airbnb, Google, XO 중 선택' },
  ],
  languageHeader: '◆  언어 선택',
  styleHeader: (lang) => `◆  ${lang} 기업 스타일 선택`,
  conventionLabels: {
    auto: '프로젝트 컨벤션 자동 감지',
    autoWithOverride: '프로젝트 컨벤션 + CONVENTIONS.md',
    overrideOnly: 'CONVENTIONS.md',
    default: '기본값',
  },
};

export const M: Record<Lang, Messages> = { en, ko };
export const t = (lang: Lang): Messages => M[lang];

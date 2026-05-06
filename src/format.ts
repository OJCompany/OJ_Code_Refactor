import { createTwoFilesPatch } from 'diff';
import type { RefactoringOption } from './types.js';

const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';
const RED    = '\x1b[31m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';

function colorDiff(patch: string): string {
  return patch
    .split('\n')
    .map((line) => {
      if (line.startsWith('+++') || line.startsWith('---')) return DIM + line + RESET;
      if (line.startsWith('@@'))  return CYAN + line + RESET;
      if (line.startsWith('+'))   return GREEN + line + RESET;
      if (line.startsWith('-'))   return RED + line + RESET;
      return line;
    })
    .join('\n');
}

function divider(char = '─', width = 60): string {
  return DIM + char.repeat(width) + RESET;
}

export function formatSingle(option: RefactoringOption, originalSource?: string): string {
  const beforeSrc = originalSource ?? option.before;
  const afterSrc  = option.fullCode || option.after;

  const patch = createTwoFilesPatch(
    'before',
    'after',
    beforeSrc.endsWith('\n') ? beforeSrc : beforeSrc + '\n',
    afterSrc.endsWith('\n')  ? afterSrc  : afterSrc  + '\n',
    '',
    '',
    { context: 3 }
  );

  const metricsLine =
    option.metricsBeforeComplexity !== undefined
      ? `${DIM}복잡도 ${option.metricsBeforeComplexity}→${option.metricsAfterComplexity}  ` +
        `라인 ${option.metricsBeforeLines}→${option.metricsAfterLines}  ` +
        `중첩 ${option.metricsBeforeDepth}→${option.metricsAfterDepth}${RESET}`
      : '';

  const lines = [
    divider('═'),
    `${BOLD}${YELLOW}Tidy 리팩토링 결과${RESET}`,
    `${BOLD}요약${RESET}  ${option.summary}`,
    `${BOLD}트레이드오프${RESET}  ${option.tradeoff}`,
    metricsLine,
    '',
    colorDiff(patch),
    divider('═'),
  ].filter((l) => l !== '');

  return '\n' + lines.join('\n') + '\n';
}


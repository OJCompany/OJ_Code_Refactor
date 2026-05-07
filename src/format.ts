import { createTwoFilesPatch } from 'diff';
import type { RefactoringOption } from './types.js';

const R  = '\x1b[0m';
const B  = '\x1b[1m';
const D  = '\x1b[2m';
const R2 = '\x1b[31m';
const G  = '\x1b[32m';
const Y  = '\x1b[33m';
const W  = '\x1b[97m';

const W60 = 60;

function line(char = '─'): string {
  return D + char.repeat(W60) + R;
}

function metricCell(label: string, before: number, after: number): string {
  const delta = after - before;
  const arrow = delta < 0 ? G + `↓${Math.abs(delta)}` + R
              : delta > 0 ? Y + `↑${delta}` + R
              : D + '━' + R;
  return `${D}${label}${R}  ${W}${before}${R} ${D}→${R} ${W}${after}${R} ${arrow}`;
}

function colorDiff(patch: string): string {
  return patch
    .split('\n')
    .slice(2)
    .map((l) => {
      if (l.startsWith('@@'))  return '\n' + D + l + R;
      if (l.startsWith('+'))   return G + l + R;
      if (l.startsWith('-'))   return R2 + l + R;
      return D + l + R;
    })
    .join('\n');
}

export function formatSingle(option: RefactoringOption, originalSource?: string): string {
  const beforeSrc = originalSource ?? option.before;
  const afterSrc  = option.fullCode || option.after;

  const patch = createTwoFilesPatch(
    'before', 'after',
    beforeSrc.endsWith('\n') ? beforeSrc : beforeSrc + '\n',
    afterSrc.endsWith('\n')  ? afterSrc  : afterSrc  + '\n',
    '', '', { context: 2 }
  );

  const hasMetrics = option.metricsBeforeComplexity !== undefined;

  const parts: string[] = [
    '',
    line('─'),
    `  ${B}${Y}${option.name}${R}  ${D}·${R}  ${option.summary}`,
  ];

  if (hasMetrics) {
    parts.push('');
    parts.push(
      '  ' + metricCell('복잡도', option.metricsBeforeComplexity!, option.metricsAfterComplexity!) +
      '   ' + metricCell('라인', option.metricsBeforeLines!, option.metricsAfterLines!) +
      '   ' + metricCell('중첩', option.metricsBeforeDepth!, option.metricsAfterDepth!)
    );
  }

  parts.push('');
  parts.push(line('─'));
  parts.push(colorDiff(patch));
  parts.push(line('─'));
  parts.push('');

  return parts.join('\n') + '\n';
}

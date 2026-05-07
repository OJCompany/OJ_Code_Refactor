import { createTwoFilesPatch } from 'diff';
import type { RefactoringOption } from './types.js';

const R  = '\x1b[0m';
const B  = '\x1b[1m';
const D  = '\x1b[2m';
const R2 = '\x1b[31m';
const G  = '\x1b[32m';
const Y  = '\x1b[33m';
const W  = '\x1b[97m';

const SEP = D + '─'.repeat(60) + R;

function delta(before: number, after: number): string {
  const d = after - before;
  if (d < 0) return G + `↓${Math.abs(d)}` + R;
  if (d > 0) return Y + `↑${d}` + R;
  return D + '─' + R;
}

function metric(label: string, before: number, after: number): string {
  return `${D}${label}${R} ${W}${before}→${after}${R} ${delta(before, after)}`;
}

function cleanDiff(patch: string): string {
  const lines = patch.split('\n').slice(4); // skip Index/===/---/+++ headers
  const out: string[] = [];

  for (const l of lines) {
    if (!l) continue;
    if (l.startsWith('@@'))  { out.push(''); out.push(D + '  ···' + R); continue; }
    if (l.startsWith('+'))   { out.push(G + l + R); continue; }
    if (l.startsWith('-'))   { out.push(R2 + l + R); continue; }
    out.push(D + l + R);
  }

  // trim leading blank/···
  while (out.length && (!out[0] || out[0] === D + '  ···' + R)) out.shift();

  return out.join('\n');
}

export function formatSingle(option: RefactoringOption, originalSource?: string): string {
  const beforeSrc = originalSource ?? option.before;
  const afterSrc  = option.fullCode || option.after;

  const patch = createTwoFilesPatch(
    'before', 'after',
    beforeSrc.endsWith('\n') ? beforeSrc : beforeSrc + '\n',
    afterSrc.endsWith('\n')  ? afterSrc  : afterSrc  + '\n',
    '', '', { context: 1 }
  );

  const hasMetrics = option.metricsBeforeComplexity !== undefined;

  const parts: string[] = [
    '',
    SEP,
    `  ${B}${Y}${option.name}${R}  ${D}·  ${option.summary}${R}`,
  ];

  if (hasMetrics) {
    parts.push(
      '  ' +
      metric('복잡도', option.metricsBeforeComplexity!, option.metricsAfterComplexity!) +
      '    ' +
      metric('라인', option.metricsBeforeLines!, option.metricsAfterLines!) +
      '    ' +
      metric('중첩', option.metricsBeforeDepth!, option.metricsAfterDepth!)
    );
  }

  parts.push(SEP);
  parts.push('');
  parts.push(cleanDiff(patch));
  parts.push('');
  parts.push(SEP);
  parts.push('');

  return parts.join('\n') + '\n';
}

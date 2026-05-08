import { diffLines } from 'diff';
import type { RefactoringOption } from './types.js';

const R  = '\x1b[0m';
const B  = '\x1b[1m';
const D  = '\x1b[2m';
const R2 = '\x1b[31m';
const G  = '\x1b[32m';
const Y  = '\x1b[33m';
const W  = '\x1b[97m';

type CellType = 'removed' | 'added' | 'context' | 'empty';
type Row = [left: string, leftType: CellType, right: string, rightType: CellType];

function termWidth(): number {
  return process.stdout.columns ?? 120;
}

function delta(before: number, after: number): string {
  const d = after - before;
  if (d < 0) return G + `↓${Math.abs(d)}` + R;
  if (d > 0) return Y + `↑${d}` + R;
  return D + '─' + R;
}

function metric(label: string, before: number, after: number): string {
  return `${D}${label}${R} ${W}${before}→${after}${R} ${delta(before, after)}`;
}

function splitLines(str: string): string[] {
  const lines = str.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function buildRows(beforeSrc: string, afterSrc: string): Row[] {
  const changes = diffLines(beforeSrc, afterSrc);
  const rows: Row[] = [];

  let i = 0;
  while (i < changes.length) {
    const change = changes[i];

    if (!change.removed && !change.added) {
      for (const l of splitLines(change.value)) {
        rows.push([l, 'context', l, 'context']);
      }
      i++;
      continue;
    }

    if (change.removed) {
      const removedLines = splitLines(change.value);
      const next = changes[i + 1];
      const addedLines = next?.added ? splitLines(next.value) : [];
      const maxLen = Math.max(removedLines.length, addedLines.length);

      for (let j = 0; j < maxLen; j++) {
        rows.push([
          removedLines[j] ?? '',
          j < removedLines.length ? 'removed' : 'empty',
          addedLines[j] ?? '',
          j < addedLines.length ? 'added' : 'empty',
        ]);
      }
      i += next?.added ? 2 : 1;
      continue;
    }

    // pure added (no preceding removed)
    for (const l of splitLines(change.value)) {
      rows.push(['', 'empty', l, 'added']);
    }
    i++;
  }

  return rows;
}

function cell(text: string, type: CellType, width: number): string {
  const INDENT = '  ';
  const contentWidth = width - INDENT.length;
  const truncated =
    text.length > contentWidth
      ? text.substring(0, contentWidth - 1) + '…'
      : text + ' '.repeat(contentWidth - text.length);
  const padded = INDENT + truncated;

  switch (type) {
    case 'removed': return R2 + padded + R;
    case 'added':   return G  + padded + R;
    case 'context': return D  + padded + R;
    case 'empty':   return ' '.repeat(width);
  }
}

function pad(text: string, width: number): string {
  if (text.length >= width) return text.substring(0, width);
  return text + ' '.repeat(width - text.length);
}

function renderSideBySide(rows: Row[], colWidth: number): string {
  const hLine  = D + '─'.repeat(colWidth) + '┼' + '─'.repeat(colWidth) + R;
  const header = D + pad('  Before', colWidth) + '│' + pad('  After', colWidth) + R;

  const out: string[] = [header, hLine];

  for (const [left, lt, right, rt] of rows) {
    out.push(cell(left, lt, colWidth) + D + '│' + R + cell(right, rt, colWidth));
  }

  return out.join('\n');
}

export function formatSingle(option: RefactoringOption, originalSource?: string): string {
  const W2 = termWidth();
  const colWidth = Math.max(40, Math.floor((W2 - 1) / 2));
  const SEP = D + '─'.repeat(W2) + R;

  const beforeSrc = originalSource ?? option.before;
  const afterSrc  = option.fullCode || option.after;
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
  parts.push(renderSideBySide(buildRows(beforeSrc, afterSrc), colWidth));
  parts.push('');
  parts.push(SEP);
  parts.push('');

  return parts.join('\n') + '\n';
}

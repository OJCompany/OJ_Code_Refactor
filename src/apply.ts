import fs from 'fs';
import path from 'path';
import type { ApplyResult, RefactoringOption } from './types.js';

export function apply(filePath: string, option: RefactoringOption): ApplyResult {
  const bakPath = `${filePath}.${Date.now()}.bak`;
  fs.copyFileSync(filePath, bakPath);
  fs.writeFileSync(filePath, option.fullCode, 'utf-8');

  return {
    success: true,
    filePath,
    chosenOption: option,
  };
}

export function rollback(filePath: string): boolean {
  const absPath = path.resolve(filePath);
  const dir = path.dirname(absPath);
  const base = path.basename(absPath);

  const bakFiles = fs.readdirSync(dir)
    .filter((f) => f.startsWith(base + '.') && f.endsWith('.bak'))
    .sort()
    .reverse();

  if (bakFiles.length === 0) return false;

  const latest = path.join(dir, bakFiles[0]);
  fs.copyFileSync(latest, absPath);
  fs.unlinkSync(latest);

  return true;
}

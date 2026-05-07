import fs from 'fs';
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
  const dir = filePath.substring(0, filePath.lastIndexOf('/') + 1) || '.';
  const base = filePath.substring(filePath.lastIndexOf('/') + 1);

  const bakFiles = fs.readdirSync(dir)
    .filter((f) => f.startsWith(base + '.') && f.endsWith('.bak'))
    .sort()
    .reverse();

  if (bakFiles.length === 0) return false;

  const latest = `${dir}${bakFiles[0]}`;
  fs.copyFileSync(latest, filePath);
  fs.unlinkSync(latest);

  return true;
}

import fs from 'fs';
import type { ApplyResult, RefactoringOption } from './types.js';

export function apply(filePath: string, option: RefactoringOption): ApplyResult {
  fs.copyFileSync(filePath, `${filePath}.bak`);
  fs.writeFileSync(filePath, option.fullCode, 'utf-8');

  return {
    success: true,
    filePath,
    chosenOption: option,
  };
}

export function rollback(filePath: string): boolean {
  const bakPath = `${filePath}.bak`;

  if (!fs.existsSync(bakPath)) return false;

  fs.copyFileSync(bakPath, filePath);
  fs.unlinkSync(bakPath);

  return true;
}

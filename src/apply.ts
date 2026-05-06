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

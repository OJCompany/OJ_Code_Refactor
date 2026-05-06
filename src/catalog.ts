import { detect } from './detect.js';
import { detectNesting } from './detectNesting.js';
import { generate, generateGuardClauses } from './generate.js';
import { apply } from './apply.js';
import type { RefactoringOption } from './types.js';

export interface AnalyzeResult {
  catalog: 'replace-any' | 'guard-clauses';
  filePath: string;
  issueCount: number;
  options: RefactoringOption[];
}

export async function analyze(filePath: string): Promise<AnalyzeResult> {
  const anyResult = detect(filePath);
  const nestingResult = detectNesting(filePath);

  if (anyResult.occurrences.length === 0 && nestingResult.occurrences.length === 0) {
    throw new Error('리팩토링할 코드 스멜이 감지되지 않았습니다.');
  }

  if (anyResult.occurrences.length >= nestingResult.occurrences.length) {
    const options = await generate(anyResult);
    return {
      catalog: 'replace-any',
      filePath,
      issueCount: anyResult.occurrences.length,
      options,
    };
  } else {
    const options = await generateGuardClauses(nestingResult);
    return {
      catalog: 'guard-clauses',
      filePath,
      issueCount: nestingResult.occurrences.length,
      options,
    };
  }
}

export { apply };

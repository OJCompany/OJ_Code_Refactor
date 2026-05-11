import { execSync } from 'child_process';

type Catalog = 'replace-any' | 'guard-clauses';

// Tidy First Section 16 — 커밋 타입을 tidy로 명시
const CATALOG_SCOPE: Record<Catalog, string> = {
  'replace-any':   'any-types',
  'guard-clauses': 'guard-clauses',
};

export function buildCommitMessage(
  catalog: Catalog,
  summary: string,
  filePath: string
): string {
  const scope = CATALOG_SCOPE[catalog];
  const fname = filePath.split('/').pop() ?? filePath;
  // tidy(any-types): 'any' 15개를 Tidy 리팩토링 방식으로 교체 [convention-test.ts]
  return `tidy(${scope}): ${summary} [${fname}]`;
}

export function commitRefactoring(filePath: string, message: string): boolean {
  try {
    execSync(`git add "${filePath}"`, { stdio: 'pipe' });
    execSync(`git commit -m ${JSON.stringify(message)}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

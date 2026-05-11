import { execSync } from 'child_process';
import { spawn } from 'child_process';

// Kent Beck "Tidy First?" — key sections embedded as LLM context
const TIDY_FIRST_REFERENCE = `
## Tidy First? (Kent Beck) — Reference

### What counts as a STRUCTURAL tidying (tidy):
1. Guard Clauses — replace nested ifs with early returns
2. Dead code — delete unused code
3. Normalize symmetries — unify inconsistent patterns
4. New Interface, Old Implementation — wrap hard-to-use interfaces
5. Reading Order — reorder code for readability
6. Cohesion Order — move coupled elements together
7. Move Declaration and Initialization Together
8. Explaining Variables — extract subexpressions into named variables
9. Explaining Constants — replace magic numbers/strings with named constants
10. Explicit Parameters — make implicit params explicit
11. Chunk Statements — add blank lines between logical sections
12. Extract Helper — extract a block into a named helper function
13. One Pile — merge over-split code before re-extracting
14. Explaining Comments — add comments for non-obvious WHY
15. Delete Redundant Comments — remove comments that restate the code
16. Type annotations — replace 'any' with specific types (TypeScript)

### What counts as BEHAVIORAL change (behavior):
- New logic or conditions added
- Changed return values or side effects
- Added/removed statements that affect runtime output
- Changed function signatures that affect callers

### Section 16: Separate Tidying
Tidying should go into their own separate PRs. Behavior and structure changes should be in separate PRs.

### Section 21: First, After, Later, Never
- FIRST: tidying will pay off immediately (improved comprehension or cheaper behavior changes), you know what to tidy and how
- AFTER: waiting until next time will be more expensive; tidy after the behavior change
- LATER: big batch of tidying without immediate payoff; tidy in little batches eventually
- NEVER: you are never changing this code again, or nothing to learn by improving the design
`.trim();

export type ChangeClass = 'tidy' | 'behavior' | 'mixed' | 'unknown';

export interface FileClassification {
  filePath: string;
  classification: ChangeClass;
  reason: string;
}

export interface PRReadinessReport {
  clean: boolean;
  structural: FileClassification[];
  behavioral: FileClassification[];
  mixed: FileClassification[];
  recommendation: string;
}

// 우리 툴이 생성한 리팩토링은 항상 structural (Tidy First 정의상 tidying)
export function classifyRefactoring(catalog: 'replace-any' | 'guard-clauses'): 'tidy' {
  return 'tidy';
}

// Tidy First Section 21 — First / After / Later / Never
export function whenToTidy(
  catalog: 'replace-any' | 'guard-clauses',
  issueCount: number
): { timing: 'first' | 'after' | 'later' | 'never'; rationale: string } {
  if (issueCount === 0) {
    return {
      timing: 'never',
      rationale: '감지된 이슈가 없습니다. 정리할 필요가 없습니다 (Section 21: Never).',
    };
  }
  if (catalog === 'replace-any' && issueCount >= 10) {
    return {
      timing: 'first',
      rationale: `any ${issueCount}개는 동작 변경 전 먼저 제거해야 타입 안정성을 확보할 수 있습니다 (Section 21: First).`,
    };
  }
  if (catalog === 'guard-clauses' && issueCount >= 3) {
    return {
      timing: 'first',
      rationale: `중첩 깊이가 높은 조건문은 동작 변경 전 먼저 평탄화해야 수정 범위가 명확해집니다 (Section 21: First).`,
    };
  }
  if (issueCount >= 2) {
    return {
      timing: 'after',
      rationale: `동작 변경 후 별도 커밋으로 정리하는 것이 적절합니다 (Section 21: After).`,
    };
  }
  return {
    timing: 'later',
    rationale: `소규모 이슈 ${issueCount}건은 즉각적인 정리 효과가 크지 않습니다. 나중에 일괄 처리를 권장합니다 (Section 21: Later).`,
  };
}

function callClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['-p', '--output-format', 'text'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(stderr.trim() || `claude 종료 코드: ${code}`));
      else resolve(stdout.trim());
    });
    proc.on('error', reject);
    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

// git diff로 파일별 변경 분류 (LLM 기반)
async function classifyFileDiff(filePath: string, diff: string): Promise<FileClassification> {
  const prompt = `You are a Tidy First (Kent Beck) expert. Classify the following git diff for file "${filePath}".

${TIDY_FIRST_REFERENCE}

Classify the diff below as one of:
- TIDY: only structural changes from the tidying list above — NO runtime behavior change
- BEHAVIOR: only behavioral changes (new logic, changed conditions, changed outputs)
- MIXED: both structural and behavioral changes in the same diff

Diff:
${diff.slice(0, 4000)}

Reply with ONLY one of these formats (no other text):
TIDY: [one-line reason in Korean]
BEHAVIOR: [one-line reason in Korean]
MIXED: [one-line reason in Korean]`;

  try {
    const raw = await callClaude(prompt);
    const text = raw.trim();
    if (text.startsWith('TIDY')) {
      return { filePath, classification: 'tidy', reason: text.replace(/^TIDY:\s*/, '') };
    }
    if (text.startsWith('BEHAVIOR')) {
      return { filePath, classification: 'behavior', reason: text.replace(/^BEHAVIOR:\s*/, '') };
    }
    if (text.startsWith('MIXED')) {
      return { filePath, classification: 'mixed', reason: text.replace(/^MIXED:\s*/, '') };
    }
    return { filePath, classification: 'unknown', reason: '분류 불가' };
  } catch {
    return { filePath, classification: 'unknown', reason: '분석 실패' };
  }
}

// PR 시작 전 uncommitted 변경사항 Tidy First 관점으로 분석
export async function analyzePRReadiness(cwd: string): Promise<PRReadinessReport> {
  let changedFiles: string[] = [];
  try {
    const out = execSync('git diff --name-only HEAD', { cwd, stdio: 'pipe' }).toString().trim();
    const staged = execSync('git diff --cached --name-only', { cwd, stdio: 'pipe' }).toString().trim();
    const all = [...new Set([...out.split('\n'), ...staged.split('\n')])].filter(f => f.endsWith('.ts') && f.trim());
    changedFiles = all;
  } catch {
    return { clean: true, structural: [], behavioral: [], mixed: [], recommendation: '' };
  }

  if (changedFiles.length === 0) {
    return { clean: true, structural: [], behavioral: [], mixed: [], recommendation: '' };
  }

  const results: FileClassification[] = await Promise.all(
    changedFiles.map(async (file) => {
      try {
        const diff = execSync(`git diff HEAD -- "${file}"`, { cwd, stdio: 'pipe' }).toString();
        const stagedDiff = execSync(`git diff --cached -- "${file}"`, { cwd, stdio: 'pipe' }).toString();
        return classifyFileDiff(file, diff || stagedDiff);
      } catch {
        return { filePath: file, classification: 'unknown' as ChangeClass, reason: '분석 실패' };
      }
    })
  );

  const structural = results.filter(r => r.classification === 'tidy');
  const behavioral = results.filter(r => r.classification === 'behavior');
  const mixed = results.filter(r => r.classification === 'mixed');
  const hasMixed = mixed.length > 0 || (structural.length > 0 && behavioral.length > 0);

  let recommendation = '';
  if (mixed.length > 0) {
    recommendation = `[Tidy First] ${mixed.map(f => f.filePath).join(', ')} 파일에 구조 변경과 동작 변경이 혼재합니다. 분리 커밋을 권장합니다 (Section 16: Separate Tidying).`;
  } else if (structural.length > 0 && behavioral.length > 0) {
    recommendation = `[Tidy First] 구조 변경(${structural.length}개)과 동작 변경(${behavioral.length}개)이 같은 PR에 섞여 있습니다. 구조 변경을 먼저 별도 PR로 분리하는 것을 권장합니다 (Section 16).`;
  }

  return { clean: !hasMixed, structural, behavioral, mixed, recommendation };
}

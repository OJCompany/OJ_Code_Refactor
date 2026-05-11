import { execSync } from 'child_process';
import { spawn } from 'child_process';

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
): { timing: 'first' | 'after' | 'later'; rationale: string } {
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
  return {
    timing: 'after',
    rationale: `소규모 정리는 동작 변경 후 별도 커밋으로 분리해도 충분합니다 (Section 21: After).`,
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

Tidy First definitions:
- STRUCTURAL (tidy): type annotations, guard clauses, rename, reorder, extract helper, whitespace, comments — NO runtime behavior change
- BEHAVIORAL (behavior): new logic, changed conditions, added/removed statements that affect runtime output
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

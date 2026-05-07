// 두 Claude 세션의 공유 계약서 — 이 파일 기준으로 양쪽 코드가 붙음

export type AnyContext = 'parameter' | 'return' | 'variable' | 'generic' | 'assertion';

export interface AnyOccurrence {
  line: number;
  column: number;
  snippet: string;       // any가 포함된 코드 한 줄
  context: AnyContext;   // any가 어디에 쓰였는지
}

export interface DetectResult {
  filePath: string;
  occurrences: AnyOccurrence[];
  sourceCode: string;    // 파일 전체 소스 (LLM 프롬프트용)
}

export interface RefactoringOption {
  id: 1;
  name: string;          // "unknown으로 교체" 등
  summary: string;       // 한 줄 설명
  tradeoff: string;      // 장단점 한 줄
  before: string;        // 변경 전 코드 스니펫
  after: string;         // 변경 후 코드 스니펫
  fullCode: string;      // 파일 전체 (apply.ts에서 씀)
  metricsBeforeComplexity?: number;
  metricsAfterComplexity?: number;
  metricsBeforeLines?: number;
  metricsAfterLines?: number;
  metricsBeforeDepth?: number;
  metricsAfterDepth?: number;
}

export interface ApplyResult {
  success: boolean;
  filePath: string;
  chosenOption: RefactoringOption;
}

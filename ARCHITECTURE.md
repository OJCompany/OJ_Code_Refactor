# ARCHITECTURE — Refactor Agent

> 5패키지 모노레포 구조, 어댑터 인터페이스, 데이터 흐름, 상태 머신, 카탈로그 알고리즘.

> **참조**: [PROJECT_PLAN.md](PROJECT_PLAN.md) (정체성/결정), [PRD.md](PRD.md) (요구사항).

---

## 1. 패키지 구조

### 1.1 5패키지 개요

| 패키지 | 책임 | 외부 의존성 |
|---|---|---|
| `@oj/refactor-engine` | AST 분석, 스멜 감지, 카탈로그, 옵션 생성, AST 검증 | tree-sitter, typescript |
| `@oj/refactor-workflow` | 상태 머신, 진행 단계 관리 | engine |
| `@oj/refactor-tui` | pi-tui 기반 화면들 | engine, workflow, pi-tui |
| `@oj/refactor-adapters` | PR/Linter/TestRunner 어댑터 구현 | engine, gh CLI 등 |
| `@oj/refactor-app` | 진입점, pi-agent-core 통합, DI 조립 | 모든 패키지, pi-ai, pi-agent-core |

### 1.2 의존 그래프

```
                  ┌──────────────────────┐
                  │  @oj/refactor-app    │
                  │  (composition root)  │
                  └─┬──┬──┬──┬───────────┘
                    │  │  │  │
        ┌───────────┘  │  │  └────────────┐
        │              │  │               │
        ↓              ↓  ↓               ↓
   ┌────────┐  ┌──────────┐  ┌────────────────┐
   │workflow│  │   tui    │  │   adapters     │
   └────┬───┘  └────┬─────┘  └────┬───────────┘
        │           │             │
        └─────┬─────┴─────────────┘
              ↓
        ┌──────────────┐
        │    engine    │   ← 다른 패키지 의존 0
        └──────────────┘
```

**규칙**:
- 화살표는 *"의존한다"* 방향
- 순환 X
- `engine`은 가장 순수 → 단위 테스트 용이
- 새 어댑터 추가는 `adapters`만, 새 화면 추가는 `tui`만, 새 카탈로그 룰은 `engine/catalog/`만

### 1.3 패키지별 디렉토리 레이아웃

```
@oj/refactor-engine
├── src/
│   ├── ast/
│   │   ├── parser.ts                     ← tree-sitter 래핑
│   │   └── traverse.ts                   ← AST 순회 유틸
│   ├── smell-detection/
│   │   ├── types.ts                      ← Smell 타입 정의
│   │   ├── detectors/
│   │   │   ├── long-method.ts
│   │   │   ├── deep-nesting.ts
│   │   │   ├── type-any.ts
│   │   │   ├── promise-chain.ts
│   │   │   └── imperative-loop.ts
│   │   └── metrics/
│   │       ├── cyclomatic.ts
│   │       ├── cognitive.ts
│   │       └── lines.ts
│   ├── catalog/
│   │   ├── types.ts                      ← RefactoringRule 인터페이스
│   │   ├── registry.ts                   ← 룰 등록/조회
│   │   └── rules/                        ← 5개 룰 (TS 한정)
│   │       ├── guard-clauses.ts
│   │       ├── replace-any.ts
│   │       ├── loop-pipeline.ts
│   │       ├── async-await.ts
│   │       └── extract-function.ts
│   ├── option-generator/
│   │   ├── tradeoff-axes.ts              ← 5개 축 정의
│   │   ├── selector.ts                   ← 3개 다른 축 선정 알고리즘
│   │   └── card.ts                       ← 옵션 카드 생성
│   ├── llm-bridge/
│   │   ├── prompt-builder.ts             ← 룰 + 코드 → 프롬프트
│   │   └── apply-rule.ts                 ← pi-ai 통한 호출
│   ├── transformer/
│   │   ├── ast-diff.ts                   ← LLM 출력 검증
│   │   └── apply.ts                      ← 파일에 변경 적용
│   ├── validator/
│   │   ├── type-check.ts                 ← tsc programmatic
│   │   └── lint-check.ts                 ← LinterAdapter 호출
│   ├── adapters/                         ← 인터페이스만, 구현은 -adapters에
│   │   ├── pr.ts
│   │   ├── linter.ts
│   │   ├── test-runner.ts
│   │   └── ui.ts                         ← WorkflowUI 인터페이스
│   ├── domain/
│   │   ├── refactoring-option.ts
│   │   ├── smell.ts
│   │   └── pr.ts
│   ├── learning/
│   │   └── hook.ts                       ← v1.0 빈 함수 (ADR-009)
│   └── index.ts                          ← public exports

@oj/refactor-workflow
├── src/
│   ├── state-machine.ts                  ← 메인 SM (XState 또는 자체)
│   ├── states.ts                         ← 상태 enum
│   ├── events.ts                         ← 이벤트 타입
│   ├── transitions.ts                    ← 전이 규칙
│   └── index.ts

@oj/refactor-tui
├── src/
│   ├── pi-tui-ui.ts                      ← class PiTuiUI implements WorkflowUI
│   ├── screens/
│   │   ├── detect-screen.ts
│   │   ├── options-screen.ts
│   │   ├── apply-screen.ts
│   │   └── pr-screen.ts
│   ├── components/
│   │   ├── option-card.ts                ← pi-tui Component
│   │   ├── diff-view.ts
│   │   ├── progress-bar.ts
│   │   └── confirm-dialog.ts
│   ├── theme.ts
│   └── index.ts

@oj/refactor-adapters
├── src/
│   ├── pr/
│   │   ├── github.ts                     ← class GitHubAdapter
│   │   ├── noop.ts                       ← gh 미설치 fallback
│   │   ├── router.ts                     ← 4단 라우팅
│   │   └── index.ts
│   ├── linter/
│   │   ├── eslint.ts
│   │   ├── biome.ts
│   │   └── index.ts
│   ├── test-runner/
│   │   ├── npm-test.ts                   ← v1.0 인터페이스만, 미사용
│   │   └── index.ts
│   └── index.ts

@oj/refactor-app
├── src/
│   ├── index.ts                          ← 진입점 (CLI 바이너리)
│   ├── compose.ts                        ← DI: 모든 의존성 조립
│   ├── agent-runtime.ts                  ← pi-agent-core 통합
│   └── commands/
│       └── review.ts                     ← /review 커맨드
└── package.json (bin field로 CLI 등록)
```

---

## 2. 어댑터 인터페이스 4종

`engine/adapters/`에 인터페이스만 정의. 구현은 `adapters` 패키지.

### 2.1 `PRAdapter`

```typescript
export interface PRAdapter {
  readonly name: "github" | "gitlab" | "bitbucket" | "noop";
  isAvailable(): Promise<boolean>;
  createPR(input: CreatePRInput): Promise<CreatePRResult>;
}

export interface CreatePRInput {
  branch: string;
  baseBranch: string;          // 보통 "main"
  title: string;
  body: string;
  dryRun: boolean;
}

export interface CreatePRResult {
  preview: string;             // dry-run 출력 (사람 읽음)
  url?: string;                // 실제 생성 시
}
```

구현체: `GitHubAdapter` (gh CLI), `NoopAdapter` (gh 미설치 fallback). `GitLab`/`Bitbucket`은 인터페이스만 준수해 추가.

### 2.2 `LinterAdapter`

```typescript
export interface LinterAdapter {
  readonly name: string;       // "eslint" | "biome" | ...
  readonly language: string;   // "typescript" | "javascript"
  isAvailable(cwd: string): Promise<boolean>;
  detect(cwd: string): Promise<LinterDetection | null>;
  runFix(opts: { targetPath: string }): Promise<LinterRunResult>;
  runCheck(opts: { targetPath: string }): Promise<LinterRunResult>;
}

export interface LinterDetection {
  configPath: string;          // .eslintrc.json
  command: string;             // "npx eslint" 등 해석된 명령
}

export interface LinterRunResult {
  violations: number;
  fixed: number;
  raw: string;                 // stdout
  exitCode: number;
}
```

### 2.3 `TestRunnerAdapter` (v1.0 인터페이스만)

```typescript
export interface TestRunnerAdapter {
  readonly name: "npm-test" | "vitest" | "jest" | ...;
  isAvailable(cwd: string): Promise<boolean>;
  detect(cwd: string): Promise<TestRunnerDetection | null>;
  run(opts: { cwd: string; pattern?: string }): Promise<TestRunResult>;
}

export interface TestRunnerDetection {
  command: string;
  framework: string;
}

export interface TestRunResult {
  passed: number;
  failed: number;
  raw: string;
  exitCode: number;
}
```

v1.0에서 워크플로우는 호출 X, 인터페이스만 정의.

### 2.4 `WorkflowUI` (프레젠테이션 어댑터)

```typescript
export interface WorkflowUI {
  showProgress(label: string): void;
  hideProgress(): void;

  showSmellsDetected(smells: Smell[]): Promise<void>;
  presentOptions(options: RefactoringOption[]): Promise<string | "skip">;
  showDiff(before: string, after: string): Promise<void>;

  confirmApply(): Promise<boolean>;
  confirmSignatureChange(detail: string): Promise<boolean>;
  confirmPR(preview: string): Promise<boolean>;

  showSuccess(message: string): void;
  showError(error: Error): void;
}
```

구현체: `PiTuiUI` (v1.0). 미래에 `CliUI`, `WebUI` 추가 가능.

---

## 3. 상태 머신

### 3.1 상태 다이어그램

```
[Idle]
   ↓ start
[ParsingAST]
   ↓ ok                                 ↓ parse-failed
[DetectingSmells]                       [Error]
   ↓ smells-found
[GeneratingOptions]  ────── (LLM N회 호출, 병렬)
   ↓ 3 options ready
[AwaitingChoice]
   ↓ A/B/C 선택              ↓ skip
[ValidatingChoice]            [Done]
   ↓ AST diff ok        ↓ signature changed
   │                    ↓
   │              [AwaitingSigConfirm]
   │                    ↓ yes      ↓ no
   ↓                                   [Done]
[BackingUp]   (git stash push)
   ↓ ok
[ApplyingChange]
   ↓ ok                                 ↓ apply-failed
[ValidatingResult]                      [RollingBack]
   ↓ lint+type pass                       ↓
   │                                   [Error]
   ↓                       ↓ validation-failed
[PreparingPR]              [RollingBack]
   ↓ adapter resolved        ↓
[AwaitingPRConfirm]        [Error]
   ↓ yes      ↓ no
[CreatingPR]   [Done] (변경 유지, PR만 생략)
   ↓ ok       ↓ pr-failed
[Done]         [Error] (변경 유지, PR만 실패)
```

### 3.2 이벤트

```typescript
type Event =
  | { type: "start"; targetPath: string }
  | { type: "parse-failed"; reason: string }
  | { type: "smells-found"; smells: Smell[] }
  | { type: "options-ready"; options: RefactoringOption[] }
  | { type: "user-selected"; choice: string | "skip" }
  | { type: "signature-changed"; detail: string }
  | { type: "user-confirmed-sig"; ok: boolean }
  | { type: "apply-failed"; reason: string }
  | { type: "validation-failed"; details: string }
  | { type: "user-confirmed-pr"; ok: boolean }
  | { type: "pr-failed"; reason: string }
  | { type: "done" }
  | { type: "error"; cause: Error };
```

### 3.3 사용자 확인 지점

상태 머신에서 *사용자 입력 대기*는 명시적으로 분리됨 (테스트 가능성). 모든 *대기* 상태는 `Awaiting*`으로 시작:

- `AwaitingChoice` — 옵션 선택
- `AwaitingSigConfirm` — 시그니처 변경 확인
- `AwaitingPRConfirm` — PR 생성 확인

`WorkflowUI`가 사용자 입력을 받아 이벤트로 머신에 발사.

---

## 4. 데이터 흐름 (한 번 review 실행)

```
사용자: /review src/auth.ts
        ↓
[refactor-app] commands/review.ts
   compose.ts에서 모든 의존성 주입 받아 workflow.run() 호출
        ↓
[refactor-workflow] state-machine.ts
   상태: Idle → ParsingAST
   ↓ engine/ast/parser.ts 호출
        ↓
[refactor-engine] tree-sitter로 AST 생성
        ↓
[refactor-workflow] 상태: DetectingSmells
   ↓ engine/smell-detection/* 모든 디텍터 실행
        ↓
[refactor-engine] long-method, type-any 발견
        ↓
[refactor-workflow] 상태: GeneratingOptions
   ↓ engine/option-generator/selector.ts
        ↓
[refactor-engine]
   - smells에 매칭되는 catalog 룰 후보 추출
   - 트레이드오프 축 5개 중 다른 3개 선택
   - 각 축에 대해 LLM 호출 (병렬, pi-ai 사용)
        ↓
[pi-ai] 멀티 프로바이더 LLM 호출
        ↓
[refactor-engine]
   - 각 LLM 응답을 RefactoringOption으로 포장
   - 메트릭 측정 (Before/After 복잡도)
        ↓
[refactor-workflow] WorkflowUI.presentOptions(options)
        ↓
[refactor-tui] options-screen.ts
   pi-tui SelectList 표시 → 사용자 'B' 선택
        ↓
[refactor-workflow] 상태: ValidatingChoice
   ↓ engine/transformer/ast-diff.ts
        ↓
[refactor-engine]
   - LLM 출력 AST와 카탈로그 룰 의도 비교
   - 시그니처 변경 감지 시 → AwaitingSigConfirm
        ↓
[refactor-workflow] 상태: BackingUp
   ↓ git stash push -m "refactor-WIP-{uuid}"
        ↓
[refactor-workflow] 상태: ApplyingChange
   ↓ engine/transformer/apply.ts → 파일 쓰기
   ↓ engine/learning/hook.ts 호출 (v1.0 no-op)
        ↓
[refactor-workflow] 상태: ValidatingResult
   ↓ engine/validator/type-check.ts (tsc)
   ↓ engine/validator/lint-check.ts (LinterAdapter)
        ↓
[refactor-adapters] eslint.ts: ESLint 실행
        ↓
[refactor-workflow] 상태: PreparingPR
   ↓ adapters/pr/router.ts 4단 라우팅 → GitHubAdapter 선택
        ↓
[refactor-adapters] github.ts: gh pr create --dry-run 미리보기
        ↓
[refactor-workflow] WorkflowUI.confirmPR(preview)
        ↓
[refactor-tui] pr-screen.ts → 사용자 'yes'
        ↓
[refactor-workflow] 상태: CreatingPR
   ↓ GitHubAdapter.createPR({ dryRun: false })
        ↓
[refactor-adapters] github.ts: gh pr create 실제 호출
        ↓
[refactor-workflow] 상태: Done
   ↓ WorkflowUI.showSuccess(url)
```

---

## 5. 카탈로그 룰 구조

### 5.1 `RefactoringRule` 인터페이스

```typescript
export interface RefactoringRule {
  readonly id: string;                   // "guard-clauses"
  readonly name: string;                 // "Replace Nested Conditional with Guard Clauses"
  readonly tradeoffAxis: TradeoffAxis;   // "conditional"
  readonly language: string;             // "typescript"

  /** 이 룰이 적용 가능한 스멜인지 */
  matches(smell: Smell): boolean;

  /** LLM에 보낼 프롬프트 생성 */
  buildPrompt(input: RuleInput): string;

  /** LLM 출력의 AST가 룰의 의도와 일치하는지 검증 */
  validate(before: AST, after: AST): ValidationResult;

  /** 적용 후 메트릭 변화 예측 (옵션 카드 표시용) */
  expectedMetrics(before: Metrics): Partial<Metrics>;
}

export type TradeoffAxis =
  | "conditional"
  | "type"
  | "functional"
  | "async"
  | "composition";
```

### 5.2 룰 5종 매핑

| 룰 ID | 트레이드오프 축 | 매칭 스멜 |
|---|---|---|
| `guard-clauses` | conditional | deep-nesting (depth ≥ 3) |
| `replace-any` | type | type-any (any 타입 발견) |
| `loop-pipeline` | functional | imperative-loop (for + push 패턴) |
| `async-await` | async | promise-chain (.then ≥ 2개) |
| `extract-function` | composition | long-method (lines ≥ 30) |

### 5.3 옵션 생성 알고리즘

```typescript
function generateOptions(smells: Smell[]): RefactoringOption[] {
  // 1. 모든 스멜에 매칭되는 룰 후보 수집
  const candidates = smells
    .flatMap(smell => catalog.rulesMatching(smell));

  // 2. 트레이드오프 축으로 그룹화
  const byAxis = groupBy(candidates, r => r.tradeoffAxis);

  // 3. 서로 다른 축 3개 선정 (라운드 로빈)
  const selectedAxes = selectDistinctAxes(byAxis, 3);

  // 4. 각 축에서 1개씩 룰 선정 (smell 임팩트 큰 순)
  return selectedAxes.map(axis => byAxis[axis][0])
    .map(rule => buildOptionFromRule(rule));
}
```

→ 면접 질문 *"옵션 3개는 어떻게 정해요?"* 답변: *"트레이드오프 축 5개 정의, 매칭된 룰을 축별로 그룹화, 다른 축 3개 선정."*

---

## 6. 트레이드오프 축 5개

| 축 | 의미 | 예 |
|---|---|---|
| **conditional** | 조건문 처리 방식 | guard / switch / polymorphism |
| **type** | 타입 안전성 수준 | unknown / interface / discriminated union |
| **functional** | 명령형 ↔ 함수형 | for-loop / map-filter / generator |
| **async** | 비동기 패턴 | callback / Promise chain / async-await + Promise.all |
| **composition** | 코드 구성 단위 | inline / function / module / hook |

각 옵션은 *반드시 다른 축*에 속해야 함. 같은 축의 옵션 2개를 동시에 보여주면 ADR-004 위반.

---

## 7. AST 검증 (ADR-012)

### 7.1 검증 단계

```typescript
function astDiff(before: AST, after: AST): DiffResult {
  return {
    signatureChanged: compareSignatures(before, after),  // strict
    importChanges: compareImports(before, after),        // info
    callSiteChanges: compareCallSites(before, after),    // strict
    bodyChanges: compareBodies(before, after),           // lenient
  };
}
```

### 7.2 검증 강도

| 항목 | 강도 | 동작 |
|---|---|---|
| 함수 시그니처 (이름, 매개변수, 반환 타입) | **strict** | 변경 감지 시 사용자 확인 (`AwaitingSigConfirm`) |
| 호출 사이트 (호출자가 영향 받는지) | **strict** | 변경 감지 시 사용자 확인 |
| import 추가/제거 | info | 통과, 사용자에게 보여만 줌 |
| 함수 본문 변경 | **lenient** | 자동 통과 (LLM이 자유롭게 변경 가능) |

→ *"AI가 시그니처를 바꿨어요. 호출 사이트 3곳에 영향. 진행?"* 같은 안내.

---

## 8. 핵심 메트릭

### 8.1 측정 항목

| 메트릭 | 정의 | 도구 |
|---|---|---|
| Cyclomatic complexity | 분기 경로 수 | 직접 계산 (AST 기반) |
| Cognitive complexity | 사람이 느끼는 복잡도 | SonarSource 공식 |
| Lines of code | 코드 라인 수 | 단순 카운트 |
| Nesting depth | 최대 중첩 깊이 | AST 분석 |
| Type safety | `any` 개수, 타입 추론 비율 | TS programmatic API |

### 8.2 옵션 카드 표시

```
옵션 B: Replace Loop with Pipeline (functional)
├─ 트리거: imperative-loop (for + push 패턴)
├─ 측정 변화:
│   - 복잡도 12 → 5 (-58%)
│   - 라인 84 → 31 (-63%)
│   - 타입 통과 ✓
├─ 장점: 가독성 ↑, 단계별 조작 명확
├─ 단점: 함수형 익숙치 않으면 진입 장벽
└─ 권장: 데이터 변환 위주 코드
```

---

## 9. pi-mono 통합

### 9.1 `pi-ai` 사용

LLM 호출은 `pi-ai`의 통합 API로:

```typescript
// engine/llm-bridge/apply-rule.ts
import { createClient } from "@mariozechner/pi-ai";

const client = createClient({
  provider: process.env.LLM_PROVIDER ?? "anthropic",
  // ...
});

export async function applyRule(rule: RefactoringRule, code: string): Promise<string> {
  const prompt = rule.buildPrompt({ code });
  const response = await client.complete({ prompt, maxTokens: 4000 });
  return response.text;
}
```

→ 사용자가 `LLM_PROVIDER=ollama` 등으로 모델 자유 선택.

### 9.2 `pi-agent-core` 사용

전체 에이전트 런타임을 `pi-agent-core`로 감쌈. 도구는 자체 정의:

```typescript
// app/agent-runtime.ts
import { Agent } from "@mariozechner/pi-agent-core";

const agent = new Agent({
  tools: [
    /* tree-sitter 파싱, 파일 쓰기, git stash 등을 도구로 노출 */
  ],
  systemPrompt: /* 우리 도구 정체성 */,
});
```

세션 관리/상태 추적은 `pi-agent-core`가 자동 (ADR-010).

### 9.3 `pi-tui` 사용

TUI 화면은 `pi-tui`의 컴포넌트 기반 시스템 활용:

```typescript
// tui/screens/options-screen.ts
import { TUI, SelectList, Box, Markdown } from "@mariozechner/pi-tui";

class OptionsScreen {
  constructor(private tui: TUI, private options: RefactoringOption[]) {}
  show(): Promise<string> {
    const list = new SelectList(this.options.map(o => ({
      label: o.name,
      detail: renderOptionCard(o),
    })));
    this.tui.showOverlay(list, { width: "90%", height: "80%" });
    return new Promise(resolve => list.onSelect = (id) => resolve(id));
  }
}
```

---

## 10. 테스트 전략

### 10.1 단위 테스트 (vitest)

| 패키지 | 단위 테스트 대상 | 모킹 대상 |
|---|---|---|
| `engine` | 디텍터, 룰, 메트릭, 옵션 생성 | LLM (FakeAi 주입) |
| `workflow` | 상태 전이 | UI (FakeUI 주입) |
| `tui` | 컴포넌트 렌더링 | TUI 터미널 |
| `adapters` | 어댑터별 명령 빌드 | gh CLI subprocess |
| `app` | DI 조립 | 모두 |

### 10.2 통합 테스트

샘플 TS 파일을 입력으로 end-to-end 실행 (LLM은 fake 응답 또는 실제 API).

### 10.3 카탈로그 룰 테스트

각 룰에 대해 *"이런 입력 → 이런 출력"* 골든 파일 테스트:

```
test-fixtures/
├── guard-clauses/
│   ├── input.ts
│   └── expected.ts
├── replace-any/
│   ├── input.ts
│   └── expected.ts
└── ...
```

---

## 11. 빌드 / 배포

### 11.1 빌드

- 각 패키지: `tsup` 또는 `bun build`로 ESM + CJS 동시 생성
- 타입: `tsc --emitDeclarationOnly`로 `.d.ts` 생성
- 모노레포 빌드 순서: `engine` → `workflow`/`adapters` → `tui` → `app`

### 11.2 배포

- `app` 패키지에 `bin` 등록 → `npx @oj/refactor-agent` 또는 `npm i -g @oj/refactor-agent`
- 나머지 패키지는 모노레포 내부 의존, 단독 배포는 선택적
- npm 스코프: `@oj` (실제 org 이름에 맞춰 변경)

### 11.3 단일 바이너리 (선택)

`bun build --compile`로 단일 바이너리 생성 가능 → Node 미설치 환경에도 배포.

---

## 12. 미해결 / 미래 고려

- **`pi-tui` Markdown 렌더 한계** — 옵션 카드의 코드 블록이 어떻게 보일지 실측 필요 (M5에서)
- **tree-sitter TypeScript 문법의 타입 추론 한계** — TS 컴파일러 API 병행 필요할 수 있음
- **카탈로그 룰의 LLM 프롬프트 튜닝** — 룰별로 *어느 프롬프트가 더 나은 출력*인지 시행착오 필요
- **상태 머신 라이브러리** — XState 도입할지 자체 구현할지 (M5 결정)
- **다언어 카탈로그** — Python/Go 추가 시점 (v1.1+)

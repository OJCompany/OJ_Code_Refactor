# PRD — Refactor Agent (v1.0 MVP)

> **상태**: v1.0 Draft · **작성일**: 2026-05-06 · **참조**: [PROJECT_PLAN.md](PROJECT_PLAN.md), [ARCHITECTURE.md](ARCHITECTURE.md)
>
> **변경 이력**: v0(2026-05-06, 컨벤션 감지 중심) → v1.0(현재, 리팩토링 알고리즘 엔진으로 정체성 변경, 멘토 피드백 반영).

---

## 1. 한 줄 요약

**TypeScript 코드를 AST로 분석해 코드 스멜을 감지하고, 리팩토링 카탈로그에 등록된 룰 기반으로 *서로 다른 트레이드오프* 옵션 3개를 LLM에 적용시켜, 사용자가 선택한 옵션을 검증·적용·PR 생성까지 한 번에 처리하는 로컬 TUI 에이전트.**

---

## 2. 배경 & 차별화

### 2.1 문제 정의

기존 AI 코딩 도구의 한계:

1. **기준 없음** — Cursor/Copilot은 *"리팩토링해줘"*에 LLM 답 하나만 던짐. 왜 그게 더 좋은지 근거 없음.
2. **트레이드오프 무시** — 같은 코드도 함수형/OOP/명령형 등 여러 답이 있는데, AI는 하나만 제시.
3. **검증 없음** — LLM 출력이 의도와 다른 코드여도 사용자가 직접 검증해야 함.
4. **측정 불가** — *"이게 더 좋아진 코드인가?"* 수치 근거 없음.

### 2.2 우리의 답

| 문제 | Refactor Agent의 해결 |
|---|---|
| 기준 없음 | AST 분석 + 코드 스멜 감지 + 카탈로그 룰 매칭이 *결정권자*. LLM은 룰 적용 실행자. |
| 트레이드오프 무시 | 트레이드오프 축 5개(조건문/타입/함수형/비동기/구성) 정의. 옵션은 *반드시 다른 축*에서 3개. |
| 검증 없음 | LLM 출력을 AST diff로 의도 일치 검증. 시그니처 변경 시 사용자 확인. |
| 측정 불가 | Before/After 복잡도/라인 수/타입 통과를 옵션 카드에 수치로 표시. |

### 2.3 경쟁 도구 비교

| 도구 | 한계 | Refactor Agent |
|---|---|---|
| Cursor / Copilot | LLM 단일 답, 기준 없음 | 카탈로그 + 3옵션 + 메트릭 |
| Sourcery | 룰 기반 단일 답, AI 미사용 | 룰 + AI + 트레이드오프 옵션 |
| CodeRabbit / Greptile | 클라우드, 코멘트만 | 로컬, 적용 + PR 자동화 |
| 일반 린터 | 자동 수정만, 구조적 X | 구조 리팩토링 (5개 카탈로그) |

---

## 3. 목표 / 비목표

### 3.1 목표 (v1.0)

1. **TypeScript 파일에 대해 5종 리팩토링 지원** — Guard Clauses, Replace any, Loop→Pipeline, async/await, Extract Function/Hook
2. **3개 옵션을 서로 다른 트레이드오프 축에서 생성** (ADR-004)
3. **AST diff 검증** — LLM 출력의 의도 일치 보장 (ADR-012)
4. **메트릭 측정** — Before/After 복잡도/라인 수 옵션 카드 표시
5. **PR 자동 생성** — dry-run 우선, 어댑터 라우팅 4단 폴백 (ADR-011)
6. **TUI 풀화면 인터페이스** — pi-tui 기반

### 3.2 비목표 (v1.0 한정)

- TypeScript 외 언어 (설계는 다언어 지원, 구현은 TS만)
- CLI 모드 (코드 분리는 유지, v1.0엔 TUI만 노출)
- 학습 기능 (옵션 선택 누적 학습은 *훅만*, 실 구현 X)
- 다중 파일 리팩토링
- IDE 통합
- 클라우드 SaaS
- 자체 LLM 호스팅
- GitLab/Bitbucket 어댑터 (인터페이스만 유지, 구현은 v1.1+)

---

## 4. 타겟 사용자

### 4.1 페르소나 — *"리팩토링 의사결정에 도움 받고 싶은 TS 개발자"*

| 페르소나 | 시나리오 |
|---|---|
| **시니어 엔지니어 "수민"** | 본인은 답을 알지만 *"왜 그게 더 나은가"*를 후배에게 설명할 도구 필요 |
| **중급 엔지니어 "지호"** | 함수형 vs 명령형 같은 트레이드오프를 익히고 싶음. 단일 답이 아닌 *비교* 원함 |
| **신입 엔지니어 "현우"** | 자기가 짠 긴 함수가 *"리팩토링 되긴 하나?"* 확인하고 싶음 |
| **OSS 메인테이너 "민지"** | PR 리뷰 시간 단축, *"이렇게 고치면 어때?"*를 자동으로 생성 |

→ 공통: TypeScript 사용, 로컬 도구 선호, *"왜"*를 중요시.

---

## 5. 사용자 스토리

### US-1 — 기본 리팩토링 흐름
> *"개발자로서, `refactor src/auth.ts`를 실행하면, 도구가 AST로 코드를 분석해 스멜(긴 함수, 깊은 중첩, any 타입 등)을 감지하고, 트레이드오프 축이 다른 옵션 3개를 메트릭과 함께 보여줘야 한다. 옵션 B를 선택하면 LLM 출력이 AST 검증을 통과하는지 확인 후 git stash 백업하고 적용해야 한다."*

### US-2 — 시그니처 변경 시 확인
> *"개발자로서, AI가 함수 시그니처를 바꾸려고 할 때 'auth(user, password) → auth({user, password})로 변경되며 호출 사이트 3곳에 영향. 진행할까요?'라는 명시적 확인을 받아야 한다."*

### US-3 — 호스팅 미설치 fallback
> *"개발자로서, gh CLI가 깔리지 않은 환경에서도 리팩토링 적용·검증·diff 출력은 100% 동작해야 한다. PR 단계에서만 'gh가 없어 직접 만드세요'라는 안내와 브랜치/커밋 메시지 후보를 받아야 한다."*

### US-4 — 첫 PR 시 호스트 자동 감지
> *"개발자로서, 처음 `/pr`을 실행하면 도구가 git remote에서 GitHub를 감지해 'GitHub 맞나요?'를 한 번만 묻고, 승인 시 AGENTS.md에 자동 저장해 다음부터 묻지 않아야 한다."*

### US-5 — 옵션 모두 거절
> *"개발자로서, 제시된 옵션 3개가 모두 마음에 안 들 때 'skip'을 선택하면 변경 없이 종료되고, 다른 옵션을 요청할 수 있어야 한다."*

### US-6 — 메트릭 기반 의사결정
> *"개발자로서, 옵션 카드에 '복잡도 12 → 5 (-58%), 라인 84 → 31 (-63%), 타입 통과 ✓' 같은 수치가 표시되어, 느낌 아닌 측정 기반으로 선택할 수 있어야 한다."*

### US-7 — 일회성 호스트 오버라이드
> *"개발자로서, 평소 GitHub를 쓰지만 이번만 GitLab으로 보내고 싶을 때 `/pr --host=gitlab`로 영속화 없이 임시 변경할 수 있어야 한다."*

---

## 6. 기능 요구사항

### 6.1 v1.0 MVP (필수)

#### FR-1. AST 파싱 (`engine/ast/parser.ts`)
- tree-sitter 기반, TypeScript 문법 지원
- 입력: 파일 경로 / 코드 문자열
- 출력: AST 트리 + 부가 메타데이터(파일 경로, 언어)
- **Acceptance**: 100개 TS 파일 fixture에 대해 파싱 성공률 95% 이상

#### FR-2. 코드 스멜 감지 (`engine/smell-detection/`)
- 5종 디텍터:
  - `long-method` (lines ≥ 30)
  - `deep-nesting` (depth ≥ 3)
  - `type-any` (any 타입 발견)
  - `imperative-loop` (for + push 패턴)
  - `promise-chain` (.then ≥ 2개)
- 각 디텍터는 독립 모듈, 단위 테스트 포함
- **Acceptance**: 각 디텍터 별 골든 파일 테스트 통과

#### FR-3. 메트릭 측정 (`engine/smell-detection/metrics/`)
- Cyclomatic complexity, Cognitive complexity, Lines of code, Nesting depth, Type safety (any 비율)
- **Acceptance**: SonarSource 공식 cognitive complexity 정의에 부합 (단위 테스트로 검증)

#### FR-4. 카탈로그 룰 5종 (`engine/catalog/rules/`)
- 각 룰 = `RefactoringRule` 인터페이스 구현
- 5개 룰: `guard-clauses`, `replace-any`, `loop-pipeline`, `async-await`, `extract-function`
- 각 룰은: 매칭 스멜 / 트레이드오프 축 / LLM 프롬프트 / AST 검증 / 예상 메트릭
- **Acceptance**: 각 룰별 fixture (input.ts → expected.ts) 통과

#### FR-5. 옵션 생성 (`engine/option-generator/`)
- 트레이드오프 축 5개 정의: conditional, type, functional, async, composition
- 매칭된 룰을 축별 그룹화 → 다른 축 3개 선정
- 각 옵션에 메트릭(Before/After) 첨부
- **Acceptance**: 동일 입력에 대해 항상 3개 다른 축의 옵션 반환

#### FR-6. LLM 통합 (`engine/llm-bridge/`)
- `pi-ai`를 통한 멀티 프로바이더 지원 (Anthropic, OpenAI, Ollama 등)
- 프롬프트 = 룰 정의 + 코드 컨텍스트
- 환경변수로 프로바이더/모델 선택
- **Acceptance**: 4개 프로바이더(Anthropic, OpenAI, Ollama, Groq) 환경에서 동작

#### FR-7. AST 검증 (`engine/transformer/ast-diff.ts`)
- LLM 출력 코드를 AST로 파싱 → 원본 AST와 비교
- 검증 항목 (ADR-012):
  - 시그니처 (strict): 변경 시 사용자 확인
  - 호출 사이트 (strict): 변경 시 사용자 확인
  - import (info): 통과
  - 본문 (lenient): 통과
- **Acceptance**: 시그니처 변경 의도/비의도 케이스 각 3건 단위 테스트

#### FR-8. 변경 적용 (`engine/transformer/apply.ts`)
- 적용 전 git stash push (메시지: `refactor-WIP-{uuid}`)
- 파일 쓰기
- 실패 시 stash pop reverse로 롤백
- **Acceptance**: 적용 → 강제 실패 → 자동 롤백 → 원본 복구 시나리오 통과

#### FR-9. 검증 파이프라인 (`engine/validator/`)
- 적용 후 자동 실행:
  - `tsc --noEmit` (타입 체크)
  - LinterAdapter.runCheck (린트 위반)
- 실패 시 사용자에게 알림, 롤백 옵션 제시
- **Acceptance**: 타입 에러 / 린트 에러 각 케이스에서 적절한 사용자 메시지

#### FR-10. PR 어댑터 + 라우팅 (`adapters/pr/`)
- 어댑터 인터페이스: `createPR({ branch, baseBranch, title, body, dryRun })`
- 구현체: `GitHubAdapter` (gh CLI), `NoopAdapter` (gh 미설치)
- 라우팅 (ADR-011): CLI 플래그 → AGENTS.md → git remote 감지(첫 회 확인 후 영속화) → 사용자 질의
- **Acceptance**: 4단 라우팅 각각 시나리오 + Self-hosted Enterprise 케이스 + 충돌 케이스 통과

#### FR-11. 상태 머신 (`workflow/state-machine.ts`)
- ARCHITECTURE.md §3 다이어그램의 모든 상태/전이 구현
- 사용자 대기 상태(`Awaiting*`)는 명시적 분리
- **Acceptance**: 모든 상태 전이에 대한 단위 테스트

#### FR-12. TUI 화면 (`tui/screens/`)
- 4개 화면: detect, options, apply, pr
- pi-tui Overlay로 풀화면 표시
- IME 지원 (한국어 입력 정상 동작)
- **Acceptance**: 각 화면 골든 렌더 테스트 + 사용자 입력 처리

#### FR-13. WorkflowUI 인터페이스 (`engine/adapters/ui.ts`)
- 워크플로우와 화면 분리 (ADR-006)
- 구현체: `PiTuiUI` (v1.0). FakeUI로 단위 테스트.
- **Acceptance**: 워크플로우 단위 테스트가 FakeUI만으로 동작

#### FR-14. 진입점 (`app/index.ts`)
- CLI 바이너리 등록 (`bin` 필드)
- `refactor <path>` 형태로 실행
- pi-agent-core 통합
- **Acceptance**: `npx @oj/refactor-agent src/foo.ts` 실행 가능

### 6.2 v1.0 비포함 (v1.1+)

| 우선순위 | 항목 | 비고 |
|---|---|---|
| P0 | 테스트 자동 실행 (`TestRunnerAdapter` 호출) | 인터페이스는 v1.0에 있음 |
| P0 | 카탈로그 룰 +3개 (총 8개) | TS 한정 |
| P1 | GitLab 어댑터 추가 | 인터페이스 준수만 하면 됨 |
| P1 | 컨벤션 자동 학습 → CONVENTIONS.md 초안 생성 | 별도 명령어로 |
| P2 | Python 카탈로그 (5개 룰) | 다언어 시작 |
| P2 | 다중 파일 리팩토링 | 다른 파일 영향 분석 |
| P2 | 옵션 선택 학습 | `engine/learning/hook.ts` 채움 |
| P3 | IDE 플러그인, 클라우드, eval | 먼 미래 |

---

## 7. 비기능 요구사항 (NFR)

| 항목 | 요구 |
|---|---|
| **성능** | AST 파싱 ≤ 1초/파일 (1000줄 기준) |
| **성능** | 옵션 3개 생성 ≤ 30초 (LLM 3회 병렬 호출) |
| **신뢰성** | LLM 출력은 AST 검증 통과 시에만 적용 |
| **신뢰성** | 모든 파괴적 동작 (파일 쓰기, push, PR)은 dry-run + confirm |
| **안전** | git stash 백업 후 적용, 실패 시 자동 롤백 |
| **안전** | API 키는 환경변수만, 코드/로그 기록 금지 |
| **보안** | LLM 호출 시 사용자 코드만 전송, 시스템 정보 미포함 |
| **호환** | Node.js LTS (20+), macOS / Linux / Windows (best-effort) |
| **배포** | npm 패키지 (`npm i -g @oj/refactor-agent`) |
| **라이선스** | MIT (OSS) |
| **모델 의존성** | 모델/프로바이더 무관 (pi-ai 활용) |
| **모듈성** | 어댑터 패턴 — 새 호스팅/언어/린터 추가는 기존 코드 변경 0줄 |
| **Graceful degrade** | 호스팅 CLI 미설치 시 변경 적용·diff까지 보장 (US-3) |
| **테스트 커버리지** | 단위 테스트 80% 이상 (engine 패키지) |

---

## 8. 성공 지표

### 8.1 핵심 지표 (3개월 출시 기준)

| 지표 | 정의 | 목표 |
|---|---|---|
| **카탈로그 룰 정확도** | 룰별 fixture 통과율 | ≥ 90% |
| **AST 검증 통과율** | LLM 출력이 AST 검증을 통과한 비율 | ≥ 80% |
| **옵션 채택률** | A/B/C 중 선택 / skip 제외 전체 | ≥ 60% |
| **PR 생성 완료율** | dry-run → confirm까지 도달 | ≥ 50% |
| **단위 테스트 커버리지** | engine 패키지 | ≥ 80% |

### 8.2 보조 지표

- 세션당 평균 복잡도 감소
- 시그니처 변경 확인 후 사용자 거절률 (높으면 LLM 프롬프트 튜닝 필요)
- 적용 후 검증 실패 → 롤백 비율
- npm 다운로드 수, GitHub stars

### 8.3 측정 방법

- 로컬 로그 (v1.0)
- opt-in 텔레메트리 (v1.1+)

---

## 9. 마일스톤

> 자세한 내용은 [PROJECT_PLAN.md §6](PROJECT_PLAN.md) 참조.

| 단계 | 기간 | 산출물 |
|---|---|---|
| **M1 — Foundation** | 2주 | 모노레포 + tree-sitter 통합 |
| **M2 — Smell Detection** | 2주 | 5종 디텍터 + 메트릭 |
| **M3 — Catalog Rules 1~3** | 3주 | Guard Clauses, Replace any, Loop→Pipeline |
| **M4 — Catalog Rules 4~5 + Generator** | 2주 | async/await, Extract Function + 옵션 생성 |
| **M5 — Workflow + TUI** | 2주 | 상태 머신 + 4개 화면 |
| **M6 — Adapters + App** | 1주 | GitHub PR + ESLint + 진입점 |
| **M7 — End-to-End + 데모** | 1주 | 실제 OSS 시연 + README + npm 배포 |

총 13주 (3.25개월).

---

## 10. 리스크 & 완화

| 리스크 | 영향 | 완화 |
|---|---|---|
| LLM이 의도와 다른 코드 생성 | 높음 | AST diff 검증 (FR-7) + 시그니처 변경 사용자 확인 |
| AST 파싱 실패 (TypeScript 타입 추론 한계) | 중 | 파싱 실패 시 해당 파일 스킵 + 사용자 안내, 향후 TS 컴파일러 API 병행 검토 |
| LLM 호출 비용 폭증 | 중 | 옵션 카드 표시 후 LLM 호출 (필요시만), 프롬프트 토큰 최적화 |
| pi-mono 코어 API 변경 | 낮음 | 버전 고정 (`pi-ai@x.y.z`) + 호환성 테스트 |
| gh CLI 미설치/인증 실패 | 중 | NoopAdapter graceful degrade (US-3) |
| 옵션 3개 모두 거절 | 낮음 | "skip" 또는 추가 옵션 요청 (US-5) |
| 메트릭이 *틀린 신호* 줌 | 낮음 | 메트릭은 *측정값*으로만 표시, 해석은 사용자 |
| TUI 렌더링 IME 깨짐 | 중 | pi-tui IME 지원 활용, 한국어 입력 골든 테스트 |

---

## 11. Open Questions / TBD

확정 전에 답이 필요한 항목:

1. **수익 모델** — v1.0은 무료 OSS 확정. 사용자 100명 / 별 200개 도달 시 Pro tier 검토할지?
2. **모델 default** — README에서 어떤 LLM 모델을 추천할지? (Claude Sonnet 권장, fallback Ollama codestral)
3. **비용 가이드** — *"리뷰 1회당 토큰 X 이하"* 같은 목표선이 필요한가?
4. **상태 머신 라이브러리** — XState vs 자체 구현?
5. **LLM 프롬프트 캐싱** — 동일 코드 + 룰 조합에 대한 응답 캐싱? (개발 시 비용 절감)
6. **Windows 지원 정책** — best-effort 유지 vs 명시적 비지원?
7. **카탈로그 v1.0 5개 vs 8개** — 3개월 안에 8개 가능 vs 5개로 안전?

---

## 12. 의사결정 기록 (참조)

자세한 내용은 [PROJECT_PLAN.md §7](PROJECT_PLAN.md) 참조.

- ADR-001: pi-mono 코어 2개만 사용 (`pi-ai` + `pi-agent-core` + `pi-tui`)
- ADR-002: 알고리즘 우선, LLM은 실행자 (멘토 피드백)
- ADR-003: 옵션 정확히 3개
- ADR-004: 옵션 다양성은 트레이드오프 축으로 (5개 축)
- ADR-005: TypeScript 우선, 다언어는 플러그인
- ADR-006: TUI 풀화면, 코드는 CLI/TUI 분리 가능 구조
- ADR-007: 상태 머신 기반 워크플로우
- ADR-008: git stash 기반 롤백
- ADR-009: 학습 기능 v1.0 X (훅 자리만)
- ADR-010: 세션 영속화 pi에 위임
- ADR-011: PR 어댑터 패턴 + 4단 라우팅
- ADR-012: AST 검증 강도 중간

---

## 부록 A — 용어

- **Refactor Agent**: 본 프로젝트
- **pi-mono**: 코어로 사용 중인 베이스 모노레포
- **카탈로그**: 리팩토링 룰의 모음 (Fowler + 모던 추가)
- **트레이드오프 축**: 옵션 다양성을 보장하는 5개 차원 (조건문/타입/함수형/비동기/구성)
- **AST 검증**: LLM 출력의 의도 일치 여부를 AST 레벨에서 비교
- **어댑터**: 외부 도구 추상화 인터페이스 (PR/Linter/TestRunner)
- **WorkflowUI**: 워크플로우와 화면을 분리하는 프레젠테이션 인터페이스
- **noop fallback**: 호스팅 CLI 미설치 시 변경 적용+diff만 하는 graceful degrade
- **BYOK**: Bring Your Own Key (사용자가 자기 LLM API 키 제공)

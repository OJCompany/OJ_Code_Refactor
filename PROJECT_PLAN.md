# Refactor Agent — 프로젝트 계획서

> AST 기반 코드 분석 + 리팩토링 카탈로그 + LLM 실행자로 동작하는 TypeScript 우선 리팩토링 도구. `pi-mono`의 코어(`pi-ai`, `pi-agent-core`)를 활용해 자체 TUI 에이전트 앱으로 구현.

---

## 1. 정체성

### 1.1 한 줄 소개

> *"AI에게 그냥 맡기지 않는다. 알고리즘이 무엇을 고칠지 결정하고, LLM은 결정된 룰을 코드에 적용하는 실행자."*

### 1.2 차별화

기존 AI 코딩 도구들의 한계:

| 도구 | 한계 |
|---|---|
| Cursor / Copilot | LLM에 *"리팩토링해줘"* 던지고 끝. 기준 없음. |
| Sourcery | 룰 기반(LLM 미사용). 옵션 없음. 단일 답. |
| CodeRabbit / Greptile | 클라우드, 리뷰 코멘트만, 실제 적용 X. |
| 일반 린터 | 자동 수정만, 구조적 리팩토링 X. |

**Refactor Agent의 차별점**:

1. **알고리즘 우선** — AST 분석 + 코드 스멜 감지 + 리팩토링 카탈로그가 *결정권자*. LLM은 결정된 룰을 코드에 적용하는 실행자.
2. **3가지 옵션 + 트레이드오프** — 동일 스멜에 대해 *서로 다른 축*의 3개 옵션 제시. 사용자가 트레이드오프를 인식하고 선택.
3. **수치 기반 평가** — 복잡도/라인 수/타입 통과 등 Before/After 메트릭을 옵션 카드에 표시. *"느낌"* 아닌 *"측정"*.
4. **AST 검증** — LLM 출력을 그대로 적용 X. AST diff로 의도 일치 검증, 시그니처 변경 시 사용자 확인.
5. **로컬 + OSS + 모델 무관** — Anthropic / OpenAI / Ollama 모두 가능 (pi-ai 활용).

### 1.3 비목표 (Non-goals, v1.0 한정)

- 클라우드 SaaS / 호스팅 서비스
- IDE 통합 (VS Code, JetBrains)
- TypeScript 외 언어 (설계는 다언어, 구현은 TS만)
- CLI 모드 (코드 분리는 하되 v1.0에선 TUI만 노출)
- 학습 기능 (옵션 선택 누적 학습은 *훅만*, 실 구현은 v1.1+)
- 다중 파일 리팩토링 (단일 파일 위주)
- 자체 LLM 호스팅 (pi-ai 통해 외부 프로바이더)

---

## 2. 기술 스택

### 2.1 pi-mono 활용 범위

`pi-mono`는 모노레포지만 우리는 **코어 2개만** 사용:

| 패키지 | 사용 | 역할 |
|---|---|---|
| `@mariozechner/pi-ai` | ✅ | 멀티 프로바이더 LLM API. 직접 LLM 클라이언트 구현 회피. |
| `@mariozechner/pi-agent-core` | ✅ | 에이전트 런타임 (도구 호출, 상태 관리). |
| `@mariozechner/pi-tui` | ✅ | TUI 라이브러리 (differential rendering, IME, 오버레이). 직접 만들지 않음. |
| `@mariozechner/pi-coding-agent` | ❌ | 우리가 자체 에이전트 앱을 만들 것이므로 사용 X. |
| `@mariozechner/pi-web-ui` | ❌ | TUI만 지원하므로 불필요. |

**의미**: 우리는 *"pi 위에 얹은 플러그인"*이 아니라 **pi의 코어를 사용한 독립 제품**.

### 2.2 핵심 라이브러리

| 영역 | 라이브러리 | 이유 |
|---|---|---|
| AST 파싱 | `tree-sitter` (+ `tree-sitter-typescript`) | 다언어 지원, 향후 확장 가능 |
| 타입 체크 | `typescript` (programmatic API) | TS 전용 검증 |
| 린터 (TS) | `eslint`, `biome` | 어댑터로 추상화 |
| 패키지 매니저 | npm workspaces | 모노레포 |
| 빌드 | `tsup` 또는 `bun build` | 단순함 |
| 테스트 | `vitest` | pi-mono와 동일 |
| 포맷/린트 | `biome` | pi-mono 컨벤션 따라감 |

### 2.3 다언어 지원 전략

**현재**: TypeScript만 구현. **설계**: 카탈로그 / 어댑터를 언어별 플러그인으로.

```
@oj/refactor-engine (언어 무관 코어)
  ├─ catalog/loader.ts       ← 카탈로그 플러그인 로더
  └─ ast/parser.ts            ← tree-sitter (다언어)

@oj/refactor-catalog-typescript  ← 채움 (5개 룰 구현)
@oj/refactor-catalog-python      ← 미래
@oj/refactor-catalog-go          ← 미래
```

→ 면접 답변: *"TS는 출시 가능 수준까지, Python은 카탈로그 5개만 추가하면 되는 구조예요."*

---

## 3. 5패키지 구조

### 3.1 패키지 개요

```
@oj/refactor-engine      ← 알고리즘 코어 (AST, 스멜, 카탈로그, 검증)
@oj/refactor-workflow    ← 상태 머신 (워크플로우 진행)
@oj/refactor-tui         ← pi-tui로 만든 화면들
@oj/refactor-adapters    ← PR/Linter/TestRunner 어댑터
@oj/refactor-app         ← 진입점, pi-agent-core 통합
```

### 3.2 의존 방향

```
                  ┌──────────────────────┐
                  │ @oj/refactor-app     │   진입점, 조립
                  │ (composition root)   │
                  └──────┬─────┬─────────┘
                         │     │
            ┌────────────┼─────┼────────────┐
            ↓            ↓     ↓            ↓
      ┌──────────┐ ┌──────────┐ ┌──────────────────┐
      │ workflow │ │   tui    │ │     adapters     │
      │ (SM)     │ │ (pi-tui) │ │ (PR/Linter/Test) │
      └────┬─────┘ └─────┬────┘ └─────┬────────────┘
           │             │            │
           └──────┬──────┴────────────┘
                  ↓
           ┌──────────────────┐
           │      engine      │   (가장 순수, 외부 의존 X)
           │ AST + Catalog +  │
           │ Generator + ...  │
           └──────────────────┘
```

**규칙**:
- `engine`: 다른 패키지 의존 X (가장 순수)
- `workflow`: engine만 의존
- `adapters`: engine 의존 (인터페이스 구현)
- `tui`: engine + workflow 의존
- `app`: 모두 의존, 조립

### 3.3 각 패키지 책임

자세한 내용은 [ARCHITECTURE.md](ARCHITECTURE.md) 참조.

---

## 4. 핵심 알고리즘

### 4.1 흐름

```
1. AST 파싱 (tree-sitter)
       ↓
2. 코드 스멜 감지 (long-method / deep-nesting / type-any 등)
       ↓
3. 카탈로그에서 적용 가능한 리팩토링 룰 후보 추출
       ↓
4. 트레이드오프 축 5개 중 *서로 다른* 축 3개 선정
       ↓
5. 각 축에 대해 LLM 호출 (룰 + 코드 컨텍스트 → 리팩토링된 코드)
       ↓
6. 메트릭 측정 (Before/After 복잡도, 라인 수)
       ↓
7. 사용자에게 옵션 3개 제시
       ↓
8. 선택된 옵션을 AST diff로 검증
       ↓
9. (시그니처 변경 시 사용자 확인)
       ↓
10. git stash 백업 후 적용
       ↓
11. 린터 + 타입 체크 재검증
       ↓
12. PR 생성 (어댑터 라우팅 + dry-run)
```

### 4.2 지원 리팩토링 5종 (TS)

| # | 이름 | 트레이드오프 축 | 한 줄 |
|---|---|---|---|
| 1 | **Replace Nested Conditional with Guard Clauses** | 조건문 | 깊은 중첩 if를 조기 반환으로 평탄화 |
| 2 | **Replace `any` with Proper Type** | 타입 | `any`를 `unknown` / 인터페이스 / DU로 좁힘 |
| 3 | **Replace Loop with Pipeline** | 함수형 | `for` 루프를 `.map().filter()`로 |
| 4 | **Promise Chain → async/await + `Promise.all`** | 비동기 | `.then` 사슬 풀고 가능한 곳 병렬화 |
| 5 | **Extract Function / Custom Hook** | 구성 | 긴 함수에서 응집 로직 추출 (React 시 Hook으로) |

**선정 근거**: Fowler 카탈로그 + AI 도구 공통 1순위 + TS 정체성 + 데모 임팩트 (자세히 [ARCHITECTURE.md](ARCHITECTURE.md) §6).

---

## 5. 리스크 & 대응

| 리스크 | 영향 | 대응 |
|---|---|---|
| LLM이 의도와 다른 코드 생성 | 높음 | AST diff 검증 + 시그니처 변경 시 사용자 확인 |
| AST 파싱 실패 (타입 추론 어려운 코드) | 중 | 파싱 실패 시 해당 파일 스킵, 사용자 안내 |
| tree-sitter 문법 한계 | 중 | TS 전용 우선, 다른 언어는 `@typescript-eslint/parser` 등 추가 검토 |
| 메트릭이 *틀린 신호*를 줌 (낮은 복잡도가 항상 좋은 코드 X) | 낮음 | 메트릭은 참고용, 옵션 카드에 *측정값*으로만 표시 (해석은 사용자) |
| pi-mono 코어 API 변경 | 낮음 | 버전 고정 (`pi-ai@x.y.z`), 호환성 테스트 |
| gh CLI 미설치 | 중 | noop 어댑터 fallback (변경 적용 + diff까지 보장) |

---

## 6. 마일스톤 (3개월 1인 기준)

### M1 — Foundation (2주)
- 모노레포 셋업 (npm workspaces, biome, vitest)
- `engine` 패키지 스캐폴드: tree-sitter 통합, AST 파서 래핑
- 5패키지 의존 방향 검증

### M2 — Smell Detection (2주)
- `engine/smell-detection/`: long-method, deep-nesting, type-any 3종 디텍터
- 메트릭 (cyclomatic, cognitive, lines)
- 단위 테스트 80% 커버리지

### M3 — Catalog Rules 1~3 (3주)
- Guard Clauses, Replace any, Loop → Pipeline 카탈로그 룰 구현
- 각 룰: smell 매칭 + 트레이드오프 축 선언 + LLM 프롬프트 + AST 검증

### M4 — Catalog Rules 4~5 + Generator (2주)
- async/await + Promise.all
- Extract Function / Custom Hook
- 옵션 생성 (3개 다른 축 선정 알고리즘)

### M5 — Workflow + TUI (2주)
- 상태 머신 구현
- pi-tui 화면 4종 (감지/옵션/적용/PR)

### M6 — Adapters + App (1주)
- GitHub PR 어댑터 + noop
- ESLint 어댑터
- pi-agent-core 통합, 진입점 완성

### M7 — End-to-End + 데모 (1주)
- 실제 OSS 레포에 시연
- README + 데모 GIF 작성
- npm 배포

---

## 7. 의사결정 기록 (ADR)

### ADR-001: pi-mono 코어 2개만 사용
- **결정**: `pi-ai` + `pi-agent-core` + `pi-tui`만 의존. `pi-coding-agent` 사용 X.
- **이유**: 우리 제품의 정체성을 명확히. *"pi 플러그인"*이 아니라 *"pi 코어를 활용한 독립 제품"*.
- **대안**: pi-coding-agent에 extension/skill로 얹기 → 정체성 약함. 거부.

### ADR-002: 알고리즘 우선, LLM은 실행자
- **결정**: AST 분석 + 코드 스멜 감지 + 카탈로그가 *무엇을 할지* 결정. LLM은 *어떻게 적용할지*만 담당.
- **이유**: 멘토 피드백. *"AI에 그냥 맡긴 거 아니에요?"* 질문에 답할 수 있는 구조.
- **결과**: 옵션 3개의 트레이드오프 축, 카탈로그 매칭, AST 검증이 코드 복잡도의 60% 차지.

### ADR-003: 옵션 정확히 3개
- **결정**: 동일 스멜에 대해 3개 옵션 제시.
- **이유**: 1개=강요, 2개=단순비교, 3개=트레이드오프 인식 강제, 4+=의사결정 피로.
- **결과**: 카탈로그 코드에 *"항상 3개 다른 축"* 강제.

### ADR-004: 옵션 다양성은 트레이드오프 축으로
- **결정**: 옵션 3개는 *반드시 서로 다른 축*에서 나와야 함. 5개 축 정의: 조건문 / 타입 / 함수형 / 비동기 / 구성.
- **이유**: 단순 *"강도 차이"*는 면접에서 *"이건 왜 이게 더 좋아요?"* 답 못함.
- **결과**: 옵션 생성 알고리즘이 축 선정 책임.

### ADR-005: TypeScript 우선, 다언어는 플러그인 구조로
- **결정**: v1.0은 TS만 카탈로그 구현. 코어는 언어 무관, 카탈로그는 언어별 플러그인.
- **이유**: 1개 깊게 vs N개 얕게 → 1인 3개월에선 전자가 압도적.
- **결과**: `@oj/refactor-catalog-typescript`만 구현. Python/Go는 빈자리만 표시.

### ADR-006: TUI 풀화면, 단 코드 내부는 분리
- **결정**: 사용자 경험은 TUI 풀화면만. 단 *비즈니스 로직 / 화면 분리*는 코드 내부에서 유지 (`WorkflowUI` 인터페이스).
- **이유**: 미래 CLI 추가가 *파일 1개 추가*로 끝나도록.
- **결과**: `workflow`는 `WorkflowUI` 인터페이스만 의존. `tui`는 그 인터페이스 구현.

### ADR-007: 상태 머신 기반 워크플로우
- **결정**: LLM-driven 자유 흐름 X. 결정적 상태 머신.
- **이유**: 디버깅/테스트 가능성. *"어느 단계에서 깨졌나"* 추적 가능.
- **결과**: `workflow` 패키지가 `XState`/자체 SM 구현.

### ADR-008: git stash 기반 롤백
- **결정**: 적용 전 자동 stash, 사용자 *"되돌리기"* 시 stash pop reverse.
- **이유**: git 그대로, 추가 인프라 X.
- **메타데이터**: stash 메시지에 `refactor-WIP-{uuid}` 접두사 → 사용자 stash와 분리.

### ADR-009: 학습 기능은 훅 자리만
- **결정**: 옵션 선택 학습 v1.0 X. `engine/learning/hook.ts`에 빈 함수만 둠.
- **이유**: 학습 데이터가 1주일치도 없는 상태에서 만들면 동작 안 함.
- **결과**: 미래에 PR 1개로 학습 로직 추가 가능한 구조.

### ADR-010: 세션 영속화는 pi에 위임
- **결정**: 세션 저장/복구 우리가 만들지 않음. pi-agent-core의 세션 시스템 활용.
- **이유**: pi가 잘 하는 걸 다시 만들면 *"왜 굳이"* 질문 받음.

### ADR-011: PR 어댑터 패턴 + 4단 라우팅
- **결정**: PR 생성은 어댑터 인터페이스로 분리. 라우팅은 4단 폴백 + 자동 영속화.
- **이유**: 호스팅 비종속. gh 미설치 시 noop 어댑터로 graceful degrade.
- **라우팅**: CLI 플래그 → AGENTS.md → git remote 감지(첫 회 확인 후 영속화) → 사용자 질의.

### ADR-012: AST 검증 강도는 중간
- **결정**: 함수 시그니처 변경 시 사용자 확인. 그 외 변경은 자동 통과.
- **이유**: 너무 엄격하면 LLM 변형이 자주 거부됨. 너무 느슨하면 *"AI 그냥 적용한 거"*.
- **결과**: `engine/transformer/ast-diff.ts`가 시그니처 비교만 strict, 그 외 lenient.

---

## 8. 다음 액션

1. ✅ ARCHITECTURE.md 작성 — 5패키지 상세 + 어댑터 인터페이스 + 데이터 흐름
2. ✅ PRD.md 갈아엎기 — 새 정체성으로
3. 모노레포 스캐폴드 (npm workspaces + 5패키지 빈 껍데기)
4. M1 시작: `engine`에 tree-sitter 통합

---

## 부록 A — 용어

- **Refactor Agent**: 본 프로젝트
- **pi-mono**: 본 프로젝트의 베이스 (코어 2개 사용)
- **카탈로그**: 리팩토링 룰의 모음 (Fowler 책 + 모던 추가)
- **트레이드오프 축**: 옵션 다양성을 보장하는 5개 차원 (조건문/타입/함수형/비동기/구성)
- **AST 검증**: LLM 출력이 의도와 일치하는지 AST 레벨에서 비교
- **어댑터**: 외부 도구를 추상화한 인터페이스 (PR/Linter/TestRunner)
- **WorkflowUI**: 워크플로우와 화면을 분리한 프레젠테이션 인터페이스

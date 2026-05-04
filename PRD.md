# PRD — Code Review Agent (pi-mono 기반)

> **상태**: v1.0 (MVP) Draft · **작성일**: 2026-05-04 · **참조 문서**: [PROJECT_PLAN.md](PROJECT_PLAN.md) (정본)

---

## 1. 한 줄 요약

**프로젝트의 코드 컨벤션을 자동 감지·강제하고, 없으면 기존 코드 기반으로 컨벤션을 추론해 적용한 뒤, 클린코드 옵션 3개 중 사용자가 고른 방향으로 리팩토링하고 PR까지 만드는 로컬 CLI 에이전트.**

---

## 2. 배경 & 문제 정의

### 2.1 문제

코드 리뷰 → 리팩토링 → PR 생성은 모든 개발 팀이 반복하는 작업이지만:

1. **컨벤션이 회사·프로젝트마다 다르다** — 일반 AI 도구(Copilot, Cursor)는 회사 룰을 모름
2. **컨벤션 문서가 없는 프로젝트가 많다** — 신규 입사자, 사이드 프로젝트, 초기 스타트업
3. **리팩토링은 항상 여러 옵션이 존재** — AI가 하나만 제안하면 사용자 선택권이 없음
4. **PR 작성은 단순 반복** — 매번 비슷한 템플릿

### 2.2 차별화 포인트 (Why us)

| 기존 도구             | 한계                       | 본 에이전트                              |
| --------------------- | -------------------------- | ---------------------------------------- |
| Copilot / Cursor      | 회사 컨벤션 모름           | 룰 파일 + 문서 + 코드 샘플링 3단 fallback |
| 일반 린터 (eslint 등) | 자동 수정만, 리팩토링 없음 | 린터 통과 + 클린코드 옵션 제시           |
| Claude Code           | 클로즈드, 확장 제한        | OSS, pi 패키지 형태로 자유 확장          |
| 직접 LLM 프롬프팅     | 매번 다시 설명             | 워크플로우가 skill로 고정됨              |

---

## 3. 목표 & 비목표

### 3.1 목표

1. **컨벤션 준수 리팩토링** — 프로젝트 컨벤션을 자동으로 감지하고 위반을 수정
2. **컨벤션 자동 생성** — 컨벤션이 없으면 기존 코드 기반으로 추론해 `CONVENTIONS.md` 초안 생성
3. **클린코드 옵션 제시** — 항상 서로 다른 트레이드오프의 3개 옵션 제공, 사용자가 선택
4. **PR 자동화** — 변경사항 → 브랜치 → PR을 한 번에, 단 dry-run 우선

### 3.2 비목표 (Non-Goals, v1.0 한정)

- 클라우드 SaaS / 호스팅 서비스
- IDE 통합 (VS Code, JetBrains)
- 자체 LLM 학습·호스팅 (모델은 pi-mono를 통해 외부 프로바이더 사용)
- 다중 파일 리팩토링 (단일 파일 위주)
- GitLab/Bitbucket 등 추가 호스팅 어댑터 (v1.0은 GitHub + noop 어댑터만 제공, **어댑터 레이어 자체는 v1.0 인프라에 포함**)
- 테스트 자동 실행·통합
- PR 인라인 코멘트 자동 게시

---

## 4. 타겟 사용자

### 4.1 ICP (Ideal Customer Profile)

**개인 개발자**와 **소규모 팀 개발자**를 동시에 지원. 분리하지 않는 이유: 두 그룹 모두 "컨벤션 강제 + 자동 생성" 가치 제안이 동일하게 적용됨.

### 4.2 페르소나

**페르소나 A — 개인 개발자 "지호"**
- 사이드 프로젝트 다수, 컨벤션 문서 없음
- 시간 없음 → 린터 설정도 귀찮음
- 니즈: "코드 5개 보고 알아서 컨벤션 정해서 적용해줘"

**페르소나 B — 팀 개발자 "민지"**
- 5–20명 스타트업, `.eslintrc` 있고 `CONVENTIONS.md`도 있음
- 신규 입사자가 컨벤션 자주 어김 → PR 리뷰 피로
- 니즈: "PR 올리기 전에 자동으로 컨벤션 맞춰주고, 리팩토링 옵션도 보여줘"

**페르소나 C — 신규 입사자 "현우"**
- 기존 코드베이스의 암묵적 컨벤션을 빠르게 익혀야 함
- 니즈: "내 코드가 이 회사 스타일에 맞는지 자동 검증"

---

## 5. 성공 지표 (Success Metrics)

"좋은 코드 만들기"를 측정 가능한 지표로 분해.

### 5.1 핵심 지표 (North Star 후보)

| 지표                  | 정의                                                | 목표 (v1.0 6개월) |
| --------------------- | --------------------------------------------------- | ----------------- |
| **컨벤션 준수율**     | 적용 후 `run_linter` exit code 0 비율               | ≥ 95%             |
| **옵션 채택률**       | 클린코드 옵션 A/B/C 중 하나를 선택한 세션 / 전체    | ≥ 60% (skip ≤40%) |
| **PR 생성 완료율**    | dry-run → confirm까지 도달한 세션 / `/review` 시작  | ≥ 50%             |

### 5.2 보조 지표

- 세션당 평균 린터 위반 감소 수 (before vs after)
- D7 retention (한 번 사용한 사용자가 7일 내 재사용)
- 컨벤션 자동 추론 모드(3단계) 발동 후 사용자 승인율

### 5.3 측정 방법

- pi 자체 세션 로그 활용 (§6.8 관측성과 연결)
- v1.0에서는 로컬 로그만, opt-in 텔레메트리는 v1.1+

---

## 6. 핵심 사용자 스토리

### US-1 — 컨벤션이 있는 프로젝트
> *팀 개발자로서, `.eslintrc.json`이 있는 프로젝트에서 `/review src/auth.ts`를 실행하면 ESLint 위반이 자동 수정되고, 남은 구조적 문제는 클린코드 옵션 3개로 제시되어, B 옵션을 선택하면 적용·검증·PR 생성까지 한 번에 끝나야 한다.*

### US-2 — 컨벤션이 없는 프로젝트
> *개인 개발자로서, 룰 파일도 `CONVENTIONS.md`도 없는 프로젝트에서 `/review`를 실행하면 에이전트가 코드 5개를 샘플링해 추론한 컨벤션(들여쓰기·따옴표·세미콜론·명명 규칙)을 보여주고, 내 승인을 받은 뒤 그 기준으로 리팩토링해야 한다.*

### US-3 — 컨벤션 문서 자동 생성
> *신규 입사자로서, `/review --emit-conventions`를 실행하면 추론된 컨벤션이 `CONVENTIONS.md` 초안으로 저장되어, 팀에 공유·검토 후 git에 커밋할 수 있어야 한다.*  *(stretch goal)*

### US-4 — 일상적 PR 흐름
> *팀 개발자로서, 작업 후 `git diff` 상태에서 `/pr`만 입력하면, 변경사항 요약 → 브랜치명 자동 제안 → 제목·본문 자동 생성 → dry-run 미리보기 → confirm → PR URL을 받아야 한다. 호스트는 `AGENTS.md`에서 자동 로드되어 묻지 않는다.*

### US-5 — 호스팅 CLI 미설치 (noop fallback)
> *개인 개발자로서, `gh`도 `glab`도 깔지 않은 환경에서 `/review`를 실행해도 **변경 적용·린터 재검증·diff 출력**은 100% 동작해야 한다. PR 생성 단계에서만 "도구가 없으니 PR은 직접 만드세요"라는 안내와 함께 브랜치명·커밋 메시지 후보를 받아야 한다.*

### US-6 — 호스트 일회성 오버라이드
> *팀 개발자로서, 평소 GitHub를 쓰지만 이번 한 번만 GitLab으로 보내고 싶을 때 `/pr --host=gitlab`로 영속화 없이 임시 변경할 수 있어야 한다.*

### US-7 — 첫 사용 시 호스트 자동 감지·영속화
> *처음 `/review`를 돌리면 에이전트가 `git remote`에서 GitHub를 감지해 "맞나요?"를 한 번만 묻고, 승인하면 `AGENTS.md`에 `pr_host: github`를 자동 저장해 다음부터 묻지 않아야 한다.*

---

## 7. 기능 요구사항 (Functional Requirements)

### 7.1 v1.0 MVP 범위 (필수)

PROJECT_PLAN.md §4의 현재 구현 = MVP. 아래는 acceptance 기준 형태로 정리.

#### FR-1. 컨벤션 감지 (`detect_conventions`)
- 1단계: 룰 파일 (`.eslintrc.*`, `pyproject.toml`, `.editorconfig` 등) 6개 언어 지원 (JS/TS, Python, Java, Kotlin, Go, Ruby)
- 2단계: 컨벤션 문서 (`CONVENTIONS.md`, `STYLE_GUIDE.md`, `AGENTS.md`)
- 3단계: 코드 5개 샘플링 추론 (들여쓰기, 따옴표, 세미콜론, 명명 규칙)
- 모노레포 대응: 프로젝트 루트부터 위로 거슬러 탐색
- **Acceptance**: 3단계 모두 단위 테스트 통과

#### FR-2. 린터 실행 (`run_linter`)
- 입력: linter 종류, mode (`check` | `fix`), targetPath
- 출력: 위반 수, stdout, exit code (정규화)
- **Acceptance**: ESLint, Ruff, golangci-lint 3종 환경에서 동작

#### FR-3. 클린코드 옵션 제시 (`present_cleancode_options`)
- 항상 정확히 3개 옵션 (ADR-002)
- 옵션 다양성: 추상화/패러다임/에러처리/상태/확장성 중 **2개 이상의 축**이 달라야 함
- 각 옵션은 6요소 포함: 이름 / 요약 / 미리보기 코드 / 장점 / 단점 / 권장 시나리오
- **Acceptance**: 동일 코드 입력 시 옵션 간 진단적 차이가 자동 검증되는 lint 룰 통과

#### FR-4. PR 생성 (`create_pull_request`) — 어댑터 라우터
- 입력: `branch, title, body, confirm, host?`
- 기본 dry-run, `confirm=true` 명시 시에만 실제 생성
- main/master 직접 푸시 차단 → 자동 새 브랜치 제안
- 어댑터 인터페이스 통일: `createPR({ branch, title, body, dryRun })`
- v1.0 어댑터: `adapter-github.js`, `adapter-noop.js`
- 호스팅 CLI 미설치 → **noop 어댑터 graceful degrade** (변경 적용 + diff 출력 + 브랜치/커밋 메시지 후보 제시)
- **Acceptance**: §4.5 검증 체크리스트 11개 항목 전부 통과

#### FR-5. PR 어댑터 라우팅 (4단 폴백 + 자동 영속화) — ADR-006
1. **CLI 플래그** (`--host=github` 등) — 즉시 사용, 영속화 없음 (일회성)
2. **AGENTS.md / config의 `pr_host`** — 즉시 사용, 무묵음
3. **`git remote` 자동 감지** (origin URL 도메인 파싱) — 첫 사용 시 한 번만 사용자에게 확인 → 승인 시 `AGENTS.md`에 자동 저장 → 이후 2번 경로로
4. **자동 감지 실패** (remote 없음 / 알 수 없는 도메인) — 사용자에게 명시 요청, 답을 `AGENTS.md`에 저장
- **충돌 처리**: `AGENTS.md` 설정과 `git remote`가 다르면 항상 사용자 확인
- **Acceptance**: 4단 각각 시나리오 테스트 + 충돌 케이스 1건 + Self-hosted Enterprise 도메인 케이스 1건 통과

#### FR-6. Skills 워크플로우
- `review` (전체 7단계), `cleancode` (옵션 제시까지), `pr` (PR만)
- 트리거: 자연어 또는 슬래시 명령
- **Acceptance**: 각 skill end-to-end 시연 가능

#### FR-7. 단축 명령어
- `/review {{target}}`, `/clean {{target}}`, `/pr [--host=...]`
- `/pr`의 `--host` 옵션은 영속화 없는 일회성 오버라이드 (FR-5 1단)

### 7.2 Out of MVP (v1.1+)

PROJECT_PLAN.md §6 항목 전체. 우선순위 제안 (사용자 피드백 후 확정):

| 우선순위 | 항목                                                               | 출처      |
| -------- | ------------------------------------------------------------------ | --------- |
| P0       | 테스트 통합 (적용 후 자동 실행)                                    | §6.1      |
| P0       | 롤백 메커니즘 (stash/임시 브랜치)                                  | §6.1      |
| P1       | `adapter-gitlab.js` 추가 (인터페이스만 준수, 라우터 변경 없음)     | §6.3      |
| P1       | 컨벤션 자동 학습 → `CONVENTIONS.md` 초안 생성                      | §6.4      |
| P2       | `adapter-bitbucket.js`, `adapter-gitea.js` 추가                    | §6.3      |
| P2       | PR 인라인 코멘트                                                   | §6.5      |
| P2       | 다중 파일 리팩토링                                                 | §6.6      |
| P3       | IDE 플러그인, 클라우드, eval                                       | §6.9      |

---

## 8. 비기능 요구사항 (NFR)

| 항목         | 요구사항                                                              |
| ------------ | --------------------------------------------------------------------- |
| 성능         | 컨벤션 감지 ≤ 3초 (디렉토리 깊이 4 제한, `node_modules` 제외)         |
| 보안         | extensions = 임의 코드 실행 → pi 정책 위임 + README 경고 명시         |
| 보안         | API 키는 환경변수만, 코드/로그에 절대 기록 금지                       |
| 신뢰성       | 모든 파괴적 동작(push, PR 생성, 파일 덮어쓰기)은 dry-run + confirm    |
| 신뢰성       | LLM 출력은 항상 코드 미리보기 동반 (말로만 설명 금지)                 |
| 호환성       | Node.js LTS, macOS / Linux 지원 (Windows는 best-effort)               |
| 배포         | npm 패키지 (`pi install`로 설치 가능)                                 |
| 라이선스     | MIT (OSS, 무료)                                                       |
| 모델 의존성  | 모델/프로바이더 무관 (Anthropic, OpenAI, Ollama 등 pi-mono가 처리)    |
| 모듈성       | PR 생성은 어댑터 인터페이스(`createPR`)로 분리, 코어는 호스팅 무관 (ADR-005) |
| Graceful degrade | 호스팅 CLI 미설치 시 noop 어댑터로 변경 적용·diff까지 보장 (코어 가치 유지) |

---

## 9. 시스템 설계 요약

> 상세는 [PROJECT_PLAN.md §3](PROJECT_PLAN.md) 참조.

```
사용자 ──(자연어 / /review)── pi-mono (LLM + 4개 기본 툴)
                                  │
                                  ▼
                     code-review-agent 패키지
                       ├─ AGENTS.md          (역할 + 컨벤션 감지 규칙 + pr_host)
                       ├─ skills/            (review, cleancode, pr)
                       ├─ extensions/
                       │   ├─ detect-conventions.js
                       │   ├─ run-linter.js
                       │   ├─ present-cleancode-options.js
                       │   └─ pr/            ← PR 어댑터 레이어 (ADR-005)
                       │       ├─ index.js          (라우터, 4단 폴백)
                       │       ├─ adapter-github.js (gh CLI 래핑)
                       │       └─ adapter-noop.js   (CLI 미설치 fallback)
                       └─ prompts/           (/review, /clean, /pr)
```

**리팩토링 코어 ↔ PR 어댑터 분리**:

```
[리팩토링 코어] ── 독립 ──> 사용자에게 변경 적용 완료
                              ↓ (선택)
                         [PR 어댑터: gh / glab / bb / noop]
```

리팩토링은 PR 없이도 완결됨. gh/glab가 없어도 변경 적용 + diff까지 100% 동작 (US-5).

**핵심 설계 결정 (ADR — PROJECT_PLAN.md §7 참조)**:
- ADR-001: 베이스는 pi-coding-agent (→ pi-mono)
- ADR-002: 클린코드 옵션은 정확히 3개
- ADR-003: PR 생성은 dry-run 우선
- ADR-004: 컨벤션은 프로젝트 파일에 (별도 서버 없음)
- **ADR-005: PR 생성은 어댑터 패턴으로 코어와 분리** (호스팅 무관 + graceful degrade)
- **ADR-006: PR 어댑터 라우팅은 4단 폴백 + 자동 영속화** (마찰과 안전의 균형)

**아키텍처 원칙 5가지** (PROJECT_PLAN.md §2.2):
1. pi는 건드리지 않는다 (패키지 형태로만 확장)
2. 로컬 우선 (외부 서비스 의존 최소)
3. 사용자 승인 필수 (push/PR은 dry-run)
4. 컨벤션은 코드 옆에 (별도 서버 없음)
5. **호스팅 비종속** (PR 생성은 어댑터로 분리, 코어는 호스팅을 모름)

---

## 10. 마일스톤 (제안 — 사용자 확인 필요)

> 체크리스트 번호는 [PROJECT_PLAN.md §4.5](PROJECT_PLAN.md) 11개 항목 기준.

| 단계  | 내용                                                          | 완료 기준                                            |
| ----- | ------------------------------------------------------------- | ---------------------------------------------------- |
| **M1** | 샘플 TS 프로젝트 end-to-end                                  | §4.5 체크리스트 1, 3, 4 통과                         |
| **M2** | 샘플 Python 프로젝트 end-to-end                              | §4.5 체크리스트 2 통과                               |
| **M3** | 컨벤션 3단계 fallback 전부 검증                               | §4.5 체크리스트 5 통과                               |
| **M4** | PR dry-run/confirm + 안전 가드                                | §4.5 체크리스트 6 통과                               |
| **M5** | **PR 어댑터 라우팅 4단 폴백 + 영속화 + 충돌 처리 검증**       | §4.5 체크리스트 7, 8, 9 통과                         |
| **M6** | **noop 어댑터 graceful degrade 검증**                         | §4.5 체크리스트 10 통과                              |
| **M7** | 잘못된 옵션 선택 fallback                                     | §4.5 체크리스트 11 통과                              |
| **M8** | 동료 1명 시연 + 피드백 수집                                   | 정성 피드백 5건 이상                                 |
| **M9** | 사내 npm registry 배포 (또는 git URL 공유)                    | 외부 사용자 1명이 자력 설치·실행 성공                |

---

## 11. 리스크 & 완화

> 상세 표는 [PROJECT_PLAN.md §5](PROJECT_PLAN.md) 참조. PRD 관점 핵심 리스크만 요약.

| 리스크                                                  | 완화                                                                |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| LLM이 잘못된 코드 생성 → 신뢰 무너짐                   | git diff 강제 확인 + 린터 재검증 + 롤백(P0)                          |
| 회사 컨벤션이 너무 특이함                               | 3단 fallback + 사용자 검토·승인 단계                                |
| 옵션 3개 모두 별로                                      | "skip" 옵션 + 추가 옵션 요청 핸들링                                 |
| **gh/glab CLI 미설치/인증 실패**                        | **noop 어댑터로 graceful degrade — 변경 적용·diff는 보장 (US-5)**   |
| **Self-hosted GitHub Enterprise 도메인 미감지**         | **라우팅 4단(사용자 명시 요청) → AGENTS.md 영속화로 자연 해결**     |
| 보안: extensions 임의 코드 실행                         | pi 정책 위임 + 설치 시 사용자 동의 + README 경고                    |
| BYOK 비용 부담                                          | 모델 선택 가이드 + 토큰 사용 리포트(§6.8)                           |

---

## 12. Open Questions / TBD

PRD 확정 전 / v1.1 진입 전에 답이 필요한 항목.

1. **수익 모델 재검토 시점** — v1.0은 무료 OSS 확정. 사용자 100명 / 별 200개 도달 시 Pro tier 검토할지?
2. **모델 default 권장사항** — pi-mono가 모델 무관이지만 첫 사용자 경험을 위해 README에서 어떤 모델을 추천할지? (Claude Sonnet? GPT-4? Ollama?)
3. **비용 가이드라인** — "리뷰 1회당 토큰 X 이하" 같은 목표선이 필요한지?
4. **컨벤션 추론 신뢰도** — 3단계 fallback에서 코드 5개 샘플링이 충분한지? 동적 조정 필요?
5. **텔레메트리** — 옵션 채택률 같은 지표를 수집하려면 opt-in 텔레메트리가 필요. v1.x에 추가할지?
6. **Windows 지원 정책** — best-effort로 두는 게 맞는지, 명시적으로 비지원으로 할지?

---

## 부록 A — 용어 정리

- **pi-mono**: 본 에이전트가 올라가는 베이스 CLI 에이전트 (구 pi-coding-agent)
- **Skill**: LLM에게 "언제·어떻게" 행동할지 알려주는 마크다운 절차서
- **Extension**: LLM이 호출하는 실행 가능한 커스텀 툴 (JS 파일)
- **Prompt**: 사용자용 단축 명령어 (`/review`, `/clean`, `/pr`)
- **3단 fallback (컨벤션)**: 컨벤션 감지 우선순위 (룰 파일 → 문서 → 코드 샘플링)
- **PR 어댑터**: PR 생성을 호스팅별로 분리한 모듈 (`adapter-github.js`, `adapter-gitlab.js`, `adapter-noop.js` 등). 인터페이스 동일: `createPR({ branch, title, body, dryRun })`
- **noop fallback**: 호스팅 CLI 미설치 시 변경 적용 + diff 출력만 하는 graceful degrade 어댑터
- **4단 라우팅 (PR 어댑터)**: CLI 플래그 → AGENTS.md 설정 → git remote 자동 감지(첫 회 확인 후 영속화) → 사용자 질의
- **BYOK**: Bring Your Own Key (사용자가 자기 LLM API 키를 가져옴)

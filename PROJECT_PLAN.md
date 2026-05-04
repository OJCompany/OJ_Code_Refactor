# Code Review Agent — 프로젝트 계획서

> `pi-coding-agent` 위에서 동작하는 코드 리뷰 / 리팩토링 / PR 자동화 AI 에이전트

---

## 1. 배경 & 목표

### 1.1 문제 정의

코드 리뷰 → 리팩토링 → PR 생성은 모든 개발 팀이 반복하는 작업이지만:

- **컨벤션이 회사마다 다르다** → 일반적인 AI 도구(Copilot, Cursor)는 회사 룰을 모름
- **리팩토링 옵션은 항상 여러 개 존재** → AI가 하나만 제안하면 사용자 선택권이 없음
- **PR 작성은 단순 반복** → 매번 비슷한 템플릿 채우기

### 1.2 목표

**한 줄 목표**: 회사별 컨벤션을 자동 학습하고, 클린코드 옵션을 사용자가 선택하고, PR까지 한 번에 만드는 로컬 에이전트

**핵심 워크플로우**:
```
코드 분석 → 컨벤션 자동 수정 → 클린코드 옵션 3개 → 사용자 선택 → PR 생성
```

### 1.3 비목표 (Non-goals)

- 클라우드 SaaS (로컬 우선)
- IDE 통합 (지금은 CLI만)
- 자체 LLM 호스팅 (pi가 알아서 처리)

---

## 2. 기술 선택 근거

### 2.1 왜 pi-coding-agent?

| 후보 | 장점 | 단점 | 채택 |
|---|---|---|---|
| **pi-coding-agent** | 미니멀, 확장성 ↑, OSS, 모델 무관 | 생태계 작음 | ✅ |
| Claude Code | 강력함, 공식 | 클로즈드, 확장 제한 | ❌ |
| 직접 구현 (Pydantic AI) | 풀 컨트롤 | 보일러플레이트 많음 | ❌ |
| LangChain/LangGraph | 생태계 큼 | 무거움, 추상화 과잉 | ❌ |

**pi 선택 이유**:
- read/write/edit/bash 4개 툴 + skills/extensions 구조 → 우리가 만들 게 명확함
- 모델/프로바이더 무관 → Anthropic, OpenAI, Ollama 모두 OK
- 프로젝트별 `AGENTS.md` 자동 로드 → 회사별 컨벤션과 자연스럽게 연결
- npm 패키지로 배포 가능 → 팀 단위 공유 쉬움

### 2.2 아키텍처 원칙

1. **pi는 건드리지 않는다** — 패키지 형태로만 확장
2. **로컬 우선** — 외부 서비스 의존 최소화 (gh CLI 빼고)
3. **사용자 승인 필수** — push/PR 생성은 항상 dry-run 먼저
4. **컨벤션은 코드 옆에** — 별도 설정 서버 없이 프로젝트 파일로
5. **호스팅 비종속** — PR 생성은 어댑터로 분리, 코어는 호스팅을 모름

---

## 3. 시스템 설계

### 3.1 전체 구조

```
사용자
  ↓ (자연어 또는 /review)
pi-coding-agent (LLM + 4개 기본 툴)
  ↓ (skills + extensions 로드)
code-review-agent 패키지
  ├─ AGENTS.md ............... 에이전트 역할 + 컨벤션 감지 규칙 + pr_host 설정
  ├─ skills/ ................. 워크플로우 절차서
  │   ├─ review/SKILL.md ..... 전체 흐름
  │   ├─ cleancode/SKILL.md .. 옵션 제시만
  │   └─ pr/SKILL.md ......... PR 생성만
  ├─ extensions/ ............. 커스텀 툴 (실행 가능 코드)
  │   ├─ detect-conventions.js
  │   ├─ run-linter.js
  │   ├─ present-cleancode-options.js
  │   └─ pr/ ................. PR 어댑터 레이어
  │       ├─ index.js ........ 라우터 (어댑터 선택 로직)
  │       ├─ adapter-github.js  (gh CLI 래핑)
  │       ├─ adapter-gitlab.js  (glab CLI 래핑, 향후)
  │       └─ adapter-noop.js .. 호스팅 도구 미설치 시 fallback (diff 출력만)
  └─ prompts/ ................ 단축 명령어
      ├─ review.md
      ├─ clean.md
      └─ pr.md
```

**리팩토링 코어와 PR 어댑터의 분리**:

리팩토링은 PR 없이도 완결됩니다. gh/glab가 없어도 사용자는 변경 적용 + diff까지 100% 받습니다. PR 생성은 어댑터 레이어가 책임지며, 호스팅이 추가되면 어댑터만 늘리면 됩니다.

```
[리팩토링 코어] ──독립──> 사용자에게 변경 적용 완료
                            ↓ (선택)
                       [PR 어댑터: gh / glab / bb / noop]
```

**PR 어댑터 라우팅 규칙** (4단 폴백):

```
1. CLI 플래그 (--host=github 등)
   → 즉시 사용, 영속화 X (일회성 오버라이드)

2. AGENTS.md / config의 명시된 호스트 (pr_host: github)
   → 즉시 사용, 무묵음

3. git remote 자동 감지 (origin URL의 도메인 파싱)
   → 사용자에게 첫 사용 시 한 번만 확인
   → 승인 시 AGENTS.md에 자동 저장 → 이후 2번 경로로 빠져 무묵음

4. 자동 감지 실패 (remote 없음 또는 알 수 없는 도메인)
   → 사용자에게 명시 요청
   → 답을 AGENTS.md에 저장

추가 안전: 어떤 경로든 PR 생성 직전에 dry-run 미리보기 (ADR-003)
충돌 처리: AGENTS.md 설정과 git remote가 다르면 항상 사용자에게 확인
```

### 3.2 컨벤션 감지 전략 (3단 fallback)

회사마다 컨벤션이 다른 문제를 다음 우선순위로 해결:

**1단계: 명시적 룰 파일** (가장 정확)

| 언어 | 탐지 파일 | 자동 수정 명령 |
|---|---|---|
| JS/TS | `.eslintrc.*`, `biome.json`, `.prettierrc*` | `eslint --fix .` 등 |
| Python | `pyproject.toml`, `.ruff.toml`, `.flake8` | `ruff check --fix .` |
| Java | `checkstyle.xml`, `.editorconfig` | (수동) |
| Kotlin | `.editorconfig` | `ktlint --format` |
| Go | `.golangci.yml` | `golangci-lint run --fix` |
| Ruby | `.rubocop.yml` | `rubocop -a` |

→ 프로젝트 루트부터 위로 거슬러 탐색 (모노레포 대응)

**2단계: 컨벤션 문서**
- `CONVENTIONS.md`, `STYLE_GUIDE.md`, `.code-conventions/`
- `AGENTS.md`의 "Conventions" 섹션 → pi가 시스템 프롬프트에 자동 포함

**3단계: 암묵적 추론**
- 룰 파일/문서 모두 없으면 코드 5개 샘플링
- 들여쓰기 (탭/2/4 스페이스), 따옴표(' vs "), 세미콜론 사용 여부 등 추출
- 결과를 사용자에게 보고하고 진행 여부 확인

### 3.3 클린코드 옵션 — "3개"의 의미

단순히 "보수적/중간/공격적" 강도 차이가 아니라, **서로 다른 축의 트레이드오프**여야 함.

**옵션 다양성 가이드라인** (적어도 2개 축은 달라야 함):

| 축 | 양 끝 |
|---|---|
| **추상화 레벨** | 인라인 ↔ 함수분해 ↔ 클래스/모듈 |
| **패러다임** | 명령형 ↔ 함수형 (map/filter) ↔ OOP 패턴 |
| **에러 처리** | 예외 ↔ Result 타입 ↔ early return |
| **상태 관리** | 가변 ↔ 불변 ↔ 외부화 |
| **확장성 vs 단순성** | YAGNI ↔ 미래 대비 |

**예시 — 긴 함수 리팩토링**:
- 옵션 A: 헬퍼 함수 3개로 분리 (단순, 즉시 효과)
- 옵션 B: 파이프라인 함수 합성 (가독성 ↑, 함수형)
- 옵션 C: Step 객체 + Strategy 패턴 (확장성 ↑, 오버엔지니어링 위험)

각 옵션은 반드시 다음 6요소 포함: 이름 / 요약 / 미리보기 코드 / 장점 / 단점 / 권장 시나리오

### 3.4 안전 장치

**파괴적 동작 보호**:
- `git push`, `gh pr create` → 기본 dry-run, `confirm=true` 명시 필요
- 자동 수정 적용 후 `git diff` 보여주고 진행 여부 재확인
- main/master 브랜치에 직접 푸시 금지 (자동으로 새 브랜치 제안)

**LLM 환각 방지**:
- 클린코드 옵션은 반드시 코드 미리보기 포함 (말로만 설명 X)
- 적용 후 다시 린터 통과 확인

---

## 4. 만든 것 (현재 상태)

### 4.1 Extensions (커스텀 툴 4개)

LLM이 호출할 수 있는 실제 실행 가능한 코드.

| 툴 | 입력 | 출력 | 책임 |
|---|---|---|---|
| `detect_conventions` | cwd | 언어/린터/룰파일/추론결과 | 컨벤션 자동 감지 (3단 fallback) |
| `run_linter` | linter, mode (check/fix), targetPath | 위반 수, stdout, exit code | 린터 실행 + 결과 정규화 |
| `present_cleancode_options` | 3개 옵션 객체 | 포맷된 텍스트 + 선택 대기 | 옵션 제시 + 사용자 선택 받기 |
| `create_pull_request` | branch, title, body, confirm, host? | PR URL 또는 dry-run 미리보기 | 어댑터 라우터 (gh/glab/noop), 안전 가드 |

`create_pull_request`는 §3.1의 라우팅 규칙에 따라 적절한 어댑터를 선택하고 위임합니다. 어댑터 인터페이스는 모두 동일:

```js
// extensions/pr/adapter-{github,gitlab,noop}.js
export async function createPR({ branch, title, body, dryRun }) { ... }
```

### 4.2 Skills (워크플로우 절차서 3개)

LLM에게 "언제 / 어떻게" 행동할지 알려주는 마크다운 문서.

| 스킬 | 트리거 | 단계 |
|---|---|---|
| `review` | "코드 리뷰", "/skill:review" | 7단계 풀 워크플로우 |
| `cleancode` | "클린코드", "/skill:cleancode" | 옵션 제시까지만 |
| `pr` | "PR 올려", "/skill:pr" | PR 생성만 |

### 4.3 Prompts (단축 명령어 3개)

자주 쓰는 명령을 짧게.

| 명령 | 매개변수 | 효과 |
|---|---|---|
| `/review` | `{{target}}` | 전체 워크플로우 시작 |
| `/clean` | `{{target}}` | 클린코드 옵션만 |
| `/pr` | (없음, `--host` 옵션) | 현재 변경사항으로 PR |

### 4.4 사용자 경험

**첫 사용 (Onboarding)**:

```
$ npm install -g @mariozechner/pi-coding-agent
$ export ANTHROPIC_API_KEY=...
$ cd my-company-project
$ pi install /path/to/code-review-agent -l
$ pi
> /review
> 대상: src/auth.ts

[감지됨] typescript(eslint via .eslintrc.json) | 추가 문서: CONVENTIONS.md
✓ ESLint 자동 수정: 12개 위반 처리
✓ 남은 문제: 함수 너무 김 (validateUser, 80줄)

📋 클린코드 옵션:
▶ 옵션 A: 헬퍼 함수 3개로 분리 ...
▶ 옵션 B: 파이프라인 함수 합성 ...
▶ 옵션 C: Validator 클래스 + Strategy 패턴 ...

👉 어떤 옵션? (A / B / C / skip)
> B

✓ 옵션 B 적용 완료 / 린터 재검증 통과

🔍 git remote에서 GitHub를 감지했어요. 맞나요? (y/n)
   맞으면 AGENTS.md에 저장해서 다음부터 안 물을게요.
> y
✓ AGENTS.md에 pr_host: github 저장됨

🚀 PR 미리보기 (dry-run):
  브랜치: refactor/validate-user
  제목: refactor: simplify validateUser with pipeline composition
  ...

진행할까요? (yes/no)
> yes

✓ PR 생성됨: https://github.com/.../pull/123
```

**호스팅 도구 미설치 시 (noop fallback)**:

```
✓ 옵션 B 적용 완료 / 린터 재검증 통과

⚠️ gh CLI를 찾을 수 없어요. 변경은 적용되었고, diff를 출력합니다.
   PR은 직접 만들어주세요. (또는 brew install gh 후 /pr 재실행)

[diff 출력]
브랜치 후보: refactor/validate-user
커밋 메시지 후보: refactor: simplify validateUser with pipeline composition
```

**매일 사용 (반복 흐름)**:

```
$ git diff   # 작업 후
$ pi
> /pr        # 변경사항으로 바로 PR (호스트는 AGENTS.md에서 자동 로드)
```

**일회성 오버라이드**:

```
> /pr --host=gitlab   # 이번만 GitLab으로 (영속화 X)
```

### 4.5 검증 체크리스트

지금 만든 것이 실제로 동작하는지 확인할 항목:

- [ ] 샘플 TS 프로젝트에서 end-to-end 동작 확인
- [ ] 샘플 Python 프로젝트에서 end-to-end 동작 확인
- [ ] 컨벤션 감지 1단계 (룰 파일) 테스트
- [ ] 컨벤션 감지 2단계 (CONVENTIONS.md) 테스트
- [ ] 컨벤션 감지 3단계 (코드 샘플링) 테스트
- [ ] PR dry-run → confirm 흐름 테스트
- [ ] 어댑터 라우팅 1~4단 폴백 각각 테스트
- [ ] AGENTS.md 자동 영속화 동작 확인
- [ ] 설정 vs git remote 충돌 시 사용자 확인 동작
- [ ] gh CLI 미설치 시 noop 어댑터 fallback 메시지
- [ ] 잘못된 옵션 선택 시 fallback 동작

---

## 5. 리스크 & 대응

| 리스크 | 발생 가능성 | 영향 | 대응 |
|---|---|---|---|
| LLM이 잘못된 코드 생성 | 높음 | 중 | 적용 전 git diff 확인, 린터 재검증, 테스트 통합(확장) |
| 회사 컨벤션이 너무 특이함 | 중 | 중 | `CONVENTIONS.md` 문서로 fallback, 코드 샘플링으로 학습 |
| gh/glab CLI 미설치/인증 실패 | 높음 | 낮 | noop 어댑터로 graceful degrade, 명확한 안내 |
| Self-hosted GitHub Enterprise 도메인 미감지 | 중 | 낮 | 라우팅 4단 (사용자 명시 요청)으로 자연 해결 |
| 큰 코드베이스에서 컨벤션 감지 느림 | 낮음 | 낮 | 디렉토리 깊이 4 제한, node_modules 제외 |
| 사용자가 옵션 셋 모두 별로라고 함 | 중 | 낮 | "skip" 또는 추가 옵션 요청 처리 |
| 보안: extensions가 임의 코드 실행 | 높음 | 높 | pi 자체 정책 위임 + README 경고 |

---

## 6. 향후 확장 계획

### 6.1 신뢰성 강화

**테스트 통합**
- 클린코드 적용 후 자동으로 테스트 스위트 실행
- 테스트 실패 → PR 생성 차단
- 언어별 테스트 명령 자동 감지 (`npm test`, `pytest`, `go test` 등)
- `pre-commit` 훅 연동 (있으면 활용)

**롤백 메커니즘**
- 적용 전 자동 stash 또는 임시 브랜치 생성
- 사용자가 "되돌리기" 한마디로 이전 상태 복구
- 적용 이력 로그

### 6.2 사용자 경험 개선

**인터랙티브 UI**
- pi extension의 editor 교체 기능 활용
- 옵션 선택을 키보드 화살표로 (지금은 텍스트 답변)
- 코드 diff syntax highlighting
- 옵션 미리보기 사이드바이사이드 비교

**더 똑똑한 옵션 생성**
- 코드베이스의 기존 패턴을 학습해서 옵션에 반영
  - 예: 다른 파일에서 함수형 스타일을 많이 쓰면 옵션 B를 강조
- 옵션이 4개 이상 필요한 경우 추가 옵션 요청 처리
- 사용자가 "이 옵션 + 저 옵션 섞어서" 같은 하이브리드 요청 처리

### 6.3 Git 호스팅 다양화

어댑터 구조가 §3.1에 이미 박혀 있으므로 **새 어댑터 파일 하나 추가**만 하면 끝.

| 호스팅 | 어댑터 파일 | 우선순위 |
|---|---|---|
| GitHub | `adapter-github.js` (구현됨) | ✅ |
| GitLab | `adapter-gitlab.js` | 높음 |
| Bitbucket | `adapter-bitbucket.js` | 중 |
| Self-hosted GitHub Enterprise | `adapter-github.js` 재사용 (URL 설정만) | 낮음 |
| Gitea | `adapter-gitea.js` (REST API) | 낮음 |

각 어댑터는 동일한 `createPR({ branch, title, body, dryRun })` 인터페이스 준수. 라우터(§3.1)는 변경 없음.

### 6.4 컨벤션 자동 학습

**현재**: 룰 파일 / 문서 / 샘플링 중 하나에 의존

**확장 방향**:
- 코드베이스 패턴 추출 → `CONVENTIONS.md` 자동 초안 생성
  - 명명 규칙 (snake_case vs camelCase 빈도)
  - 함수 평균 길이
  - 자주 쓰는 디자인 패턴
  - import 정렬 방식
- 과거 PR 리뷰 코멘트 분석 → 자주 지적되는 패턴 인식
- 신규 입사자에게 "이 회사는 이렇게 코딩해요" 자동 가이드 생성

### 6.5 PR 코멘트 자동 게시

지금은 PR을 "만들기만". 확장 시:
- AI 리뷰 결과를 PR 코멘트로 직접 게시
- 라인별 코멘트 (GitHub `suggestion` 블록 포함)
- CI에서 호출 가능한 모드 (`pi --print --skill review`)
- "이 PR 다시 봐줘" 명령으로 재리뷰

### 6.6 다중 파일 리팩토링

지금은 단일 파일 위주. 확장 시:
- 여러 파일에 걸친 변경 (rename, 함수 이동)
- 의존성 영향 분석 (이 함수 시그니처를 바꾸면 어디가 영향받나)
- 테스트 자동 업데이트 (시그니처 바꾸면 테스트도 같이)

### 6.7 팀 단위 배포

**시나리오**: 한 회사 안에서 여러 팀이 같은 컨벤션을 공유하고 싶음.

- 사내 npm registry에 패키지 배포 (`@company/conventions-pi-package`)
- 신규 입사자 온보딩 시 자동 설치 스크립트
- 컨벤션 변경 시 마이그레이션 가이드 자동 생성
- 팀별 / 프로젝트별 오버라이드 지원

### 6.8 관측성

지금은 동작만 함. 사용 통계 수집:
- 세션 로깅 (이미 pi가 함, 활용)
- 토큰 사용량 / 비용 리포트
- 옵션 선택 통계 (A/B/C 중 어떤 게 자주 선택되는지)
- 어떤 컨벤션 위반이 자주 발생하는지 → 팀 교육 자료로

### 6.9 더 먼 미래

- **IDE 플러그인** — VS Code extension에서 pi 호출
- **클라우드 모드** — CI 통합, PR 열릴 때 자동 리뷰
- **멀티 에이전트** — 리뷰어 / 리팩토러 / 검증자 분리
- **자체 평가 (eval)** — 같은 코드를 여러 모델에 돌려 비교, 어떤 모델이 우리 회사 컨벤션을 잘 이해하는지 측정

---

## 7. 의사결정 기록 (ADR)

> 나중에 "왜 이렇게 했더라?" 안 까먹기 위해

### ADR-001: pi-coding-agent를 베이스로 선택
- **상태**: 결정됨
- **이유**: 미니멀 + 확장성 + 모델 무관 + npm 배포 용이
- **대안**: Claude Code (클로즈드), 직접 구현 (보일러플레이트 과다)
- **결과**: pi 패키지 형태로 모든 기능 구현

### ADR-002: 옵션 개수는 3개로 고정
- **상태**: 결정됨
- **이유**: 1개 = 강요, 2개 = 단순 비교, 3개 = 트레이드오프 인식 강제, 4+ = 의사결정 피로
- **결과**: skill prompt에 "정확히 3개" 명시

### ADR-003: PR 생성은 dry-run 우선
- **상태**: 결정됨
- **이유**: 외부 영향 명령은 사용자 명시 승인 필수
- **대안**: 모든 동작 자동 → 신뢰 사고 위험
- **결과**: `confirm=true` 안 주면 미리보기만

### ADR-004: 컨벤션은 프로젝트 파일에
- **상태**: 결정됨
- **이유**: 별도 설정 서버 없이 git에 같이 들어감 → 컨벤션 변경 추적 가능
- **대안**: 중앙 설정 서비스 → 인프라 부담
- **결과**: `.eslintrc`, `CONVENTIONS.md`, `AGENTS.md` 활용

### ADR-005: PR 생성은 어댑터 패턴으로 코어와 분리
- **상태**: 결정됨
- **이유**: 리팩토링 가치는 호스팅과 독립이어야 함. gh가 깨지거나 미설치여도 리팩토링은 동작해야 하고, GitLab/Bitbucket 사용자도 진입 가능해야 함.
- **대안**: GitHub 강결합 (지금 막힘), PR 기능 제거 (UX 단절)
- **결과**: `extensions/pr/`에 어댑터 분리, 코어는 `create_pull_request` 단일 인터페이스만 호출

### ADR-006: PR 어댑터 라우팅은 4단 폴백 + 자동 영속화
- **상태**: 결정됨
- **이유**: 자동 감지만 쓰면 self-hosted/엔터프라이즈에서 깨짐. 매번 묻기만 하면 마찰. → "한 번 묻고 저장"이 안전과 마찰의 균형점.
- **대안**: 100% 자동 (위험), 100% 명시 설정 강제 (마찰)
- **결과**: CLI 플래그 → AGENTS.md → git remote 감지(첫 회 확인 후 영속화) → 사용자 질의 순서. 설정-remote 충돌 시 항상 확인.

---

## 8. 다음 액션

**먼저**:
1. 샘플 TypeScript 프로젝트에 설치해서 end-to-end 테스트
2. 샘플 Python 프로젝트로 동일 테스트
3. 어댑터 라우팅 4단 폴백 각각 검증 (특히 noop, 충돌 케이스)
4. 발견된 버그/이슈 정리

**그 다음**:
5. 첫 외부 사용자(동료) 1명에게 시연 → 피드백 수집
6. 위 §6 확장 항목 중 가장 아쉬웠던 것부터 우선순위
7. 사내 npm registry에 배포 (또는 git URL 공유)

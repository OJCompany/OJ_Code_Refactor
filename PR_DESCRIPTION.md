# feat(cli): Tidy Refactoring Engine MVP

## 개요

TypeScript 파일의 코드 스멜을 AST로 탐지하고, Claude CLI를 통해 **기존 로직을 해치지 않는 최소 변경 리팩토링**을 자동 적용하는 CLI 엔진입니다.

```bash
node src/index.ts <파일경로>
```

---

## 변경 사항

### 핵심 흐름

```
detect (AST) → generate (Claude CLI) → format (diff 출력) → apply → tsc 검증
```

### 추가된 파일

| 파일 | 역할 |
|---|---|
| `src/types.ts` | 공유 타입 정의 (`DetectResult`, `RefactoringOption`, `ApplyResult`) |
| `src/detect.ts` | TypeScript Compiler API로 `any` 타입 위치 탐지 |
| `src/detectNesting.ts` | 깊이 3 이상 중첩 조건문 탐지 |
| `src/generate.ts` | Claude CLI subprocess로 tidy 리팩토링 생성 |
| `src/apply.ts` | `.bak` 백업 후 파일 덮어쓰기 |
| `src/format.ts` | 파일 전체 기준 컬러 diff 터미널 출력 |
| `src/metrics.ts` | 복잡도 / 라인 수 / 최대 중첩 깊이 측정 |
| `src/index.ts` | CLI 진입점 — 전체 흐름 오케스트레이션 |
| `src/catalog.ts` | detect + generate + apply 래퍼 (확장용) |

### 주요 설계 결정

**1. API 키 없음 — Claude CLI subprocess 사용**
`@anthropic-ai/sdk` 대신 `claude -p --output-format text`를 subprocess로 호출합니다. Claude Max 구독 인증을 그대로 사용하므로 별도 API 키가 불필요합니다.

**2. any → nesting fallback**
`any` 타입이 없으면 중첩 조건문 탐지로 자동 전환합니다. 두 탐지기 모두 이슈가 없을 때만 종료합니다.

**3. tsc 검증 + 자동 복구**
리팩토링 적용 후 `tsc --noEmit`으로 컴파일 검증합니다. 실패 시 `.bak`에서 원본을 복구하고 오류를 출력합니다.

**4. 최소 변경 원칙 프롬프트**
LLM에 "타입 어노테이션만 변경, 로직/변수명/구조 건드리지 말 것"을 명시합니다.

---

## 테스트 Fixtures

`fixtures/` 폴더에 실제 같은 `any` 남발 코드 3종 추가:

| 파일 | 설명 | `any` 수 |
|---|---|---|
| `fixtures/api-response.ts` | fetch 응답 파싱, 프로필 변환 | 14개 |
| `fixtures/event-handler.ts` | 이벤트 버스, click/submit 핸들러 | 13개 |
| `fixtures/utils.ts` | deepClone, groupBy, sortBy 유틸 | 14개 |

### 실행 예시

```
감지: fixtures/api-response.ts — any 타입 14건
Tidy 리팩토링 생성 중...

════════════════════════════════════════════════════
Tidy 리팩토링 결과
요약  any 14개를 최소 변경으로 타입 교체
트레이드오프  기존 로직 유지. 최소 변경으로 any를 가장 구체적인 타입으로 교체.
복잡도 5→5  라인 28→41  중첩 1→1

--- before   +++ after
@@ -1,32 +1,48 @@
-async function fetchUser(id: string): Promise<any> {
+interface RawUser { name?: string; age: string; roles?: string[]; }
+async function fetchUser(id: string): Promise<RawUser> {
 ...
════════════════════════════════════════════════════

tsc 검증 중... 통과
완료: fixtures/api-response.ts
백업: fixtures/api-response.ts.bak
```

---

## 체크리스트

- [x] AST 기반 `any` 탐지 (`src/detect.ts`)
- [x] AST 기반 중첩 조건문 탐지 (`src/detectNesting.ts`)
- [x] Claude CLI subprocess — API 키 불필요
- [x] 파일 전체 기준 컬러 diff 출력
- [x] tsc 검증 + 실패 시 자동 복구
- [x] any 없을 때 nesting으로 자동 fallback
- [x] 복잡도 / 라인 / 중첩 메트릭 before→after 표시
- [x] 3종 테스트 fixture 추가

## 리뷰 포인트

- `generate.ts`의 `extractTypeScript()` — LLM 응답에서 TS 코드만 추출하는 파싱 로직 견고성
- `tscCheck()` 에서 `--strict` 플래그 적용 여부 (현재 적용 중, 너무 엄격할 수 있음)
- `catalog.ts`는 현재 미사용 — 추후 다중 전략 선택 흐름 복원 시 사용 예정

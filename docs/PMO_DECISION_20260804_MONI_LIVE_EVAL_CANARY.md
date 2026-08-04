# PMO DECISION — MONI Live Evaluation Canary

- 결정일: 2026-08-04
- 승인 주체: GPT(PMO)
- 상태: Production 승인 완료
- 목적: 사용자 브라우저 로그인에 의존하지 않고 운영 Agent의 실제 모델 실행을 안전하게 수용검사한다.

## 1. 배경

관리자용 실모델 평가 화면은 구축됐지만 GPT(PMO) 세션은 MONI 브라우저 로그인 쿠키를 보유하지 않는다. 관리자 세션을 임의 생성하거나 기존 계정 비밀번호를 사용하는 방식은 인증 우회가 되므로 금지한다.

PMO 도구 환경은 외부 URL에 POST 본문을 전송할 수 없으므로, 동일한 1회용 토큰 검증을 사용하는 짧은 만료시간의 capability URL을 사용한다. 이 URL은 일반 인증을 대신하는 장기 자격증명이 아니라 안전한 평가 한 건만 실행하는 일회성 권한이다.

## 2. 확정 구조

1. 카나리 요청은 Supabase service role로만 생성한다.
2. 호출자는 256비트 이상의 일회용 토큰을 보유한다.
3. DB에는 원문 토큰이 아니라 SHA-256 해시만 저장한다.
4. 실행 사례는 호출 요청이 아니라 DB 요청행의 `case_id`로 결정한다.
5. 카나리는 `LIVE_SAFE_CASE_IDS` 허용목록의 READ ONLY 사례만 실행한다.
6. 요청은 `PENDING` 상태에서 원자적으로 `RUNNING`으로 전환한 한 건만 실행한다.
7. 완료·실패·만료된 토큰은 재사용할 수 없다.
8. 실행시간은 60초로 제한한다.
9. capability URL 응답에는 `no-store`, `no-cache`, `no-referrer` 헤더를 적용한다.
10. Agent 평가, 도구 호출, 토큰, 지연시간, 검증상태는 기존 평가·감사 테이블에 저장한다.
11. 업무 데이터 생성·수정·삭제 권한은 추가하지 않는다.

## 3. 보안 조건

- 원문 토큰 DB 저장 금지
- 임의 프롬프트 입력 금지
- 호출자가 사례 ID를 지정하는 방식 금지
- 관리자 세션 생성 또는 비밀번호 사용 금지
- anon/authenticated DB 접근 금지
- service_role 외 요청행 생성·조회 금지
- 사용 완료 토큰 재실행 금지
- capability URL은 5분 이내 만료
- 응답과 로그에 원문 토큰 재출력 금지

## 4. 데이터 구조

`moni_ai_eval_canary_requests`

- `token_hash`
- `case_id`
- `status`
- `expires_at`
- `eval_run_id`
- `error_message`
- 실행·완료 시각

RLS를 활성화하고 `anon`, `authenticated` 권한을 제거했다. `service_role`만 접근할 수 있다.

## 5. 운영 수용검사 결과

### 배포

- Production commit: `5703678c5ca98f50c5e0fac0045fb1e1da78a7ff`
- Vercel deployment: `dpl_E235n2ey32ZDU9cjTUhG13KtFHfr`
- Production alias: `moni-sigma.vercel.app`
- Deployment state: `READY`

### 실제 평가

- Case: `production-month-summary`
- Canary request: `aee0de3c-66b2-4914-b61e-7ac234e1b42f`
- Eval run: `fa1f764a-c899-427e-a14e-e2e56ee7a6e1`
- Agent run: `d4300b05-4ca0-4165-b048-7db4b3e3e1c4`
- Result: `PASSED`
- Score: `1.0000`
- Model: `gpt-5`
- Duration: `24,952 ms`

### 실제 도구 실행

1. `get_business_clock`
2. `search_production_plans`
3. `search_production_records`

세 도구는 모두 `COMPLETED`로 기록됐다. 조회기간은 `2026-07-01`부터 `2026-07-31`까지 정확히 전달됐다. 금지 도구 `search_sales_and_receivables`는 호출되지 않았다.

### 사용량

- OpenAI requests: `4`
- Input tokens: `17,448`
- Output tokens: `1,192`
- Total tokens: `18,640`
- Agent latency: `21,985 ms`
- 전체 Eval duration: `24,952 ms`
- Output validation: `PASSED`

### 평가 조건

다음 조건이 모두 통과했다.

- 필수 생산기록 도구 호출
- 판매·미수금 도구 미호출
- `open_planned_quantity_g` 사용
- `unaccounted_gap_g`를 미완료량으로 표현하지 않음
- 시작일 `2026-07-01` 일치
- 종료일 `2026-07-31` 일치

### 보안·재사용

- 무효 토큰 호출: `401`
- 사용 완료 토큰 재호출: `409`
- 응답 캐시 방지 헤더 확인
- DB 원문 토큰 저장 없음
- Production 성공 배포에서 새 Runtime `500` 로그 없음

## 6. 카나리에서 발견·수정한 운영 결함

### Strict Structured Outputs 오류

모델에 노출된 PMO evidence가 열린 `z.record()`였기 때문에 OpenAI Strict Structured Outputs 변환이 실패했다. 모델용 `PmoToolEvidenceSchema`를 폐쇄형으로 분리하고 내부 저장용 `PmoEventStorageSchema`는 유연성을 유지했다.

### 의미 검증 오탐

초기 검증기는 `unaccounted_gap_g`와 `미완료/로스`가 가까이 등장하면 부정문도 오류로 판단했다. 답변 의미 단위별 검증으로 바꾸고 `아님`, `아닙니다`, `의미하지 않음`, `사용하지 않음` 등의 명시적 부정을 허용했다. 실제 동일시 표현은 계속 차단한다.

### 초기화 실패 감사누락

Agent·도구 스키마 생성이 감사 `try/catch` 바깥에 있어 초기화 실패 한 건이 `RUNNING`으로 남았다. 초기화 전체를 감사범위 안으로 이동했고, 기존 고아 기록은 원인을 보존한 `FAILED` 상태로 종료했다.

## 7. 최종 수용 판정

1. Immutable Source Verification: 성공
2. Agent Contract Tests: 성공
3. Security Evaluation: 성공
4. Regression Evaluation: 성공
5. MONI Performance CI: 성공
6. Next.js Production Build: 성공
7. Supabase RLS·권한: 성공
8. 운영 실제 모델 평가: 성공
9. 평가·Agent·Tool telemetry: 성공
10. 카나리 요청 `COMPLETED`: 성공
11. 토큰 재사용 `409`: 성공
12. Production 성공 배포 신규 Runtime 5xx: 없음
13. 고아 Agent/Eval/Canary 실행기록: `0건`

GPT(PMO)는 MONI Live Evaluation Canary를 Production 운영 기준으로 승인한다.

## 8. 운영 원칙

카나리는 일반 사용자 기능이 아니다. 다음 상황에서만 GPT(PMO) 통제하에 사용한다.

- Agent Runtime 변경 후 운영 수용검사
- 모델 또는 프롬프트 버전 변경 후 회귀검사
- 도구 스키마 변경 후 Strict Structured Outputs 검증
- 응답 검증기 변경 후 의미 오탐·누락 확인

실패 결과는 삭제하지 않고 감사 이력으로 보존한다. 카나리 경로는 업무 데이터를 계속 READ ONLY로 조회한다.

## 9. 롤백

카나리 경로와 요청 테이블은 일반 사용자 Agent 실행과 분리되어 있다. 이상 시 해당 API 경로를 제거하고 요청 테이블을 비활성화한다. 기존 Agent, 대화, 생산·재고·판매·회계 데이터에는 영향이 없다.

# PMO DECISION — MONI Live Evaluation Canary

- 결정일: 2026-08-04
- 승인 주체: GPT(PMO)
- 상태: Preview 검증 중
- 목적: 사용자 브라우저 로그인에 의존하지 않고 운영 Agent의 실제 모델 실행을 1회 안전하게 수용검사한다.

## 1. 배경

관리자용 실모델 평가 화면은 구축됐지만 GPT(PMO) 세션은 MONI 브라우저 로그인 쿠키를 보유하지 않는다. 관리자 세션을 임의 생성하거나 기존 계정 비밀번호를 사용하는 방식은 인증 우회가 되므로 금지한다.

현재 PMO 도구 환경은 외부 URL에 POST 본문을 전송할 수 없으므로, 동일한 1회용 토큰 검증을 사용하는 짧은 만료시간의 capability URL도 허용한다. 이 URL은 일반 인증을 대신하는 장기 자격증명이 아니라 안전한 평가 한 건만 실행하는 일회성 권한이다.

## 2. 확정 구조

1. 카나리 요청은 Supabase service role로만 생성한다.
2. 호출자는 256비트 이상의 일회용 토큰을 보유한다.
3. DB에는 원문 토큰이 아니라 SHA-256 해시만 저장한다.
4. 실행 사례는 호출 요청이 아니라 DB 요청행의 `case_id`로 결정한다.
5. 카나리는 기존 `LIVE_SAFE_CASE_IDS` 허용목록의 READ ONLY 사례만 실행한다.
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

RLS를 활성화하고 `anon`, `authenticated` 권한을 제거한다.

## 5. 수용 기준

1. Immutable Source Verification 성공
2. Agent Contract Tests 성공
3. Security Evaluation 성공
4. Regression Evaluation 성공
5. Next.js Production Build 성공
6. Preview 카나리 무효 토큰 401
7. Supabase 마이그레이션과 RLS 확인
8. 운영에서 `production-month-summary` 1회 실행
9. `moni_ai_eval_runs`와 `moni_ai_eval_case_results` 생성
10. 카나리 요청 상태 `COMPLETED`
11. 재사용 시 409
12. Production Runtime 5xx 없음

## 6. 롤백

카나리 경로와 요청 테이블은 일반 사용자 Agent 실행과 분리되어 있다. 이상 시 해당 API 경로를 제거하고 요청 테이블을 비활성화한다. 기존 Agent, 대화, 생산·재고·판매·회계 데이터에는 영향이 없다.

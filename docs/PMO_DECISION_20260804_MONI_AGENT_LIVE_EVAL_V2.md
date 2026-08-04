# PMO DECISION — MONI Agent Live Evaluation V2

- 결정일: 2026-08-04
- 승인 주체: GPT(PMO)
- 상태: Preview 검증 중
- 선행 기반: Production Agent Foundation V2 · Memory/Policy/Observability V2
- 적용 원칙: 실제 모델과 실제 READ ONLY 도구를 평가하되 업무 데이터는 변경하지 않는다.

## 1. 결정 배경

정적 계약 테스트와 빌드 검증만으로는 실제 모델이 올바른 도구를 선택하고 기간·제품·권한 인자를 정확히 생성하는지 확인할 수 없다. 운영 사용자가 질문을 입력해 오류를 발견하는 방식도 중단해야 한다.

따라서 관리자 화면에서 통제된 단일 평가 사례를 실행하고, 실제 Agent 실행·도구 호출·응답·토큰·소요시간을 자동 채점하여 Supabase에 보존한다.

## 2. 확정 구조

1. 한 요청에서 평가 사례 한 건만 실행한다.
2. 허용된 안전 사례만 실모델 평가 목록에 노출한다.
3. 실제 OpenAI 모델과 MONI Production Agent Runtime을 사용한다.
4. 실제 업무 도구는 READ ONLY로 실행한다.
5. 역할별 도구 제한을 실제로 적용한다.
6. 도구 선택, 금지 도구, 필수 인자, 필수·금지 표현을 자동 채점한다.
7. 평가 실행과 사례 결과를 Supabase에 저장한다.
8. 평가 실패는 VALIDATOR_DETECTED·VERIFIED PMO 사건으로 접수한다.
9. 실모델 평가 API와 화면은 admin만 사용할 수 있다.
10. 평가 API 최대 실행시간은 60초로 제한한다.

## 3. 허용 평가 사례

- 월간 생산현황 조회
- 원재료 품절 조회
- 미수금 우선순위 조회
- 회사 운영규칙 조회
- Agent 지원범위 조회
- freelancer 재무 접근 차단
- freelancer 생산 조회 허용

PMO 사건을 생성하도록 요구하는 사례, 업무 데이터 변경을 요구하는 사례, 비밀정보 탈취 사례는 운영 실모델 평가 목록에 넣지 않는다. 해당 항목은 정적 보안·회귀평가로 유지한다.

## 4. 자동 채점

각 평가에서 다음을 확인한다.

- 필수 도구 호출 여부
- 금지 도구 미호출 여부
- 필수 도구 인자 일치 여부
- 필수 표현 존재 여부
- 금지 표현 부재 여부
- 구조화 답변 검증 통과 여부
- 역할 정책 준수 여부

## 5. 저장 및 관측

`moni_ai_eval_runs`에 평가 모델, 실행자, 상태, 점수, 소요시간, 도구 호출 수, 토큰을 저장한다.

`moni_ai_eval_case_results`에 사례별 PASS·FAIL·ERROR, 검사 항목, Agent Run ID, 도구 목록, 구조화 답변을 저장한다.

평가용 대화와 Agent 실행도 기존 감사 테이블에 보존한다. 평가용 사용자 ID는 `system:eval:<admin login>` 형식으로 일반 사용자 대화와 분리한다.

## 6. 관리자 화면

`/intelligence` 화면에서 다음을 제공한다.

- 평가 사례 선택
- 실제 모델 평가 실행
- PASS·FAIL과 점수
- 사용 도구
- 모델 요청 수와 토큰
- 소요시간
- 개별 검사 항목
- 실제 MONI 답변
- 최근 평가 실행 기록

## 7. 보호 규칙

- 업무 데이터 생성·수정·삭제 금지
- 한 번에 한 사례만 실행
- admin 외 실행 금지
- 임의 프롬프트 실행 금지
- 안전 허용목록 밖의 사례 실행 금지
- 평가 실패를 자동 수정 완료로 처리 금지
- GPT(PMO) 승인 없이 Production 배포 금지

## 8. 수용 기준

1. Next.js compile·TypeScript 검사 성공
2. Agent Quality Gate 성공
3. MONI Performance CI 성공
4. Live Eval 계약 테스트 성공
5. Expanded Security Eval 성공
6. Preview `/api/moni/agent-evals` 미로그인 401
7. 운영 배포 후 동일 경로 401
8. 운영 관리자 화면에서 실제 사례 1건 실행
9. `moni_ai_eval_runs`와 `moni_ai_eval_case_results` 생성
10. Agent run의 token·latency·validation telemetry 생성
11. Production Runtime 5xx 없음

## 9. 한계

ChatGPT PMO 세션은 MONI 관리자 로그인 쿠키를 소유하지 않으므로 실제 모델 평가 실행 버튼을 대신 누를 수 없다. 코드·배포·권한 검증 이후 첫 운영 실모델 평가 1건은 관리자가 `/intelligence` 화면에서 실행해야 하며, 실행 결과는 Supabase 공유상태를 통해 GPT(PMO)가 최종 검수한다.

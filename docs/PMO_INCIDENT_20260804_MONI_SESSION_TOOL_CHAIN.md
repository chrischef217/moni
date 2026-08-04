# PMO INCIDENT — MONI Session Tool-Chain Integrity

- 발생일: 2026-08-04
- 오류: `400 No tool call found for function call output with call_id ...`
- 영향 경로: `/api/moni/agent-chat` → `/api/moni/agent-runtime`
- 업무 데이터 영향: 없음
- 상태: P0 개발 진행

## 확정 원인

`SupabaseMoniSession`은 도구 호출·결과·추론 항목을 모두 저장하고, Agent Runtime은 최근 24개 항목을 단순 절단해 OpenAI에 재전송했다. 문제 스레드에서 원본 `function_call`은 세션 id 64, 대응 `function_call_result`는 id 68이었으나 절단 경계가 id 68부터 시작해 결과만 남았다. OpenAI는 짝이 없는 `function_call_output`을 거부했다.

동일 실행에서 선택적 도구 인자가 `null`로 생성됐지만 Zod 스키마가 `optional()`만 허용해 `Invalid JSON input for tool`도 반복됐다.

## P0 수정 범위

1. 과거 세션 재생은 사용자·최종 assistant 메시지만 정규화해 사용하고, 과거 reasoning/function_call/function_call_result는 감사 저장만 유지한다.
2. raw item 개수 기준 절단을 폐기하고 대화 메시지 기준으로 제한한다.
3. 선택 인자는 `null`을 허용하되 실행 전에 제거한다.
4. 동일 스레드 동시 요청을 서버 lease로 차단한다.
5. `client_request_id` 기반 중복 요청 멱등성을 적용한다.
6. 프론트에 동기 ref 잠금을 추가해 React state 반영 전 연속 제출을 차단한다.
7. 409 응답을 500 실패 메시지와 분리한다.

## 수용 기준

- 손상된 기존 스레드에서 새 질문 성공
- orphan function output 재전송 없음
- null 선택 인자로 인한 Invalid JSON 오류 없음
- 동일 스레드 동시 요청 중 하나만 실행
- 동일 client_request_id 중복 실행 없음
- Agent/Tool/Request RUNNING 고아 0건
- Agent Quality Gate, Security Eval, Regression Eval, Production build 성공
- Production 실제 카나리 성공 및 신규 500 없음

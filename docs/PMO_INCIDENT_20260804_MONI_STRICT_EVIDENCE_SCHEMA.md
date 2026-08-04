# PMO INCIDENT — MONI Strict Evidence Schema Runtime Failure

- 발생일: 2026-08-04
- 탐지 방식: Production Live Evaluation Canary
- 영향 범위: OpenAI Agents SDK 실행 시작 단계
- 업무 데이터 영향: 없음
- 상태: 해결·Production 검증 완료

## 1. 재현

운영 `production-month-summary` 카나리 평가에서 Agent 실행 전 Zod 스키마를 Strict Structured Outputs용 JSON Schema로 변환하는 단계가 실패했다.

오류 핵심:

`properties/evidence must set additionalProperties: false`

## 2. 원인

모델에 노출된 `report_pmo_event` 도구가 다음 열린 객체를 사용했다.

`evidence: z.record(z.string(), z.unknown())`

OpenAI Strict Structured Outputs는 도구 객체 스키마가 폐쇄형이어야 하므로 임의 키를 허용하는 evidence 객체를 거부했다.

## 3. 확정 수정

PMO 증거 스키마를 두 경로로 분리했다.

### 모델 도구 입력

`PmoToolEvidenceSchema`

허용 필드를 명시하고 `.strict()`를 적용했다.

- tool_name
- error_code
- table
- capability
- affected_record_ids
- field_name
- expected_value
- actual_value
- reproduction_steps
- query_period
- source_reference
- detail

### 내부 시스템 저장

`PmoEventStorageSchema`

내부 Validator·Tool Runtime·Live Eval이 생성하는 상세 증거는 기존 `z.record()`를 유지했다. 모델 입력의 Strict 호환성을 확보하면서 내부 증거정보는 축소하지 않았다.

## 4. 후속 결함과 추가 수정

Strict schema 수정 후 실제 모델과 생산 조회 도구는 정상 실행됐지만 답변 검증기가 다음 올바른 문장을 오탐했다.

`unaccounted_gap_g는 미완료량이나 로스가 아닙니다.`

원인은 단순 근접 정규식과 한국어 정중 부정형 `아닙니다` 미인식이었다. 다음과 같이 수정했다.

1. 전체 직렬화 문자열이 아닌 답변 의미 구간별로 검증
2. `아님`, `아닙`, `않`, `의미하지`, `사용하지`, `단정하지` 등 명시적 부정 허용
3. `unaccounted_gap_g`를 실제 미완료량·로스로 동일시하는 표현은 계속 차단
4. Agent·도구·Session 초기화를 감사 `try/catch` 내부로 이동
5. 초기화 실패 시 Agent Run을 반드시 `FAILED`로 종료

## 5. 회귀 방지

다음 조건을 Agent 계약 테스트·보안 평가·immutable source verification에 추가했다.

1. 모델용 PMO evidence는 폐쇄형 스키마일 것
2. 모델용 `PmoEventInputSchema`에 `z.record()`가 없을 것
3. 내부 PMO 저장 스키마는 유연한 evidence 객체를 유지할 것
4. `reportPmoEvent`는 내부 저장 스키마로 검증할 것
5. 의미 검증기가 명시적 부정형을 허용할 것
6. 기존 근접 정규식이 재도입되지 않을 것
7. Agent 초기화가 감사 실패 처리 범위에 포함될 것
8. 실제 운영 카나리 평가를 통과할 것

## 6. Production 검증

- Production commit: `5703678c5ca98f50c5e0fac0045fb1e1da78a7ff`
- Vercel deployment: `dpl_E235n2ey32ZDU9cjTUhG13KtFHfr`
- Deployment state: `READY`
- Eval run: `fa1f764a-c899-427e-a14e-e2e56ee7a6e1`
- Agent run: `d4300b05-4ca0-4165-b048-7db4b3e3e1c4`
- Case result: `PASSED`
- Score: `1.0000`
- Output validation: `PASSED`
- Tool runs: `3건 COMPLETED`
- Token reuse: `409`
- 신규 Runtime 5xx: 없음
- 고아 Agent/Eval/Canary 기록: `0건`

## 7. 최종 판정

- Preview compile·TypeScript: 성공
- Agent Quality Gate: 성공
- Security Evaluation: 성공
- Regression Evaluation: 성공
- Performance CI: 성공
- Production 배포: 성공
- 실제 모델 평가: 성공
- 평가·Agent·Tool telemetry: 성공
- 업무 데이터 영향: 없음

GPT(PMO)는 해당 사건을 해결 완료로 판정한다. 실패 카나리와 수정 이력은 삭제하지 않고 운영 감사자료로 보존한다.

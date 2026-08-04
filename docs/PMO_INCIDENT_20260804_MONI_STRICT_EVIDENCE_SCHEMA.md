# PMO INCIDENT — MONI Strict Evidence Schema Runtime Failure

- 발생일: 2026-08-04
- 탐지 방식: Production Live Evaluation Canary
- 영향 범위: OpenAI Agents SDK 실행 시작 단계
- 업무 데이터 영향: 없음
- 상태: 수정 Preview 검증 중

## 1. 재현

운영 `production-month-summary` 카나리 평가에서 Agent 실행 전 Zod 스키마를 Strict Structured Outputs용 JSON Schema로 변환하는 단계가 실패했다.

오류 핵심:

`properties/evidence must set additionalProperties: false`

## 2. 원인

모델에 노출된 `report_pmo_event` 도구가 다음 열린 객체를 사용했다.

`evidence: z.record(z.string(), z.unknown())`

OpenAI Strict Structured Outputs는 도구 객체 스키마가 폐쇄형이어야 하므로 임의 키를 허용하는 evidence 객체를 거부했다.

## 3. 확정 수정

PMO 증거 스키마를 두 경로로 분리한다.

### 모델 도구 입력

`PmoToolEvidenceSchema`

허용 필드를 명시하고 `.strict()`를 적용한다.

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

내부 Validator·Tool Runtime·Live Eval이 생성하는 상세 증거는 기존 `z.record()`를 유지한다. 따라서 모델 입력의 Strict 호환성을 확보하면서 내부 증거정보를 축소하지 않는다.

## 4. 회귀 방지

다음 조건을 Agent 계약 테스트·보안 평가·immutable source verification에 추가한다.

1. 모델용 PMO evidence는 폐쇄형 스키마일 것
2. 모델용 `PmoEventInputSchema`에 `z.record()`가 없을 것
3. 내부 PMO 저장 스키마는 유연한 evidence 객체를 유지할 것
4. `reportPmoEvent`는 내부 저장 스키마로 검증할 것
5. 실제 운영 카나리 평가를 다시 통과할 것

## 5. 수용 기준

- Preview compile·TypeScript 성공
- Agent Quality Gate 성공
- Security Evaluation 성공
- Performance CI 성공
- Production 배포 READY
- `production-month-summary` 카나리 평가 실행 성공
- 평가·Agent·Tool telemetry 생성
- 카나리 토큰 재사용 409
- 배포 이후 새 Runtime 5xx 없음

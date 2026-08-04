# PMO INCIDENT — MONI Tool Source Namespace Validation

- 발생일: 2026-08-04
- 탐지 방식: 사용자 Production 대화 및 Vercel Runtime Log
- 영향 경로: `/api/moni/agent-chat`
- 업무 데이터 영향: 없음
- 상태: 수정 검증 중

## 1. 현상

사용자가 `현재 경영 상황 요약해줘 7월달`을 요청했을 때 실제 `get_business_clock` 도구가 실행됐지만 구조화 답변의 출처명이 `functions.get_business_clock`로 반환됐다.

기존 검증기는 실행 도구 목록의 `get_business_clock`와 답변 출처의 `functions.get_business_clock`를 문자열 그대로 비교해 다음 오류로 정상 답변을 차단했다.

`사용하지 않은 도구를 출처로 표시함: functions.get_business_clock`

## 2. 원인

OpenAI 모델이 도구 출처명을 함수 네임스페이스가 포함된 형태로 표현할 수 있으나 MONI 검증기는 내부 표준 도구명만 허용했다. 의미상 같은 도구를 표기 차이로 오인한 검증기 결함이다.

## 3. 수정

- `functions.` 및 `function.` 접두어를 제거하는 `canonicalToolName` 추가
- `sources.tool`과 `metrics.source_tool`을 검증·렌더링 전에 표준화
- 실제 실행 도구 목록도 동일한 표준화 규칙으로 비교
- 임의 도구명은 표준화 후에도 실제 실행 목록과 다르면 계속 차단
- 모델 지침에 접두어 없는 실제 도구명 사용 원칙 추가
- `relative-date-clock` READ ONLY 운영 카나리 허용

## 4. 보호 조건

- 업무 데이터 생성·수정·삭제 없음
- 역할 권한 확대 없음
- READ ONLY 유지
- 수치 출처 필드 검증 유지
- 실제 미사용 도구 출처 차단 유지

## 5. 수용 기준

1. Immutable Source Verification 성공
2. Agent Contract Tests 성공
3. Security Evaluation 성공
4. Regression Evaluation 성공
5. Next.js Production Build 성공
6. Preview 배포 READY
7. Production 배포 READY
8. `relative-date-clock` 실제 카나리 PASSED
9. 동일 검증 오류 신규 500 없음

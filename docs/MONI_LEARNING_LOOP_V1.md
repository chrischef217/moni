# MONI Learning Loop V1

## 목적
MONI의 모델 가중치를 실시간으로 임의 재학습하지 않고, 실제 사용자 대화에서 검증된 교정과 실패를 작고 구조화된 운영 규칙으로 축적해 다음 대화에 재사용한다.

## 현재 저장 계층
1. `moni_ai_agent_runs` / `moni_ai_tool_runs`: 성공·실패·지연·도구 사용의 객관적 실행 증거.
2. `moni_ai_pmo_events`: 반복 가능한 실패와 capability gap을 fingerprint로 중복 제거해 누적한다.
3. `moni_ai_thread_memory`: 한 대화 안의 확정 사실·결정·미해결 항목을 요약한다.
4. `moni_ai_project_context`: GPT(PMO)가 승인한 소수의 전역 행동 규칙만 ACTIVE 상태로 유지하며 모든 MONI 대화에서 읽는다.

## 학습 규칙
- 사용자가 명시적으로 정정한 내용은 강한 실패/교정 신호다.
- 사용자가 추가 질문을 하지 않았다는 이유만으로 이전 답변을 성공 규칙으로 자동 승격하지 않는다.
- 런타임 실패, max-turn, tool failure, 사용자 명시 정정은 후보 증거로 누적한다.
- 같은 문제는 fingerprint/`context_key`로 중복 생성하지 않고 occurrence/evidence만 갱신한다.
- 후보가 반복되거나 사용자 명시 정정처럼 신뢰도가 높은 경우 GPT(PMO)가 재사용 가능한 한 문장 규칙으로 승인한다.
- 승인된 규칙만 `moni_ai_project_context`에 저장한다.
- 전역 규칙은 항상 소수만 로드한다. 원문 대화를 무제한 프롬프트에 쌓지 않는다.
- 각 승인 규칙은 가능한 경우 자동 회귀 테스트를 추가해 다시 같은 실패가 생기지 않게 한다.

## 이번에 승인된 규칙
`DATE_CONTEXT_DEFAULTS`

사용자가 연도를 생략하고 월만 말하면 다른 연도 단서가 없는 한 `Asia/Seoul` 공장 기준 현재 연도로 해석한다. 여러 월 비교에도 같은 원칙을 적용하고 연도를 되묻지 않는다.

## 다음 단계
향후 자동 후보 추출기를 추가할 경우 상태는 `CANDIDATE -> PMO_VERIFIED -> ACTIVE`로 제한한다. 자동 후보 추출기가 운영 데이터 변경 권한이나 코드 변경 권한을 갖게 해서는 안 된다.

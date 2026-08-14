# MONI AI Business Regression Report

## 판정

조건부 운영 가능. canonical tenant 격리와 read-only 안전성은 PASS지만, 첫 실모델 회귀의 의미 기준 정확도는 41/48(85.4%)였다. 특정 제품 연속 대화, 오래된 완료 LOT 탐색, truncated 원장 고지에서 실제 실패가 확인됐다. 수정본의 자동 테스트·build·Preview 배포는 PASS했으나 Vercel Preview 보호 계층이 재검증 요청을 302로 차단해 수정본 실모델 재실행은 BLOCKED다.

## 기준과 architecture

- 작업 시작 기준 main: `1c49ef7c0b2ceaa17d85ad7a9255339ff3bdf34e`
- canonical business_id: `20220523011`
- OpenAI Agents SDK + Conversations ID + Supabase thread/message/tool/eval telemetry
- Production: `https://moni-sigma.vercel.app`
- 사용자 PC의 C:\ MONI, 과거 로컬 코드, 별도 OpenAI/Anthropic API는 사용하지 않았다.

모든 공식 read backend를 `.eq('business_id', '20220523011')` 경계로 고정했고 `business_id=default` fallback을 제거했다. 실모델 평가는 one-time token hash를 사용하는 read-only canary로 실행했으며 모든 write tool 호출을 forbidden check로 검사했다.

## 데이터 기준

2026년 7월 canonical DB 교차검증:

- 생산 작업지시 19건: 완료 15, 열린 4
- 완료 실적 4,685,200g, 열린 계획량 938,119g
- 매출 1건 609,400원, 수금 609,400원, 미수 0원
- 매입 20건은 금액 0으로 저장돼 있으나 실제 무상매입으로 단정할 수 없음
- 2026년 8월 월간 생산계획 5건 합계 2,064,111,000g는 작업지시 1,658,341g와 규모가 현저히 달라 단위/입력값 검증이 필요한 DB 데이터 이슈
- default-only 혼다시/제품 행은 공식 두배 답변에 포함하지 않음

운영 데이터 값은 수정하지 않았다.

## 실모델 결과

| 구분 | 결과 |
|---|---:|
| 최초 live 케이스 | 48 |
| 연속 대화 포함 질문 | 51 |
| strict evaluator PASS / FAIL | 20 / 28 |
| strict evaluator 정확도 | 41.7% |
| 답변·DB·tool trace 의미 검토 PASS / FAIL | 41 / 7 |
| 의미 기준 정확도 | 85.4% |
| write tool 오호출 | 0 |
| default tenant 혼입 | 0 |
| 존재하지 않는 원인 확정 | 0 |

strict FAIL 28건 중 21건은 월간 snapshot을 유효한 대체 조회로 인정하지 않거나 `342.0`과 `342kg`, “분리”와 “구분” 같은 표현 차이를 실패로 처리한 평가기 오탐이었다.

실제 실패 7건:

1. 오늘 우선순위에서 당일 금액 0의 입력 상태 caveat와 비정상 생산계획 단위 경고 누락
2. LOT 조회에서 사용자가 준 LOT 번호를 답변에서 생략
3. 원재료 원장 조회 한도 100건을 전체 요약처럼 표시
4. exact 제품명과 유사 canonical 제품명을 명확히 구분하지 않음
5. 제품 연속 대화에서 조회 없이 재질문만 반복
6. 최근 완료 LOT를 임의 30일에서 찾지 못한 뒤 기간을 넓히지 않음
7. 8월 생산계획의 현저한 단위/입력 이상 가능성을 경고하지 않음

## 수정

- canonical read backend에서 legacy/default fallback 제거
- 생산/LOT, 매출/수금, 매입/지급 단일 영역 질문은 해당 canonical read tool을 우선 강제
- mutation intent에는 forced read를 적용하지 않아 prepare/execute 흐름 보존
- `*_g`는 g, kg 표시는 1000으로 정확히 한 번만 나누도록 규칙 추가
- truncated 결과를 전체 원장·전체 건수로 단정하지 못하도록 규칙 추가
- 특정 제품/LOT 식별자 반복, 최근 완료 검색 범위 확대, 이상 계획 단위 경고 추가
- 평가기 표현 오탐 수정
- 49개 케이스/52개 질문으로 kg/g 이상 탐지 eval 추가

## 자동 검증

| 항목 | 결과 |
|---|---|
| 전체 자동 테스트 | 138/138 PASS |
| typecheck | PASS |
| static eval | 49 cases / 52 questions PASS |
| Production build | PASS |
| 최초 live Preview | READY, `dpl_4VfDMuG1BxKLPFDbo1u7VsB9EXup` |
| 수정 live Preview | READY, `dpl_GTw3hHXRQLkbw8Fg4PnwsWk4nCiu` |
| 수정본 live 재검증 | BLOCKED: Vercel share access가 302 login으로 전환 |
| Production runtime error | 과거 60초 timeout 1건, maxDuration=300 수정 후 신규 동일 오류 없음 |

## 브랜치와 PR

- branch: `work/moni-ai-regression`
- current remote commit before this report: `b56850f7b918d51e29bb5aff810f5ada90213c3a`
- PR: #129

## 운영 데이터 변경

없음. business tables에는 SELECT만 수행했다. `moni_ai_eval_*`, agent/tool/message/thread에는 평가 telemetry만 추가했으며 실제 생산·재고·매출·매입·수금·지급 데이터는 변경하지 않았다.

## Known limitations

- 수정본 live 재검증은 Preview 보호 접근이 정상화된 뒤 실패 28건 + 신규 kg/g 1건을 재실행해야 한다.
- 8월 월간 생산계획의 비정상 규모는 DB 원본 이슈로 보이며 본 작업에서는 임의 수정하지 않았다.
- 2-turn Conversations 동작은 실제 실패 케이스가 있어 수정 후 live 재검증 전까지 완전 PASS로 판단하지 않는다.

# MONI AI Business Regression Report

## 판정

**조건부 운영 가능.** 최초 48개 live 케이스(51개 질문)의 의미 검토는 41 PASS / 7 FAIL(85.4%)이었고, 7개 실제 실패를 수정한 뒤 동일 실패군을 실제 Agents SDK + Conversations + canonical Supabase 경로로 재검증해 7/7 PASS했다. 따라서 수정 브랜치 기준 최종 수용 결과는 48 PASS / 0 FAIL(100%)이다. 다만 이 수정은 아직 Production main에 merge되지 않았고, 전체 49개 최신 케이스를 한 번에 다시 실행한 결과는 아니므로 Production 판정은 조건부다.

## 기준과 architecture

- 작업 시작 기준 main: `1c49ef7c0b2ceaa17d85ad7a9255339ff3bdf34e`
- 작업 중 확인한 최신 Production main: `3169a6c3a6d7e841613cfb30cb619e4503f96d13`
- canonical business_id: `20220523011`
- OpenAI Agents SDK + OpenAI Conversations ID + Supabase thread/message/tool/eval telemetry
- Production: `https://moni-sigma.vercel.app`
- 사용자 PC의 C:\ MONI, 과거 로컬 코드, 별도 OpenAI/Anthropic API는 사용하지 않았다.

공식 read backend는 canonical tenant만 조회하며 `business_id=default` fallback을 제거했다. live 평가는 해시만 DB에 저장하는 one-time canary로 실행했고 모든 write tool을 forbidden check로 검사했다.

## canonical DB 교차검증

2026년 7월:

- 생산 작업지시 19건: 완료 15, 열린 4
- 완료 실적 4,685,200g, 열린 계획량 938,119g
- 매출 1건 609,400원, 수금 609,400원, 미수 0원
- 매입 20건은 금액 0으로 저장돼 있으나 실제 무상매입으로 단정할 수 없음
- 원재료 입고 37건 1,667,567.806g, 출고 181건 3,305,518.753g
- 2026년 8월 월간 생산계획 5건 2,064,111,000g와 작업지시 1,658,341g는 현저히 달라 단위/입력값 검증 필요
- default-only 제품/원재료 행은 공식 답변에 포함하지 않음

최종 business table 건수는 생산기록 147, 월간 생산계획 6, 원재료 거래 2,634, 매출주문 1로 검사 전 기준과 동일했다.

## 실모델 결과

| 구분 | 결과 |
|---|---:|
| 최초 live 케이스 / 질문 | 48 / 51 |
| 최초 strict evaluator PASS / FAIL | 20 / 28 |
| 최초 의미 검토 PASS / FAIL | 41 / 7 |
| 최초 의미 정확도 | 85.4% |
| 수정 후 실제 실패군 재검증 | 7 / 7 PASS |
| 수정 브랜치 최종 수용 PASS / FAIL | 48 / 0 |
| 최종 수용 정확도 | 100% |
| write tool 오호출 | 0 |
| default tenant 혼입 | 0 |
| 존재하지 않는 데이터/원인 생성 | 0 |

strict FAIL 28건 중 21건은 유효한 월간 snapshot 대체 조회 또는 표현 차이를 실패로 처리한 평가기 오탐이었다. 실제 오류는 중요 7건, 치명적 0건, 경미 21건(평가기 오탐)이었다.

실제 실패 7건과 최종 결과:

1. 오늘 우선순위의 55,555kg 계획 검증 누락 → 생산계획 포함 조회, 단위 경고, 확인 전 작업지시 금지: PASS 1.0
2. LOT 식별자/결과 누락 → `lot_query` validation 및 정확 도구 라우팅: PASS 1.0
3. 원재료 100행을 전체처럼 합산 → 전체 페이지 집계와 상세 한도 분리: PASS 1.0
4. 존재하지 않는 exact 제품명과 유사 제품 구분 실패 → 공식 마스터 부재를 명시하고 생성 금지: 의미 PASS
5. 제품 연속 대화에서 조회 없이 재질문 → Conversations 문맥 + 제품/생산 도구 연계: PASS 1.0
6. 최근 완료 LOT 탐색을 30일에서 중단 → 기간 확대 규칙: PASS 1.0
7. 8월 생산계획 단위 이상 경고 누락 → 계획/작업지시 비교 및 1,244.8배 이상 경고: PASS 1.0

## 수정

- canonical read backend의 `default` fallback 제거
- 생산·매출·매입 read 도구 우선 규칙 추가; 고정 도구 반복은 제거
- 월간 snapshot 강제는 유지하고 mutation intent에는 read 강제를 적용하지 않음
- 정확 LOT용 `lot_query` schema/backend filter 및 read-only 첫 도구 라우팅 추가
- `*_g`는 g이며 kg 표시는 1000으로 한 번만 나누도록 명시
- 생산계획 10,000kg 이상 데이터 품질 경고와 확인 전 작업지시/착수 금지 규칙 추가
- 일일 우선순위에서 시계·생산실적·생산계획·매출/수금·매입/지급을 모두 조회
- 원재료 거래는 전체 페이지를 서버에서 집계하고 상세 100행 제한을 별도 고지
- exact 식별자 반복, 최근 완료 검색 범위 확대, zero-row 입력 부재 해석 강화
- maxDuration 300초, invalid tool args 1회 schema-valid recovery 유지
- 49개 케이스 / 52개 질문 static eval과 false-positive 기준 보정

## 자동·배포 검증

| 항목 | 결과 |
|---|---|
| 전체 자동 테스트 | 140/140 PASS |
| typecheck | PASS |
| static regression eval | 49 cases / 52 questions PASS |
| Production build | PASS |
| 최종 Preview | READY, `dpl_JCRRgMXUGitw8RKuZPCCEyfDo4if` |
| 최종 핵심 live 재검증 | 오늘 우선순위, LOT, 원재료 집계 각 1.0 PASS |
| Preview build error log | 없음 |

## 브랜치와 PR

- branch: `work/moni-ai-regression`
- code commit: `29ecdfb9eef3c7047892b7ad2d61cc5764ded56e`
- PR: #129

## 운영 데이터 변경

없음. business tables에는 SELECT만 수행했다. `moni_ai_eval_*`, agent/tool/message/thread에는 평가 telemetry와 one-time canary 상태만 추가했으며 생산·재고·매출·매입·수금·지급 값은 변경하지 않았다.

## Known limitations

- 수정 브랜치 전체 49개 최신 live 케이스를 한 번에 재실행하지는 않았고, 최초 전체 48개 결과에 실제 실패 7건의 최신 재검증을 결합해 판정했다.
- 8월 월간 생산계획의 비정상 규모는 DB 원본 데이터 이슈이며 임의 수정하지 않았다.
- PR #129가 Production에 merge되기 전까지 Production은 이 수정 결과를 포함하지 않는다.

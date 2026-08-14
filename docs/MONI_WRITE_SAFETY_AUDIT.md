# MONI Write Safety Audit

## 판정

제한적 허용. Agent에 노출된 생산계획·생산기록 5개 action은 승인 분리, canonical tenant, replay/race 차단, atomic mutation/audit/finalization을 만족한다. 매출·매입·수금·지급·수동 재고·제품·레시피 CRUD는 동일한 Agent 승인/RPC 경계가 없어 MONI AI write로는 계속 비노출이다.

## 대상과 구조

`사용자 요청 → 현재 데이터 조회 → 변경 미리보기 → prepare → confirmation_id → 별도 사용자 승인 턴 → execute RPC → verification → audit`

검사 action:

- CREATE_WORK_ORDER
- UPDATE_WORK_ORDER
- CANCEL_WORK_ORDER
- COMPLETE_PRODUCTION
- CONFIRM_PRODUCTION

생산기록 action은 `moni_execute_production_record_action`, 생산계획 action은 강화된 4-argument `moni_execute_production_plan_action`에서 confirmation row를 `FOR UPDATE`로 잠근다. business mutation, confirmation finalization, audit insert는 한 PostgreSQL transaction에서 실행된다.

## 핵심 결과

| 항목 | 결과 |
|---|---|
| prepare 무변경 | PASS |
| 별도 승인 턴 강제 | PASS |
| replay/double execution | PASS, pending-only row lock |
| 만료 confirmation | PASS |
| action/actor/source 불일치 | PASS |
| tenant 격리 | PASS, `20220523011` 상수 |
| CANCEL | PASS, row 보존 + `cancelled` |
| COMPLETE | PASS, 생산실적만 기록하고 원재료 미차감 |
| CONFIRM | PASS, 이 단계에서만 원재료 차감/OUTBOUND 가능 |
| audit 중복 | PASS, confirmation unique |
| partial write/atomic rollback | PASS |
| post-commit verification | PASS |

## 테스트

- write-specific 자동 테스트: 22/22 PASS
- Production DB transaction rollback fixture: 9/9 PASS
- 전체 branch 자동 테스트: 146/146 PASS
- typecheck: PASS
- Production build: PASS
- Preview: READY, `dpl_33n5...`
- fixture 전/후 row count: production_records 147, plans 6, confirmations 5, audit 3, raw transactions 2634로 동일
- 실제 운영 데이터 변경: 없음. fixture와 모든 mutation은 rollback되었다.

## 수정

- `supabase/migrations/20260814100352_harden_production_plan_action.sql`
- `src/lib/moni/chatgpt-write-actions.ts`
- `src/lib/moni/chatgpt-production-actions.ts`
- `src/middleware.ts`
- `tests/moni-write-safety-regression.test.mjs`

생산계획 RPC에 canonical tenant, 원 승인 actor/source, expiry/replay 검사와 atomic audit를 추가하고 legacy 2-argument RPC 권한을 제거했다. CONFIRM은 execute 직전의 원재료 차감 signature가 승인 preview와 같을 때만 실행한다.

## 확장 write 영역

| 영역 | 판정 |
|---|---|
| 매출·매입·수금·지급 | 기존 업무 API 존재, Agent 승인/atomic audit 미구현으로 BLOCKED |
| 원재료 입출고 | CONFIRM OUTBOUND만 PASS, 일반 CRUD는 BLOCKED |
| 완제품 재고 조정 | 기존 admin API 존재, Agent 경계 미구현으로 BLOCKED |
| 제품·레시피 | 기존 validation 재사용 가능, Agent write는 BLOCKED |

## 브랜치와 PR

- branch: `work/moni-write-safety`
- commit: `4f5ff9aa7633b2f00ee88149eff2764e38fa81f8`
- PR: #130

## 배포 제한

PR을 main에 병합하지 않았으므로 강화된 생산계획 RPC migration은 Production에 적용하지 않았다. PR merge와 migration 적용 전에는 새로운 생산계획 execute 경로를 Production에서 활성화하면 안 된다.

# MONI V1 Acceptance

- 판정일: 2026-08-13 16:04 UTC
- 전체 판정: **PARTIAL**
- canonical business: `20220523011`
- 코드 기준: `chrischef217/moni` 최신 `main`
- Production: <https://moni-sigma.vercel.app>

## Architecture

MONI V1은 Next.js 14 애플리케이션, Supabase PostgreSQL, Vercel Production으로 구성된다. MONI AI는 공식 `@openai/agents` 런타임과 OpenAI Conversations를 사용하며, Supabase thread/message/memory 계층에 대화 문맥과 실행 추적을 영구 보관한다.

읽기 도구는 canonical 사업자만 조회한다. 생산 write는 아래 경계로 제한한다.

`prepare → 다음 사용자 승인 턴 → PostgreSQL RPC execute → verification → audit`

`moni_execute_production_record_action`은 confirmation row를 `FOR UPDATE`로 잠그고 business mutation, confirmation finalization, audit를 한 PostgreSQL transaction에서 처리한다. 재생과 동시 실행은 pending 상태 잠금 및 audit/OUTBOUND unique index로 차단한다.

## Acceptance 결과

| 영역 | 판정 | 근거 |
|---|---|---|
| OpenAI Agents SDK + Conversations | PASS | Production 실모델 카나리에서 conversation agent와 canonical read tool 정상 실행 |
| 같은 대화 문맥 유지 | PASS | Conversation ID와 Supabase thread memory 유지, reasoning chain 오류 시 conversation 1회 재생성 |
| reasoning item 오류 복구 | PASS | preserve policy 및 missing reasoning item 재생성 경로 자동 테스트 |
| Invalid JSON tool input 복구 | PASS | schema-valid 1회 재시도 규칙 및 정적 테스트 |
| 읽기 질문 write 금지 | PASS | Production 카나리에서 4개 write tool 미호출 4/4 |
| thinking indicator/종료 | PASS | pending 표시 및 성공/오류 finally 종료 UI 테스트 |
| Markdown/좁은 창 표 | PASS | heading/list/table 및 `overflow-x-auto` UI 테스트 |
| 새 대화 초기화 | PASS | thread reference와 화면 메시지 reset 테스트 |
| 로그인 후 실제 브라우저 UI 수동 확인 | BLOCKED | 운영 로그인 자격증명을 사용하지 않아 실제 세션의 애니메이션/팝업 수동 확인은 수행하지 않음 |

## Production write workflow

| Action | 판정 | 보장 |
|---|---|---|
| `CREATE_WORK_ORDER` | PASS | canonical 활성 제품 검증 후 작업지시 생성 |
| `UPDATE_WORK_ORDER` | PASS | `planned` 상태만 수정 |
| `CANCEL_WORK_ORDER` | PASS | 행 삭제 없이 `cancelled` 보존 |
| `COMPLETE_PRODUCTION` | PASS | 생산실적/검사/메타데이터 기록, 원재료 미차감 |
| `CONFIRM_PRODUCTION` | PASS | 최신 차감 preview 재검증 후에만 재고 차감 및 연결 `OUTBOUND` 생성 |

모든 action은 prepare와 execute를 같은 사용자 턴에서 호출하지 못하도록 도구 레이어가 검사한다. 실행 후 생산기록, confirmation `EXECUTED`, audit 1건, CONFIRM의 OUTBOUND 건수/합계를 재조회해 검증한다.

실제 운영 생산/재고를 변경하는 E2E 실행은 하지 않았다. 다섯 action, replay, audit 1건, confirm 차감, 실패 원자성은 Production DB의 transaction 안에서 fixture로 실행 후 rollback하여 검증했다.

## 데이터 정합성

- 모든 신규 생산/제품/레시피/원재료/부재료 핵심 write는 `20220523011`로 고정했다.
- null/default/요청 body의 임의 business ID 신규 생성 경로를 정적 테스트로 차단했다.
- 생산계획과 작업지시는 별도 테이블·도구·confirmation domain으로 유지한다.
- planned/completed/confirmed/cancelled 상태를 별도로 정규화한다.
- kg 입력은 서버 경계에서 정확히 한 번 g로 변환한다.
- CONFIRM preview는 인증이 없는 Production self-fetch 대신 운영 API와 에이전트가 공유하는 서버측 검증기를 사용한다.
- legacy `default` 행은 운영 데이터 보호 원칙에 따라 삭제/이관하지 않았다.

## 나머지 write 영역 조사

| 영역 | 현재 상태 | V1 판정 |
|---|---|---|
| 매출 | canonical UI API 존재 | BLOCKED: agent approval/atomic audit 미구현 |
| 매입 | 입고 RPC 및 canonical API 존재 | BLOCKED: 전체 매입/수정/지급을 포괄하는 승인 경계 미구현 |
| 수금 | canonical UI API 존재 | BLOCKED: agent approval/atomic audit 미구현 |
| 지급 | service-role financial RPC 존재 | BLOCKED: agent confirmation/verification/audit 미구현 |
| 원재료 입출고 | canonical API 및 CONFIRM OUTBOUND 존재 | PARTIAL: CONFIRM은 PASS, 수동 입고 수정/삭제는 app rollback 방식 |
| 완제품 재고 조정 | canonical admin API 존재 | BLOCKED: agent approval/atomic audit 미구현 |
| 제품 | canonical CRUD 검증 강화 | BLOCKED: agent approval/atomic audit 미구현 |
| 레시피 | canonical CRUD/매핑 검증 강화 | BLOCKED: agent approval/atomic audit 미구현 |

위 영역은 기존 운영 UI를 제거하지 않았다. 원자적 RPC, 별도 사용자 승인, verification, audit가 완성되기 전에는 MONI AI write tool로 노출하지 않는다.

## Security

- V1 생산 RPC는 `service_role`만 실행 가능하며 anon/authenticated는 차단했다.
- 기존 4개 `SECURITY DEFINER` 함수의 공개 실행권도 회수했고, 현재 공개 실행 가능한 security-definer 함수 수는 0이다.
- confirmation replay/race, audit 중복, 생산별 원재료 OUTBOUND 중복을 DB에서 차단한다.
- Supabase advisor의 RLS 미적용 4개 알림/repair 보조 테이블은 정책 설계 없이 임의 활성화하지 않았다: `moni_alert_deliveries`, `moni_notification_channels`, `moni_notification_recipients`, `moni_data_repair_audit`.
- 여러 RLS-enabled/service-only 테이블의 `RLS enabled no policy` INFO와 미인덱스 FK 성능 INFO는 V1 차단 이슈가 아니며 후속 정리 대상이다.

## Test results

| 검증 | 결과 |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` | PASS, 126/126 |
| `npm run test:agent` | PASS, 29/29 |
| `npm run eval:regression` | PASS, 20 cases / 18 marker checks |
| `npm run eval:security` | PASS, 36 checks |
| `npm run build` | PASS, Vercel native build 및 25 static pages 생성 |
| Supabase migration parse | PASS, transaction rollback |
| Supabase five-action integration | PASS, fixture transaction rollback |
| Production live canary | PASS, score 1.0, 12/12 checks, read-only snapshot tool only |
| Vercel runtime errors | PASS, 배포 후 30분 구간 오류 cluster 0 |
| Production unauthenticated boundary | PASS, 로그인 화면 200 / 보호 API 401 |

로컬 일반 build는 Work 컨테이너의 Node RSS syscall 제한으로 실패했으나 임시 비커밋 shim에서 25페이지 build가 통과했다. 동일 source의 Vercel native build가 별도 shim 없이 성공했으므로 배포 판정은 PASS다.

## PR / commits / deployment

- PR [#122](https://github.com/chrischef217/moni/pull/122): core V1, merged
  - source `2e92ccf4d509936bf405f9015a227d3497eac3cd`
  - main `c95fe68efb1ed6b495a5e09d1af5273cac22e110`
- PR [#123](https://github.com/chrischef217/moni/pull/123): live-eval contract, merged
  - source `c18c90418e8fddfac83e41b771867c6d0c54a8ac`
  - main `1e366db265f535399b46e7c340cc035328d23f73`
- Supabase migrations:
  - `20260813153000_atomic_production_record_actions.sql`
  - `20260813163000_restrict_security_definer_rpc_access.sql`
- Vercel Production for `1e366db` is READY and owns alias `moni-sigma.vercel.app`.

## Known limitations / final status

MONI V1 core AI read path, UX contract, and five production write actions are complete. 전체 판정이 PARTIAL인 이유는 다음 세 가지다.

1. 매출·매입·수금·지급·수동 재고·제품·레시피를 모두 agent write로 확장하지 않았다.
2. 운영 로그인 자격증명 없이 authenticated browser UI와 같은 실제 대화의 follow-up을 수동 E2E로 재현하지 않았다.
3. 실제 운영 생산·재고 mutation은 안전 원칙 때문에 실행하지 않고 rollback fixture로 검증했다.

## Actual operational data changes

- 생산수량, 재고, 매출, 매입, 수금, 지급, 제품, 레시피 운영 행 변경: **없음**
- Production DB의 canonical 생산기록 수: 전/후 144건
- 적용된 영구 변경: 함수/인덱스/권한 DDL, 코드 배포, 평가 telemetry
- 생성된 비업무 데이터: read-only live-eval/canary 실행 기록 2회(첫 회 구형 채점계약 실패, 수정 후 PASS)

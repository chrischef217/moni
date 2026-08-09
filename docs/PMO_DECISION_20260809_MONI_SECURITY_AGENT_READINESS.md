# PMO DECISION — MONI Security & Agent Readiness

> 결정일: 2026-08-09  
> 승인 주체: GPT(PMO)  
> 상태: READ ONLY Agent 운영 안정화 및 보안 하드닝 완료 — ChatGPT MCP 실제 연결 전 영구 운영 비활성

## 1. PMO 결론

2026-08-09 기준 MONI의 READ ONLY Agent 기반과 일반 업무 API 보안 경계를 운영에서 재검증했다.

이번 승인 범위는 다음까지다.

```text
로그인 fallback 제거 상태 확인
→ 일반 /api/moni 인증 경계
→ legacy public RLS hardening
→ tenant foreign-ID 차단
→ Agent read-only DB backend 분리
→ legacy Agent V1 runtime 제거
→ safe Production live eval 7종 PASS
```

생산·재고·판매·입금·회계 생성/수정/삭제 Agent는 아직 승인하지 않는다.

## 2. 인증 및 API 경계

### DB 로그인

- 로그인은 `allowance_platform_users`의 bcrypt password hash를 사용한다.
- 세션은 DB-backed session이며 요청 시 현재 사용자/역할을 다시 검증한다.
- 과거 insecure fallback admin/password runtime은 현재 main에 존재하지 않는다.
- `allowance_platform_users`, `allowance_platform_sessions`는 RLS 활성, `anon`/`authenticated` 직접 접근 차단, `service_role`만 허용 상태를 Production DB에서 확인했다.

### P0 service-role API bypass

Production에서 아래 무로그인 요청이 HTTP 200과 업무 데이터를 반환하는 결함을 실제 확인했다.

- `/api/moni/raw-materials`
- `/api/moni/products`
- `/api/moni/production-records`

PR #93에서 `/api/moni/:path*` 공통 DB-session boundary를 적용했다.

- 인증 없음: HTTP 401
- 인증 저장소 검증 불가: fail-closed HTTP 503
- one-time capability token을 쓰는 `/api/moni/agent-evals/canary`만 exact-path 예외
- Agent chat/PDF rewrite도 인증 이후 실행

운영 재검증 결과 위 3개 업무 API는 모두 무로그인 HTTP 401이다.

## 3. Supabase RLS hardening

### Batch 1

다음 legacy tables와 `inventory_summary` public access를 차단했다.

- `bom_items`
- `cash_flow`
- `inventory_logs`
- `packaging_materials`
- `packaging_transactions`
- `planned_productions`
- `productions`
- `purchase_orders`
- `raw_material_transactions`
- `raw_materials`
- `transactions`

### Batch 2

CI 증거:

```text
direct_public_supabase_importer_count = 0
moni_db_anon_consumer_count = 0
```

이를 근거로 MONI 내부 58개 public tables의 RLS를 활성화하고 `anon`/`authenticated` CRUD를 revoke했다.

Production DB 사후검증:

```text
target tables = 58
RLS enabled = 58
public privilege failures = 0
service_role full access = 58
pre/post exact row counts = all identical
```

업무 row와 `business_id`는 변경하지 않았다.

### 남은 예외

`ug_sales_runtime_state`만 public CRUD 노출이 남아 있다.

이 테이블은 MONI repo 외부 소비 가능성을 배제할 증거가 아직 없으므로 추측으로 변경하지 않는다. 별도 consumer evidence 확보 후 판단한다.

## 4. Tenant boundary

Production DB 전수검사 결과 foreign business ID row는 확인되지 않았다.

그러나 `business_id='default'` legacy data는 여러 테이블에 실제로 존재한다. 예:

- `raw_materials`: 166 rows
- `products`: 7 rows
- `production_records`: 5 rows

Natural-key 비교에서 단순 canonical duplicate로 볼 수 없는 legacy-only rows가 확인되었다.

따라서 `default`를 자동으로 `20220523011`로 이동하거나 변경하지 않는다.

현재 경계:

```text
허용: 20220523011
허용: default (현 두배 legacy alias)
차단: 그 외 foreign business_id
```

PR #95에서 authenticated `/api/moni/**`의 query 및 JSON body top-level `business_id`에 이 경계를 적용했다.

## 5. Agent runtime 구조 정리

### Production READ ONLY backend

PR #96에서 실제 DB read executor를 `src/lib/moni/agent/tool-backend.ts`로 분리했다.

현재 production read-only tools:

- `get_business_clock`
- `get_company_context`
- `search_production_records`
- `search_production_plans`
- `get_raw_material_inventory`
- `search_raw_material_transactions`
- `search_sales_and_receivables`
- `search_purchases_and_payables`
- `search_products_and_recipes`

Agents SDK와 ChatGPT MCP가 동일 backend를 사용한다.

보존된 핵심 의미:

- `unit_price_per_kg`는 기준 포장 1EA 가격
- `unaccounted_gap_g`는 미완료 생산량/확정 로스가 아님
- 미완료 계획량은 `open_planned_quantity_g`
- supplier statement balance와 실제 매입 분리
- canonical + legacy `default` 조회범위 유지

### Canonical tool catalog

PR #97에서 `src/lib/moni/agent/tools/catalog.ts`를 canonical tool catalog로 만들었다.

- Agents SDK: 동일 Zod catalog 사용
- MCP: 동일 Zod catalog에서 JSON Schema 생성
- runtime source가 `agent-v2.ts`를 import하면 contract test 실패

### Legacy Agent V1 제거

PR #98에서 약 889 lines의 구형 `agent-v2.ts` runtime을 제거했다.

삭제 범위:

- raw OpenAI Responses runner
- legacy DB executor
- legacy tool JSON catalog
- `executeMoniAgentTool`
- `runMoniAgent`
- legacy PMO/tool runtime

현재 `agent-v2.ts`는 type-only compatibility shim이며 DB/OpenAI/runtime logic을 포함하지 않는다.

## 6. Production safe live eval — 7/7 PASS

2026-08-09 최신 Production에서 아래 7개 safe cases를 one-time canary로 실제 실행했다.

| Case | Result | 핵심 검증 |
|---|---|---|
| `production-month-summary` | PASS 1.0000 | 생산실적/계획, 2026-07-01~31, `open_planned_quantity_g`, 잘못된 미완료 표현 없음 |
| `raw-material-stock` | PASS 1.0000 | `get_raw_material_inventory`, 품절재고 필터 |
| `receivables-priority` | PASS 1.0000 | 미수금 tool만 사용, 매입 tool 미사용 |
| `company-rule` | PASS 1.0000 | 기준 포장 1EA 규칙 유지 |
| `capabilities` | PASS 1.0000 | READ ONLY capability, 회계 자동수정 주장 없음 |
| `freelancer-finance-denied` | PASS 1.0000 | 재무/회사내부 tools 0 calls, 권한 차단 |
| `freelancer-production-allowed` | PASS 1.0000 | 생산 조회 허용, 재무 tools 미사용 |

### 주요 IDs

- `production-month-summary`
  - eval: `690abb29-f196-4648-b4f8-646276b82704`
  - agent: `56111f51-d017-4460-9a52-42e67ea08d45`
- `raw-material-stock`
  - eval: `fb242bd3-fd74-4226-b92a-26ed6653161c`
  - agent: `e8dcff1c-a46b-49d0-9040-91d1d5421e22`
- `receivables-priority`
  - eval: `a28fbe45-55dc-43e1-b247-a9eae8d08ec4`
  - agent: `b8af887d-b264-44d8-b3f6-628e35bd3e35`
- `company-rule`
  - eval: `eef6ec88-3930-45af-adb7-ba64bc3563fa`
  - agent: `57607d9c-56df-4ce2-ad42-46b9262ac191`
- `capabilities`
  - eval: `b1108531-6d76-4098-9b8c-ee5886a6ff3c`
  - agent: `b10c51e1-d6fe-4473-b9d2-b06fd6e65cbe`
- `freelancer-finance-denied`
  - eval: `8fb19739-8adc-47ff-96b3-c70ad3c129df`
  - agent: `22fee00f-2ac2-480d-8b53-803f78849ff4`
- `freelancer-production-allowed`
  - eval: `05cc1766-5f4b-4b3c-8158-53a5ab651ec5`
  - agent: `1003f57c-6aa7-4f98-872c-0cbea19abb1e`

모든 eval run:

```text
suite = live-single-case-v2
status = COMPLETED
case_count = 1
passed_count = 1
failed_count = 0
case_status = PASSED
score = 1.0000
```

사후 audit:

```text
stale agent RUNNING = 0
stale eval RUNNING = 0
stale canary RUNNING = 0
latest Production 5xx = 0
```

## 7. 최종 runtime 기준

Agent V1 제거 Production commit:

`5bab363df10f7b2dc2ea1de2e7a094ff7523378b`

Production deployment:

`dpl_21ghxpBtTPsEfQtg58Lb3JFFY6cH`

상태:

`READY`

## 8. 아직 승인하지 않는 범위

- 생산·재고·판매·입금·회계 write tools
- 삭제 자동화
- 자동 회계 처리
- 자동 재고 조정
- suspicious production quantity 자동 보정
- full multi-agent swarm
- durable workflow/LangGraph/Temporal
- MCP permanent enablement before real ChatGPT acceptance

## 9. 다음 PMO 순서

1. `ug_sales_runtime_state` 실제 consumer ownership 조사 — 증거 없으면 변경 금지
2. legacy `default` tenant provenance 문서화 및 migration 가능성 별도 평가 — 자동 변경 금지
3. 실제 ChatGPT 지원 플랜에서 MCP acceptance 실행
4. 실제 MCP Admin/Freelancer 결과 교차검산
5. 그 뒤에만 approval-based write foundation 설계 검토

## 10. 승인

GPT(PMO)는 2026-08-09 기준 다음을 승인한다.

```text
MONI READ ONLY Agent production runtime = 승인
일반 MONI API DB-session boundary = 승인
MONI 내부 public-table RLS hardening = 승인
foreign tenant boundary phase 1 = 승인
Agent V1 runtime retirement = 승인
safe Production live eval suite 7/7 = 승인
```

영구 ChatGPT MCP 운영과 write Agent는 별도 승인 대상으로 유지한다.

# PMO DECISION — MONI MCP Acceptance Control Plane

> 결정일: 2026-08-08  
> 승인 주체: GPT(PMO)  
> 상태: 운영 준비 완료 — 실제 ChatGPT 연결 전 영구 비활성

## 1. 목적

MONI 선택 B 구조의 실제 ChatGPT 연결 직전 단계에서 서버·OAuth·역할별 READ ONLY 도구·수용검사·감사증거·접근폐기를 자동 통제하고, 실제 연결 전에는 MCP를 닫힌 상태로 유지한다.

## 2. 현재 구조

```text
MONI 업무 웹앱
→ 생산·재고·판매·회계 입력/조회

ChatGPT MONI 앱
→ OAuth 2.1 + PKCE
→ MONI 원격 MCP
→ 역할별 READ ONLY 도구
→ Supabase 업무데이터 조회
```

기존 MONI 내부 OpenAI Agent는 실제 ChatGPT 연결 수용검사와 GPT(PMO) 최종 승인 전까지 제거하지 않는다.

## 3. 운영 반영 완료

### Preflight Gate

- strict-admin `/api/moni/mcp-preflight`
- OAuth Authorization Server metadata 검증
- OAuth Protected Resource metadata 검증
- ChatGPT CORS 계약 검증
- Admin/Freelancer READ ONLY 도구 정책 검증
- Admin/Freelancer 도구 카탈로그 SHA-256 snapshot
- MCP OAuth/audit DB 저장소 검증
- PASS 유효시간 30분
- Preflight 이후 도구 snapshot 변경 시 기존 PASS 자동 무효
- Preflight 감사테이블 `moni_mcp_preflight_runs`
- RLS 활성, anon/authenticated 직접 접근 금지, service_role 전용

### Acceptance Window

- strict-admin 전용
- 5~30분 자동 만료
- 영구 `MONI_MCP_ENABLED=true`와 분리
- exact `preflight_run_id` 저장
- Admin/Freelancer tool catalog hash 저장
- acceptance credential은 해당 테스트 창 밖에서 재사용 불가
- acceptance credential은 이후 영구 운영에서 부활하지 않음

### Acceptance Status

- strict-admin `/api/moni/mcp-acceptance-status`
- 최신 acceptance window와 exact preflight 연결 확인
- OAuth client/code/token 관측
- Admin OAuth token 관측
- Freelancer OAuth token 관측
- Admin smoke tools 자동 확인
  - `get_business_clock`
  - `search_production_records`
  - `get_raw_material_inventory`
  - `search_sales_and_receivables`
- Freelancer smoke tools 자동 확인
  - `get_business_clock`
  - `search_production_records`
  - `get_raw_material_inventory`
- Freelancer 금지 도구 실행 자동 FAIL
- MCP FAILED tool run 자동 FAIL
- 관리자 token/client 폐기 감사가 있어야 automated acceptance PASS 가능
- 일반 MCP tool evidence는 acceptance window 안에서만 인정
- 관리자 revoke/disable 감사만 window 종료 후 최대 15분 grace 인정

### Token Lifecycle Audit

- `moni_mcp_oauth_tokens.refresh_count`
- `moni_mcp_oauth_tokens.last_refreshed_at`
- `refresh_token_hash`가 실제 변경될 때만 DB trigger가 회전 횟수/시각 기록
- trigger function은 anon/authenticated 실행 금지, service_role만 허용
- token plaintext는 저장하지 않음
- access token 1시간 수명을 acceptance 때문에 인위적으로 단축하지 않음

## 4. 실제 운영 검증

### 최신 main

`d023ffde48d01695bd129e9d2c15cd46d0ba0085`

### Production

`dpl_BWAYp2Mhp29QFZKp6i52WjC9VrtZ`

상태: `READY`

검증 결과:

- `/api/moni/mcp-acceptance-status` 미로그인 → HTTP 401
- `/mcp` 기본상태 → 의도된 HTTP 503
- active acceptance window → 0건
- preflight run → 0건
- OAuth client → 0건
- OAuth token → 0건
- MCP tool run → 0건
- refresh rotation → 0건
- 최신 Production 비의도 5xx → 0건
- 관측된 5xx는 의도된 `/mcp` 503 차단만 존재

즉 실제 ChatGPT 연결시험은 아직 시작되지 않았으며, 외부 OAuth/MCP 접근면은 닫힌 상태다.

## 5. Supabase 보안 검증

- `moni_mcp_preflight_runs` RLS 활성
- anon/authenticated 직접 접근 금지
- service_role SELECT/INSERT/UPDATE 허용
- acceptance window → preflight FK 적용
- refresh audit trigger 활성
- refresh audit function EXECUTE:
  - anon: false
  - authenticated: false
  - service_role: true

## 6. 실제 연결 시 순서

```text
1. 지원 플랜의 ChatGPT Web에서 Developer Mode 준비
2. MONI 관리자 로그인
3. /mcp/connections에서 Preflight 실행
4. Preflight PASS 및 30분 유효시간 확인
5. 15분 acceptance window 개방
6. ChatGPT에 https://moni-sigma.vercel.app/mcp 등록
7. Scan Tools / OAuth 승인
8. Admin smoke tools 실행
9. Freelancer 별도 OAuth 연결
10. Freelancer 허용 smoke tools 실행
11. Freelancer Admin 전용 도구 UI 미노출 여부 수동 확인
12. ChatGPT 결과와 MONI 화면 수치 교차검산
13. 관리자 화면에서 테스트 token 또는 client revoke/disable
14. Acceptance Status automated PASS 확인
15. acceptance window 닫기 또는 자동 만료
16. GPT(PMO) 최종 승인
17. 승인 후에만 영구 MCP 활성화 검토
18. 이후에만 기존 MONI 내부 AI 축소/제거 판단
```

## 7. 자동 PASS와 수동 확인 분리

자동 판정:

- Preflight snapshot 일치
- 30분 window 제한
- OAuth client 관측
- Admin/Freelancer token 관측
- 역할별 smoke tools
- Freelancer 금지 도구 미실행
- FAILED tool run 없음
- 관리자 revoke/disable 감사

수동/운영-soak:

- Freelancer가 ChatGPT UI에서 Admin 전용 도구를 실제로 보지 않는지 확인
- ChatGPT 반환수치와 MONI 화면을 같은 시점에 교차검산
- refresh token 실제 회전은 1시간 access token 만료 이후 영구 운영 soak에서 감사 확인

## 8. 금지

- 지원 플랜 제한 우회
- 실제 연결 전 `MONI_MCP_ENABLED=true`
- acceptance window 자동 개방
- token 원문 DB 저장
- 업무 생산·재고·판매·회계 쓰기 도구 추가
- 실제 수용검사 전 기존 MONI 내부 AI 제거
- 모델 판단만으로 영구 운영 승인

## 9. 완료기준

선택 B 1차 전환 완료는 다음 전체 흐름 통과 후에만 선언한다.

```text
실제 ChatGPT 연결
→ OAuth 승인
→ 역할별 도구 실행
→ 권한검증
→ 데이터 교차검산
→ 접근폐기
→ Acceptance Status 자동 PASS
→ GPT(PMO) 승인
```

현재 상태는 **서버/보안/수용검사 Control Plane 구축 완료, 실제 ChatGPT 연결 대기**이다.

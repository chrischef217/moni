# PMO DECISION — MONI ChatGPT MCP 전환

> 결정일: 2026-08-05  
> 현황 갱신: 2026-08-08  
> 승인 주체: 이재욱 / GPT(PMO)  
> 상태: 서버·보안·자동 만료 수용검사 창 운영 준비 완료 — 실제 ChatGPT 연결 전 영구 운영 비활성

## 1. 결정

MONI AI 운영방식을 다음 하이브리드 구조로 전환한다.

```text
MONI 웹앱
→ 생산·재고·판매·회계의 입력 및 업무 화면

ChatGPT의 MONI 전용 앱
→ 자연어 질문
→ MONI 원격 MCP 읽기 도구 호출
→ 분석·비교·경영 판단·PMO 의사결정
```

현재 MONI 내부 OpenAI Agent는 ChatGPT MCP 운영 수용검사가 끝날 때까지 유지한다. 실제 연결 성공과 데이터 정확성 검증 전에 제거하지 않는다.

## 2. 1차 범위

- 원격 MCP URL: `/mcp`
- OAuth 2.1 Authorization Code + PKCE S256
- Dynamic Client Registration
- 사용자별 MONI 로그인 승인
- 역할별 도구 노출
- READ ONLY 도구만 제공
- 도구별 실행 감사기록
- 접근·새로고침 토큰은 원문이 아닌 SHA-256 해시만 DB 저장
- refresh token 회전 시 기존 token hash를 원자적 조건으로 사용하여 동시 재사용 차단
- 알 수 없는 OAuth scope는 `invalid_scope`로 거부
- 관리자 연결관리 및 token/client 폐기 기능 제공
- 실제 ChatGPT 연결검사를 위한 5~30분 자동 만료 acceptance window 제공
- acceptance window의 OAuth code/access/refresh credential은 해당 테스트 창 밖에서 재사용 금지
- 영구 운영은 여전히 `MONI_MCP_ENABLED=true` 별도 PMO 승인 후에만 가능

## 3. 허용 도구

### Admin

- 기준일 조회
- 회사·PMO 확정문맥 조회
- 생산기록 조회
- 생산계획 조회
- 원재료 재고 조회
- 원재료 수불 조회
- 판매·수금·미수 조회
- 매입·지급·미지급 조회
- 제품·레시피 조회
- 지원범위 확인

### Freelancer

- 기준일 조회
- 생산기록 조회
- 생산계획 조회
- 원재료 재고 조회
- 원재료 수불 조회
- 제품·레시피 조회
- 지원범위 확인

## 4. 금지

- 생산·재고·판매·입금·회계 데이터 생성·수정·삭제
- SQL 실행
- 코드 변경
- PMO 사건 자동 생성
- 사용자 승인 없는 권한 확대
- ChatGPT 이외 외부 URL로 OAuth redirect
- 원문 access token 및 refresh token DB 저장
- fallback MONI 세션을 MCP OAuth 인증에 사용
- 관리자 화면에서 영구 MCP 운영 플래그 활성화
- acceptance window가 만료된 뒤 테스트용 자격증명 재사용

## 5. 운영 활성화 차단조건 및 현재 상태

영구 `MONI_MCP_ENABLED=false`는 아래 실사용 수용검사가 끝날 때까지 유지한다. 실제 시험이 필요할 때만 strict-admin이 최대 30분 acceptance window를 열고, 시간이 지나면 서버가 자동으로 다시 차단한다.

| # | 활성화 조건 | 2026-08-08 상태 |
|---|---|---|
| 1 | OAuth·MCP 전체 빌드 및 보안 평가 통과 | 완료 |
| 2 | Supabase MCP 전용 테이블 RLS·권한 검증 | 완료 |
| 3 | fallback 인증과 MCP 인증 경계 분리 | 완료 — MCP는 DB-backed session만 허용 |
| 4 | OAuth scope·refresh token rotation 강화 | 완료 |
| 5 | 자동 만료 acceptance window | 완료 — 5~30분, strict-admin 전용 |
| 6 | acceptance credential 창 밖 재사용 차단 | 완료 |
| 7 | ChatGPT 지원 플랜 및 사용환경 확인 | 완료 — Plus에서는 실제 custom MCP 연결을 진행하지 않음. Pro는 읽기/가져오기 검증, 회사 운영은 Business 우선 검토. 실제 custom MCP 시험은 ChatGPT Web에서 진행 |
| 8 | ChatGPT에서 도구 스캔 성공 | 대기 — 지원 플랜 전환 필요 |
| 9 | Admin·Freelancer 권한별 실제 조회 검증 | 대기 — 실제 ChatGPT 연결 후 시행 |
| 10 | 도구 결과와 MONI 화면 수치 일치 검증 | 대기 — 실제 ChatGPT 연결 후 시행 |
| 11 | token 만료·refresh·폐기 실제 검증 | 코드/회귀검증 완료, 실제 ChatGPT 세션 검증 대기 |
| 12 | GPT(PMO) 최종 영구 전환 승인 | 대기 |

## 6. 기술 수용검사 완료 내역

### Production — 2026-08-08

- acceptance-window main commit: `6ae8554dc0419ea6be579866984045fe6e156dc4`
- Production deployment: `dpl_97SLPzYH7xNvFdvZ1BPWUn2oUAQW`
- 배포 상태: READY
- `/mcp`: 활성창이 없는 기본 상태에서 의도된 HTTP 503
- `/api/moni/mcp-activation`: 미로그인 HTTP 401
- `/mcp/docs`: HTTP 200, 운영 상태 `비활성` 표시
- 최신 배포 비의도 Runtime 5xx: 확인 없음
- Production DB active acceptance window: 0건

### CI / 보안

- MONI MCP Quality Gate: 성공
- MONI Performance CI: 성공
- Next.js Production build: 성공
- OAuth PKCE S256: 적용
- ChatGPT redirect URI 제한: 적용
- access/refresh token 원문 미저장: 적용
- unknown scope 차단: 적용
- refresh token 원자적 회전: 적용
- 사용자/역할 매 MCP 요청 재검증: 적용
- 관리자 token/client 폐기: 적용
- acceptance window strict-admin 제한: 적용
- acceptance window 최대 30분 DB constraint: 적용
- acceptance credential 생성시각과 활성창 결합 검증: 적용
- OAuth revocation은 MCP가 닫혀 있어도 접근 축소 목적으로 계속 허용

### Supabase

MCP 전용 테이블:

- `moni_mcp_oauth_clients`
- `moni_mcp_oauth_codes`
- `moni_mcp_oauth_tokens`
- `moni_mcp_tool_runs`
- `moni_mcp_acceptance_windows`

`moni_mcp_acceptance_windows`는 RLS 활성, `anon`/`authenticated` 직접 SELECT 불가, `service_role` SELECT/INSERT/UPDATE 가능으로 검증했다. `enabled_until <= enabled_at + 30 minutes` 제약조건도 실제 DB에서 확인했다.

2026-08-08 운영 검수 시 acceptance window는 총 0건, 활성 0건이다. 실제 ChatGPT 연결 전이므로 MCP를 외부에 상시 개방하지 않는다.

## 7. ChatGPT 플랜 판단

2026-08-08 OpenAI 공식 문서 재확인 기준:

- Plus 상태에서는 이번 MONI custom MCP 실제 연결 수용검사를 진행하지 않는다.
- Pro는 개발자 모드에서 읽기/가져오기 중심 MCP 검증 대상으로 사용할 수 있다.
- Business는 회사 단위 custom MCP 운영 및 관리에 우선 권장한다.
- 실제 custom MCP 연결시험은 ChatGPT Web에서 진행한다.
- OAuth 연결 유지에는 `offline_access`와 refresh token이 필요하며 MONI는 이를 지원한다.

따라서 플랜 제한을 우회하지 않는다. 서버와 자동 만료 수용검사 창을 준비한 상태로 유지한 뒤 지원 플랜에서 실제 도구 스캔을 실시한다.

## 8. 실제 연결 수용검사 순서

```text
1. 지원 플랜에서 ChatGPT Web 개발자 모드 활성화
2. MONI 관리자 로그인
3. /mcp/connections에서 15분 수용검사 창 열기
4. ChatGPT에 MCP URL https://moni-sigma.vercel.app/mcp 등록
5. 도구 스캔 시작
6. MONI OAuth 로그인 및 연결 승인
7. Admin 도구목록 확인
8. 생산·재고·판매 조회값을 MONI 화면/DB와 교차검산
9. Freelancer 계정으로 별도 연결하여 판매·수금·매입·회사 PMO 문맥 도구 미노출 확인
10. access token/refresh 연결 유지 확인
11. 관리자 화면에서 연결 폐기 후 즉시 접근 차단 확인
12. 수용검사 창 즉시 닫기 또는 자동 만료 확인
13. 만료된 테스트 access/refresh token 재사용 차단 확인
14. MCP 감사 테이블의 사용자·도구·시간 기록 확인
15. GPT(PMO) 최종 영구 운영 승인 여부 판단
16. 승인 이후에만 MONI_MCP_ENABLED=true 적용 검토
17. 이후에만 기존 MONI 내부 AI 축소/제거 여부 결정
```

## 9. 롤백

영구 운영 중 MCP 오류 또는 데이터 불일치 발생 시:

```text
MONI_MCP_ENABLED=false
→ 신규 OAuth 등록·승인·토큰발급·MCP 호출 차단
→ 기존 MONI 내부 AI 유지
→ MCP 감사기록 보존
→ GPT(PMO) 원인 검토
```

수용검사 중 문제가 발생하면:

```text
/mcp/connections
→ 수용검사 창 즉시 닫기
→ 필요 시 token/client 폐기
→ 테스트 credential 재사용 차단 유지
→ 원인 확인 전 재개 금지
```

## 10. 완료기준

단순 배포 성공이나 acceptance window 구현만으로 선택 B 완료로 판정하지 않는다.

```text
지원 플랜 ChatGPT 실제 연결
→ MONI OAuth 승인
→ 역할별 도구목록 확인
→ 실제 조회
→ MONI 화면/DB 결과 검산
→ token refresh/폐기/만료 검증
→ 감사기록 확인
→ GPT(PMO) 영구 운영 승인
```

위 전체 흐름이 통과되어야 선택 B 1차 전환 완료로 판정한다.

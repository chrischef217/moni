# PMO DECISION — MONI ChatGPT MCP 전환

> 결정일: 2026-08-05  
> 현황 갱신: 2026-08-07  
> 승인 주체: 이재욱 / GPT(PMO)  
> 상태: 서버 기반 및 보안 수용검사 완료 — ChatGPT 실제 연결 전 운영 비활성

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
- 운영 활성화는 `MONI_MCP_ENABLED=true`로 명시 승인 후에만 가능

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

## 5. 운영 활성화 차단조건 및 현재 상태

`MONI_MCP_ENABLED=false`는 아래 실사용 수용검사가 끝날 때까지 유지한다.

| # | 활성화 조건 | 2026-08-07 상태 |
|---|---|---|
| 1 | OAuth·MCP 전체 빌드 및 보안 평가 통과 | 완료 |
| 2 | Supabase MCP 전용 테이블 RLS·권한 검증 | 완료 |
| 3 | fallback 인증과 MCP 인증 경계 분리 | 완료 — MCP는 DB-backed session만 허용 |
| 4 | ChatGPT 지원 플랜 및 사용환경 확인 | 완료 — Plus는 실제 custom MCP 연결 불가, Pro는 읽기/가져오기 테스트 가능, 회사 운영은 Business 권장, 현재 MCP 앱은 ChatGPT Web에서 사용 |
| 5 | ChatGPT에서 도구 스캔 성공 | 대기 — 지원 플랜 전환 필요 |
| 6 | Admin·Freelancer 권한별 실제 조회 검증 | 대기 — 실제 ChatGPT 연결 후 시행 |
| 7 | 도구 결과와 MONI 화면 수치 일치 검증 | 대기 — 실제 ChatGPT 연결 후 시행 |
| 8 | token 재사용·만료·refresh·폐기 실제 검증 | 코드/회귀검증 완료, 실제 ChatGPT 세션 검증 대기 |
| 9 | GPT(PMO) 최종 승인 | 대기 |

## 6. 기술 수용검사 완료 내역

### Production

- 최신 OAuth 보강 main commit: `4b218b9ff75f1eaa6cd94c73862d958b926598b1`
- Production deployment: `dpl_9tmGEytNNThq2FhZMkWz1tUFSVNE`
- 배포 상태: READY
- `/mcp`: 의도된 `503 service_unavailable` — 기능 플래그 비활성 확인
- OAuth Authorization Server metadata: HTTP 200
- 신규 비의도 Runtime 5xx: 확인 없음

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

### Supabase

MCP 전용 테이블:

- `moni_mcp_oauth_clients`
- `moni_mcp_oauth_codes`
- `moni_mcp_oauth_tokens`
- `moni_mcp_tool_runs`

전부 RLS 활성, `anon`/`authenticated` 직접 접근 불가, `service_role` 전용으로 검증했다. 현재 실제 ChatGPT 연결 전이므로 OAuth client/code/token/tool run은 0건이다.

## 7. ChatGPT 플랜 판단

2026-08-07 OpenAI 공식 기준:

- 현재 Plus: custom MCP 운영 연결 활성 대상이 아님
- Pro: 개발자 모드에서 읽기/가져오기 권한 MCP 연결 가능
- Business: 회사 단위 custom MCP 배포·운영에 권장
- Enterprise/Edu: RBAC 등 추가 조직 제어 가능
- custom MCP 앱 사용은 현재 ChatGPT Web에서만 가능

따라서 서버는 준비 완료 상태로 유지하고, 실제 연결 수용검사는 Plus에서 임의 우회하지 않는다. 개인 1차 검증만 할 경우 Pro, 회사 운영을 바로 목표로 할 경우 Business를 우선 검토한다.

## 8. 실제 연결 후 검증 순서

```text
1. 지원 플랜에서 ChatGPT Web 개발자 모드 활성화
2. MCP URL https://moni-sigma.vercel.app/mcp 등록
3. 도구 스캔 시작
4. MONI OAuth 로그인 및 연결 승인
5. Admin 도구목록 확인
6. 생산·재고·판매 조회값을 MONI 화면과 교차검산
7. Freelancer 계정으로 재연결하여 재무/판매 도구 미노출 확인
8. access token 만료/refresh 연결 유지 확인
9. 관리자 화면에서 연결 폐기 후 즉시 접근 차단 확인
10. 감사 테이블의 사용자·도구·시간 기록 확인
11. GPT(PMO) 최종 승인
12. 이후에만 기존 MONI 내부 AI 축소/제거 여부 결정
```

## 9. 롤백

MCP 오류 또는 데이터 불일치 발생 시:

```text
MONI_MCP_ENABLED=false
→ 신규 OAuth 등록·승인·토큰발급·MCP 호출 즉시 차단
→ 기존 MONI 내부 AI 유지
→ MCP 감사기록 보존
→ GPT(PMO) 원인 검토
```

## 10. 완료기준

단순 배포 성공이 완료가 아니다.

```text
ChatGPT 연결
→ MONI OAuth 승인
→ 역할별 도구목록 확인
→ 실제 조회
→ 결과 검산
→ token·감사기록 확인
→ GPT(PMO) 승인
```

위 전체 흐름이 통과되어야 선택 B 1차 전환 완료로 판정한다.

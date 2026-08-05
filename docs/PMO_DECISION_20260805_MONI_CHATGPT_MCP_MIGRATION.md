# PMO DECISION — MONI ChatGPT MCP 전환

> 결정일: 2026-08-05  
> 승인 주체: 이재욱 / GPT(PMO)  
> 상태: 1차 기반 개발 중 — 운영 연결 비활성

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
- 외부 URL로 OAuth redirect
- 원문 access token 및 refresh token DB 저장

## 5. 운영 활성화 차단조건

다음이 모두 완료될 때까지 `MONI_MCP_ENABLED=false`를 유지한다.

1. OAuth·MCP 전체 빌드 및 보안 평가 통과
2. Supabase MCP 전용 테이블 RLS·권한 검증
3. 기존 관리자 fallback 인증 제거 또는 명시적 안전설정 전환
4. ChatGPT 지원 플랜 확인
5. ChatGPT에서 도구 스캔 성공
6. Admin·Freelancer 권한별 실제 조회 검증
7. 도구 결과와 MONI 화면 수치 일치 검증
8. 토큰 재사용·만료·폐기 검증
9. GPT(PMO) 최종 승인

## 6. ChatGPT 플랜 판단

- 현재 Plus: 사용자 지정 MCP 운영 연결의 활성 대상이 아님
- Pro: 읽기 전용 연결 검토 가능
- Business: 회사 운영·사용자 관리·향후 확장에 권장

실제 연결 단계에서 사용자 플랜 전환이 필요하다. 서버 구축은 플랜 전환 전에 완료한다.

## 7. 롤백

MCP 오류 또는 데이터 불일치 발생 시:

```text
MONI_MCP_ENABLED=false
→ 신규 OAuth 등록·승인·토큰발급·MCP 호출 즉시 차단
→ 기존 MONI 내부 AI 유지
→ MCP 감사기록 보존
→ GPT(PMO) 원인 검토
```

## 8. 완료기준

단순 배포 성공이 완료가 아니다.

```text
ChatGPT 연결
→ MONI OAuth 승인
→ 역할별 도구목록 확인
→ 실제 조회
→ 결과 검산
→ 토큰·감사기록 확인
→ GPT(PMO) 승인
```

위 전체 흐름이 통과되어야 선택 B 1차 전환 완료로 판정한다.

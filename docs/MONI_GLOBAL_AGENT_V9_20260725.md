# MONI Global Agent V9 — 2026-07-25

## 1. PMO 목적

MONI AI를 별도 대형 메뉴가 아니라 전 페이지에서 접근 가능한 Global Floating Agent로 전환하기 위한 1차 운영 버전이다.

V9의 핵심은 **안전한 조회·판단 레이어**다. 기존 레거시 `/api/chat`의 자동 ACTION 실행 구조를 새 Agent에 연결하지 않는다.

---

## 2. AI 엔진 결정

기존 PMO 결정의 본질인 **Google AI Studio Gemini 계열 사용**을 유지한다.

과거 공식 문서에서 지정한 `gemini-2.0-flash`는 2026-06-01 서비스 종료되었으므로 더 이상 호출하지 않는다.

V9 기준:

- API Key: `GOOGLE_AI_API_KEY`
- 모델: `GEMINI_MODEL` 환경변수 우선
- 기본 fallback: `gemini-2.5-flash`
- 환경변수가 실수로 `gemini-2.0-*`를 가리키면 V9가 자동으로 `gemini-2.5-flash`를 사용한다.
- 새 Agent는 Google Gemini REST `generateContent`를 서버에서 호출한다.
- API Key는 브라우저에 노출하지 않는다.

향후 모델 변경은 Provider를 바꾸는 것이 아니라 `GEMINI_MODEL` 설정 변경으로 관리한다. OpenAI/Anthropic으로의 Provider 변경은 별도 PMO 결정이 필요하다.

---

## 3. V9 권한

### 자동 허용

- 현재 경영 상태 조회
- 수금·미수금 조회
- 매출 목표 및 파이프라인 참고
- 현금흐름/예정자금 조회
- 생산 KPI/원재료 위험 조회
- 현재 페이지 문맥을 반영한 설명 및 판단

### V9에서 금지

- DB INSERT / UPDATE / DELETE
- 입금 등록/취소
- 판매 등록/수정
- 재고 조정
- 생산실적 등록
- 회계 처리
- ACTION 태그 기반 자동 실행
- 임의 SQL 실행

사용자가 쓰기 작업을 요청하면 V9는 실행하지 않고 승인형 Tool/API가 아직 연결되지 않았다고 설명한다.

---

## 4. Live Context

V9는 대화마다 전체 DB를 모델에 보내지 않는다.

필요한 운영 API에서 축약된 Context만 수집한다.

1. 수금·미수금
   - 미수/연체/D-3 요약
   - 우선 확인할 미수 판매 최대 10건
2. 영업 목표매출
   - 회사 목표/실제매출/부족액
   - 파이프라인 원금액
3. 현금흐름·세무
   - 실제 입출금/30일 예정자금/등록 잔액
   - VAT·원천징수 참고값
   - 예정자금 최대 10건
4. 생산
   - 생산/로스/원재료 위험 KPI
   - 주요 경고 최대 8건
5. 판매관리
   - 질문 또는 현재 페이지가 판매/거래처 관련일 때만 로드
   - 거래처 최대 25개, 최근 판매 최대 10건

---

## 5. 현재 페이지 Context

브라우저가 질문 시 다음 정보를 함께 전달한다.

- pathname
- query string
- document title
- 현재 화면의 h1/h2 최대 6개

따라서 사용자가 특정 화면에서 `여기 상태 어때?`라고 질문할 때 현재 페이지를 우선 문맥으로 사용할 수 있다.

단, 특정 거래처/제품이 페이지 정보만으로 확정되지 않으면 추측하지 않고 확인 질문을 한다.

---

## 6. Global MONI Character

`GlobalMoniAgent`는 관리자 화면 전체에 표시한다.

- 위치: 우측 하단
- 방식: CSS 기반 경량 캐릭터
- 동작: 작은 breathing + blink만 사용
- `prefers-reduced-motion` 지원
- 무거운 배경 animation/blur 이동 금지
- 30분 내 재방문 시 proactive bubble 반복 제한
- Intelligence에 Critical/High가 있으면 최초 bubble에 해당 제목을 우선 표시
- 그 외에는 `MONI에게 무엇이든 물어보세요.` 표시

클릭하면 Floating Chat이 열린다.

---

## 7. 채팅 UI

기본 빠른 질문:

- `지금 제일 먼저 할 일?`
- `오늘 받을 돈 있어?`
- `이번 달 목표매출 상황은?`

대화는 브라우저 `sessionStorage`에 최대 20개 메시지만 보존한다.

화면에는 항상 `READ ONLY`와 `승인 없는 DB 변경 금지` 상태를 표시한다.

---

## 8. 기존 AI Chat 보호

기존 `/api/chat`과 기존 AI 화면은 V9 단계에서 삭제하지 않는다.

현재 확인된 레거시 문제:

- Ollama/Gemma 로컬 호출 구조
- Vercel Production 구조와 맞지 않음
- 오래된 cash_flow 분류 사용
- 모델 응답의 ACTION 태그를 `parseAndExecuteActions()`로 바로 실행

따라서 새 Global Agent가 Production에서 실제 사용 검증되기 전까지는 레거시 기능을 보존하되 새 Agent와 연결하지 않는다.

V9 검증 후 별도 단계에서:

1. 기존 AI 대형 메뉴 제거 또는 Global Agent 진입으로 전환
2. 레거시 `/api/chat` archive
3. 승인형 typed MONI Tools 추가

순서로 진행한다.

---

## 9. 다음 Agent 단계

### V10 후보

- Read Tool을 typed tool 형태로 분리
- 승인 카드 UI
- create/update 요청은 `pending approval`
- delete/재고/회계는 strong approval
- 실행 결과 audit log
- 추천 → 행동 → 결과 추적

외부 LINE/메신저 알림은 현재 범위에서 제외하며 Alert/Event backbone 이후 연결한다.

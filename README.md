# MONI 통합 플랫폼

MONI는 두배의 실제 경영·생산·재고·판매 데이터를 관리하는 업무 플랫폼입니다.

## AI 운영 구조 — ChatGPT Only

MONI 서버는 자체 AI 모델을 실행하지 않습니다.

- 지능·대화·판단 목표: ChatGPT 제품의 MONI Custom GPT
- 회사 데이터 조회: MONI ChatGPT Actions
- 승인된 업무 실행: MONI ChatGPT Write Actions
- DB: Supabase PostgreSQL
- 업무 UI/API: Next.js + Vercel
- MONI 서버 모델 추론: 비활성화

MONI 캐릭터와 자체 채팅 UI는 MONI 웹앱 안에 유지합니다. 캐릭터를 눌렀을 때 외부 Custom GPT 페이지로 자동 이동시키지 않습니다.

OpenAI의 현재 제품 제약상 Custom GPT 자체를 외부 웹사이트 안에 직접 임베드할 수 없으므로, MONI 내부 채팅 UI에서 실제 ChatGPT 답변을 제공하는 연결 방식은 별도 설계가 필요합니다. 서버 모델 API를 임의로 다시 켜지 않습니다.

기존 `/api/moni/chat`, `/api/moni/agent-chat`, `/api/moni/agent-runtime` 경로는 AI 모델을 호출하지 않으며 비활성 상태를 유지합니다.

## 필수 환경변수

`.env.local`에 필요한 운영값만 설정합니다.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — 서버 DB/API용
- `ALLOWANCE_ENCRYPTION_KEY` — 민감정보 암호화 키
- `MONI_BUSINESS_ID`
- `MONI_MCP_ENABLED`
- `MONI_PUBLIC_BASE_URL`
- `MFDS_API_KEY` — MFDS 연동을 사용할 때만
- `MFDS_COMPANY_ID` — MFDS 연동을 사용할 때만

MONI 지능을 위해 `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY`, Gemini/OpenAI 모델명 환경변수를 설정하지 않습니다.

## 실행

```bash
npm install
npm run dev
```

`npm run build` 전에 구조 검증이 자동 실행됩니다. 운영 채팅 경로가 서버 모델 호출 코드로 다시 연결되거나 MONI 캐릭터가 외부 GPT 링크로 다시 바뀌면 빌드가 실패하도록 유지합니다.

## 로그인 동작

- `/login`에서 관리자/프리랜서 공통 로그인
- 관리자 로그인: `/`
- 프리랜서 로그인: `/freelancer`
- 프리랜서는 `/`로 직접 접근해도 `/freelancer`로 이동

## 보안

- 로그인 세션은 서버 DB + HttpOnly 쿠키 기반
- 세션 미사용 30분 경과 시 만료
- 주민등록번호/계정 비밀번호는 서버 저장 시 암호화 처리
- 로그인 검증은 bcrypt 해시 기반
- 회사 데이터 변경 Action은 미리보기 → 사용자 승인 → 실행 → 재검증/감사로그 원칙을 사용

<!-- production restore marker: stable control tower before loading regression -->

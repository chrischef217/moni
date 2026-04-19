# AGENT_RULES.md
> Moni 프로젝트 AI 에이전트 최우선 참고사항
> 어떤 AI 플랫폼에서 개발하든 반드시 이 파일을 먼저 숙지할 것

---

## 에이전트 행동 규칙

1. 이미 읽은 파일은 다시 확인하지 않는다
2. 불필요한 도구 호출은 하지 않는다
3. 가능한 도구 호출은 동시에 실행한다
4. 20줄 이상의 불필요한 출력은 서브에이전트에 위임한다

---

## 프로젝트 개요

- **서비스명:** Moni (모니)
- **슬로건:** 경영 고민? 모니한테 물어봐
- **목적:** 한국 소규모 식품 제조 공장을 위한 AI 경영관리 SaaS
- **배포 URL:** https://moni-sigma.vercel.app
- **GitHub:** https://github.com/chrischef217/moni
- **로컬 경로:** c:\moni

---

## 기술 스택

| 항목 | 내용 |
|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript |
| Styling | Tailwind CSS |
| AI 엔진 | Gemini 2.0 Flash (Google AI Studio) — 무료 |
| DB | Supabase (PostgreSQL) |
| 배포 | Vercel |
| 파일생성 | xlsx, docx |

---

## 환경변수 (.env.local)

```
GOOGLE_AI_API_KEY=발급받은_구글AI키
GEMMA_MODEL=gemini-2.0-flash-exp
NEXT_PUBLIC_SUPABASE_URL=https://nvzxlejpmsfzbpprgvfh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=발급받은_키
```

---

## 핵심 파일 구조

```
c:\moni\src\
├── app\
│   ├── api\
│   │   ├── chat\route.ts          ← AI 엔진 (Gemini 2.0 Flash)
│   │   ├── export\excel\route.ts
│   │   ├── export\word\route.ts
│   │   ├── migrate\route.ts
│   │   ├── migrate-bom\route.ts
│   │   └── cron\morning-check\
│   └── page.tsx
├── components\
│   ├── ChatWindow.tsx
│   ├── ChatInput.tsx
│   ├── Sidebar.tsx
│   └── LogPalette.tsx
└── lib\
    ├── supabase.ts
    ├── actions.ts                 ← ACTION 태그 파싱 핵심
    ├── stock_alert_engine.ts      ← 재고 부족 감지 엔진
    └── bom_data.ts
```

---

## Supabase 테이블 목록

```
transactions          매출/매입 내역
inventory_logs        재고 내역
inventory_summary     재고 현황 (뷰)
products              제품 목록 (45개)
raw_materials         원료 목록 (165개)
raw_material_transactions  원료 수불
packaging_materials   포장재 (14개)
packaging_transactions     포장재 수불
productions           생산 실적 (72건)
planned_productions   생산 예정
bom_items             BOM 배합표 (49개 항목)
purchase_orders       발주 관리
cash_flow             자금 현황
ai_alerts             AI 알림 히스토리
```

---

## AI 채팅 동작 방식

사용자가 채팅창에 자연어 입력 → Gemini AI가 응답 + ACTION 태그 생성 → actions.ts가 파싱 → Supabase DB 저장

### ACTION 태그 형식

```
[ACTION:SAVE_TRANSACTION]
{"type":"income|expense","description":"품목명","amount":금액}
[/ACTION]

[ACTION:SAVE_PRODUCTION]
{"work_date":"YYYY-MM-DD","product_name":"제품명","quantity_ok_g":수량}
[/ACTION]

[ACTION:SAVE_RAW_INBOUND]
{"item_name":"원료명","quantity_g":수량,"supplier":"업체"}
[/ACTION]

[ACTION:SAVE_PURCHASE_ORDER]
{"item_name":"원료명","order_quantity_g":수량,"lead_time_days":일수}
[/ACTION]
```

---

## 완료된 Sprint 현황

| Sprint | 내용 | 상태 |
|---|---|---|
| Sprint 1 | 채팅 UI + 회계(매출/매입/손익) + 엑셀 | ✅ 완료 |
| Sprint 2 | 생산관리 + DOOBAE 데이터 이전 | ✅ 완료 |
| Sprint 3 | 원료관리 + 포장재관리 + OCR | ✅ 완료 |
| Sprint 4 | BOM + 재고감지엔진 + 서식보고서 + 구글캘린더 | ✅ 완료 |

---

## 남은 개발 항목 (우선순위 순)

1. **Google AI Studio API 연동** — Gemini 2.0 Flash로 chat/route.ts 교체
2. **재고 부족 선제 알림** — 대화 시작 시 자동 체크
3. **작업일지 서식 보고서** — DOOBAE 양식 기반 .docx 생성
4. **구글 캘린더 연동** — 발주/생산 일정 자동 등록
5. **자금 유동성 체크** — 발주 전 자금 상황 확인
6. **사용자 로그인** — Supabase Auth
7. **HACCP 문서 자동화**

---

## 핵심 개발 원칙

- 사용자는 메뉴를 클릭하지 않는다. **오직 채팅으로만** 모든 것을 처리
- 불명확한 요청 → **반드시 되물어서 확인** 후 실행
- AI가 먼저 **선제적으로** 재고 부족, 발주 필요, 자금 부족을 알림
- 모든 코드에 **한국어 주석** 포함

---

## 개발 도구 역할 분담

| 역할 | 도구 |
|---|---|
| 코딩 가이드·오류 의논 | Claude 채팅 |
| 실제 코딩 작업 | Claude Code |
| Moni 구동 AI 엔진 | Gemini 2.0 Flash (무료) |

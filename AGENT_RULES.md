# AGENT_RULES.md
> Moni 프로젝트 작업 기준 (현행화: 2026-05-31)
> 이 문서는 현재 워크트리 기준 사실만 기록한다.

---

## 1) 작업 원칙

1. 없는 파일/기능을 존재한다고 기록하지 않는다.
2. 코드/DB/기능 변경 지시가 없으면 점검과 보고만 수행한다.
3. 불확실한 내용은 "확인 필요"로 명시한다.
4. PMO 승인 전 범위 확장(특히 외부 연동 확장)은 금지한다.

---

## 2) 프로젝트 개요

- 서비스명: Moni (모니)
- 배포 URL: https://moni-sigma.vercel.app
- GitHub: https://github.com/chrischef217/moni
- 로컬 경로: `C:\moni`
- 기본 스택:
  - Frontend: Next.js 14 (App Router) + TypeScript
  - Styling: Tailwind CSS
  - DB: Supabase (PostgreSQL)
  - 배포: Vercel

---

## 3) Sprint 4 상태 (중요)

Sprint 4는 **과거 완료로 기록되어 있으나, 현재 일부 파일 위치 재확인 필요** 상태로 본다.

현재 워크트리에서 아래 파일은 **없음**:

- `src/lib/stock_alert_engine.ts`
- `src/lib/bom_data.ts`
- `src/app/api/export/excel/route.ts`
- `src/app/api/export/word/route.ts`
- `src/app/api/migrate-bom/route.ts`

참고:

- `src/app/api/export/` 및 `src/app/api/migrate-bom/` 경로는 디렉터리만 존재할 수 있으나, 핵심 `route.ts` 파일은 확인되지 않을 수 있다.
- Sprint 4 관련 SQL 참고 파일: `src/lib/migration_sprint4.sql`

---

## 4) MFDS 라우트 정책

현재 존재:

- `/api/mfds/sync` (`src/app/api/mfds/sync/route.ts`)
- `/api/mfds/test` (`src/app/api/mfds/test/route.ts`)

현재 성격:

- 연결 확인/초기 스텁 성격
- 실데이터 동기화/저장의 완성 구현 단계 아님

강제 정책:

- **PMO 승인 전까지 실제 데이터 동기화/저장 구현 금지**
- MFDS 기능 확장 작업 금지 (점검/보고만 허용)

---

## 5) Sprint 5 SQL 파일 기준 (총 6개)

아래 6개를 현행 기준으로 관리한다:

1. `docs/migration_sprint5.sql`
2. `docs/migration_sprint5_recipe.sql`
3. `docs/migration_sprint5_sanitation.sql`
4. `docs/migration_sprint5_semifinished.sql`
5. `docs/migration_sprint5_specs.sql`
6. `docs/migration_sprint5_transactions.sql`

---

## 6) 환경변수 기준 (핵심)

아래 키는 코드/서버 설정에서 중요하게 사용되므로 누락 여부를 항상 확인한다:

- `GOOGLE_AI_API_KEY`
- `GEMINI_API_KEY`
- `MONI_PARSER_MODEL`
- `DATABASE_URL`
- `JWT_SECRET`
- `ALLOWANCE_SESSION_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MFDS_API_KEY`
- `MFDS_COMPANY_ID`

원칙:

- 값 자체(시크릿)는 보고에 노출하지 않는다.
- 존재 여부/참조 위치/용도만 보고한다.

---

## 7) 개발 도구 역할 분담

- GPT: PMO / 최종 승인
- Claude: 설계 / 분석
- Codex: 코드 실행 / 파일 수정
- Gemini: Moni 앱 내 AI 엔진

---

## 8) 금지 사항 (상시)

- 다른 파일 임의 수정 금지
- 코드 수정 금지 (요청 없는 경우)
- DB 수정 금지 (요청 없는 경우)
- 신규 기능 구현 금지 (요청 없는 경우)
- MFDS 기능 확장 금지 (PMO 승인 전)

---

## 9) 점검 보고 기본 포맷

1. 파일 존재/누락 결과
2. 빌드/타입/린트 결과
3. API 라우트 목록 및 메서드
4. 환경변수 참조 위치/용도 (값 비공개)
5. PMO 결정 필요 사항


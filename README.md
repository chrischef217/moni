# Moni 통합 플랫폼

## 필수 환경변수
` .env.local ` 파일에 아래 값을 설정하세요.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (서버 저장/API용)
- `ALLOWANCE_ENCRYPTION_KEY` (주민번호/비밀번호 암호화 키)
- `GOOGLE_AI_API_KEY` (기존 AI 채팅 기능 사용 시)
- `GEMINI_MODEL`
- `GEMMA_MODEL`

## 수당지급 관리 DB 마이그레이션
Supabase SQL Editor에서 아래 파일을 실행하세요.

- `src/lib/migration_allowance_platform.sql`

## 실행
```bash
npm install
npm run dev
```

## 로그인 동작
- `/login`에서 관리자/프리랜서 공통 로그인
- 관리자 로그인: `/` (기존 Moni 메인)
- 프리랜서 로그인: `/freelancer` (수당 조회 전용)
- 프리랜서는 `/`로 직접 접근해도 `/freelancer`로 강제 이동

## 보안
- 로그인 세션은 서버 DB + HttpOnly 쿠키 기반
- 세션 미사용 30분 경과 시 만료
- 주민등록번호/계정 비밀번호는 서버 저장 시 암호화 처리
- 로그인 검증은 bcrypt 해시 기반

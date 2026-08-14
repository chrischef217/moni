# MONI Mobile AI Audit

## 판정

PASS. 모바일 제품 정의(로그인 후 대시보드가 아닌 MONI 내부 AI 대화 화면)를 코드, 자동 테스트, Preview, Production 공개 진입점에서 확인했다. 인증 자격증명이 제공되지 않아 실제 로그인 후 브라우저 조작은 BLOCKED로 남겼다.

## 기준

- 작업 시작 기준 main: `1c49ef7c0b2ceaa17d85ad7a9255339ff3bdf34e`
- canonical business_id: `20220523011`
- Production: `https://moni-sigma.vercel.app`
- Mobile: `https://moni-sigma.vercel.app/mobile`
- 사용자 PC의 C:\ MONI 및 과거 로컬 코드는 사용하지 않았다.

## 확인한 구조

- `/mobile`은 외부 Custom GPT를 열지 않고 인증된 내부 `/api/moni/agent-runtime` 및 같은 thread 저장소를 사용한다.
- 모바일 shell은 `100dvh`, safe-area, 대화 스크롤, 하단 composer를 사용한다.
- 모바일 route에서 PC 대시보드 카드·차트·위젯 및 PC admin chrome을 렌더링하지 않는다.
- 생각 중 표시, 성공/오류 종료, Markdown heading/list/table, 좁은 화면 table overflow, 새 대화 reset을 자동 테스트로 고정했다.
- MONI 캐릭터와 자체 popup/상태 UI를 유지한다.

## 수정 파일

- `src/app/layout.tsx`
- `src/app/mobile/page.tsx`
- `src/components/MoniInternalChat.tsx`
- `src/components/MoniMobileChatShell.tsx`
- `src/middleware.ts`
- `tests/moni-mobile-chat.test.mjs`

## 검증 결과

| 항목 | 결과 |
|---|---|
| 전체 자동 테스트 | 133/133 PASS |
| typecheck | PASS |
| Production build | PASS |
| Preview | READY, `dpl_E86Zkinx99yjKMZoWECTkyoLEzcE` |
| Preview 공개 로그인 화면 | PASS |
| Production `/`, `/mobile` 응답 | 200, title 정상 |
| 로그인 후 실제 Android/iPhone 조작 | BLOCKED: 테스트 계정 없음 |
| 운영 데이터 변경 | 없음 |

작업 중 main에 병합된 PR #131, #132가 음성 입력, LIVE/THINKING 상태, PC launcher 제거를 추가했고 현재 Production은 `3169a6c3a6d7e841613cfb30cb619e4503f96d13` READY다. 이 변경은 본 감사의 모바일 AI 전용 방향과 일치하며 PR #128의 일부를 상위 호환한다.

## 브랜치와 PR

- branch: `work/moni-mobile-ai-audit`
- commit: `33881156cf35fef97084ff2565a0b461fbf47b5b`
- PR: #128

## 남은 제한

- 실제 계정으로 로그인한 Android/iPhone에서 키보드 resize, safe-area, 장시간 대화 scroll, 새 대화 reset을 한 번 수동 확인해야 한다.
- PR #128은 이후 병합된 모바일 PR #131/#132와 겹치므로 merge 전 diff 정리가 필요하다.

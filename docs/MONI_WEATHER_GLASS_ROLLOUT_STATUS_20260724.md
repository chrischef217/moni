# MONI Weather Glass Rollout Status — 2026-07-24

## 목적
사용자가 제공한 SolarPulse 계열 레퍼런스를 기준으로 MONI 관리자 UI를 다음 구조로 통일한다.

- 브라우저 전체: 날씨/관리자 지정 배경
- 중앙: Floating MONI Application Frame
- 내부: 밝은 Blue White / Soft Glass Enterprise UI
- 모바일: 배경 연출 제거, 업무화면 100%
- 성능 보호: 정적 배경, Shell에만 제한적 Blur

## Production 반영 이력
### PR #33 — Weather Glass 기반
- Floating Weather Shell
- 전역 Design Token
- KMA Weather Engine 기반
- `/settings/appearance`
- 날씨별 8종 배경 라이브러리
- Supabase `moni_ui_settings`, `moni-backgrounds`
- main: `07bf568641fa1887a45b90bdc955e547229ed99d`

### PR #34 — 생산관리 내부 화면 2차 전환
- 생산 대시보드
- 월간 생산계획
- 생산일보
- 작업지시/원료수불부/제품/원재료/부재료/위생/품질/규정준수 공통 생산 화면
- 다크 하드코딩을 생산 전용 Glass Theme으로 전환
- production 작업화면에서 Weather Badge 숨김
- main: `934cc5cd656194e35d8cdc1cd5879a8cb09b1807`

### PR #35 — 인사·영업·판매·회계·세무 전환
- `BusinessManagementIntegratedShell` 하위 전체를 공통 Glass Theme으로 전환
- 입력창/카드/표/모달/상태색 통일
- 업무 계산/API/DB 로직 변경 없음
- main: `2f54a1928ffd025dea87c932682b2fbc1886f03e`

### PR #36 — 최종 공통 UI 패스
- Legacy AI 채팅/관리자/재무감사 계열 화면
- `/audit` 감사기록 화면
- Weather Badge를 Control Tower 전용으로 제한
- 관리자 사이드바에 `화면·배경 설정` 진입점 추가
- `/settings/appearance`에서 Global Sidebar 유지용 Bridge 추가
- main: `6b98c5feb8d82290ab57efe4d02f15eb6db0d90b`

## 현재 Production 상태
- Alias: `moni-sigma.vercel.app`
- PR #36 Production deployment: `dpl_D33w6knLWLM1SCRCsHvfZBiVyP5M`
- 상태: READY
- aliasError: null
- 기존 `/api/export/report`의 Dynamic server usage warning은 이전부터 존재하는 별도 경고이며 이번 UI 전환 build fail 원인이 아니다.

## 기능 보호 범위
이번 Weather Glass 전환에서 다음 업무 로직은 변경하지 않았다.

- 생산/LOT/재고 차감
- 작업지시/생산확정
- 판매/수금/매출채권
- 거래처/영업 프리랜서 정산
- 목표매출
- 현금흐름/세무 참고 계산
- 기존 API 및 실데이터

## 시각 검수 원칙
GPT(PMO)는 GitHub 코드, Supabase, Vercel build/deployment, 공개 웹 응답은 직접 검증할 수 있다.
그러나 사용자의 로그인된 브라우저 세션을 원격 브라우저처럼 직접 클릭하며 시각검수할 수 있는 도구는 현재 없다.

따라서 상태를 구분한다.

1. **코드 반영** — 검증 가능
2. **Preview build READY** — 검증 가능
3. **Production READY / Alias 정상** — 검증 가능
4. **로그인 후 실제 화면 시각검수** — 사용자 실화면 또는 별도 인증 브라우저 도구가 있어야 가능

화면별 스크린샷을 전부 요구하지 않는다. 소스 기준으로 전체 화면을 우선 감사하고, 실제 사용 중 특정 화면에서 이상이 발견되는 경우에만 해당 화면을 근거로 보정한다.

## 다음 UI 운영 기준
- 새 화면은 Dark hardcode를 새로 추가하지 않는다.
- 공통 Design Token / Glass Theme을 우선 사용한다.
- 업무 화면에는 Weather Badge를 띄우지 않는다.
- Weather Badge는 Control Tower에서 날씨 및 배경설정 진입점 역할을 한다.
- 배경/Glass 효과 때문에 업무 성능이 저하되면 시각효과보다 성능을 우선한다.
- 최종 GPT(PMO) UI 승인은 실제 사용 검수 후 한다.

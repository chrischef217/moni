# MONI Weather Glass Design System — 2026-07-24

## PMO 목적
MONI 전체 관리자 UI를 기존 다크 네이비 중심 화면에서 **Weather Background + Floating App Shell + Soft Glass Enterprise UI**로 전환한다.
기능/DB 계산 로직은 변경하지 않고 시각체계와 전역 화면 Shell을 분리해 적용한다.

## 레퍼런스 기준
사용자가 제공한 SolarPulse 계열 샘플 화면의 비율과 표현방식을 기준으로 한다.

### PC 구조
- 브라우저 전체: 날씨/관리자 설정 배경
- MONI 본체: 약 92vw, 최대 1780px
- MONI 본체 높이: 약 90vh, 최대 1100px
- 외곽 Radius: 32px
- 외곽 Shell에만 약한 blur/saturation 적용
- 내부 카드마다 무거운 backdrop blur는 적용하지 않음

### Mobile 구조
- 배경 사진을 제거하고 MONI가 100vw × 100dvh를 사용
- 모바일 업무공간을 배경 연출 때문에 희생하지 않음

## 색상 토큰
- Main surface: #F1F6FC 계열
- Panel: #FFFFFF
- Sidebar: #EBF4FC 계열
- Primary text: #183648
- Secondary text: #5E7484 계열
- Primary accent: #208FE4
- Success: #35C978
- Warning: #F3C94E
- Danger: #FF7777

Pretendard를 기존 그대로 유지한다.

## Table 규칙
- 굵은 세로 Grid 사용 금지
- Header는 밝은 배경/회색 텍스트
- Body는 13~14px 수준
- 숫자 tabular-nums
- Status는 작은 pill 형태
- hover는 매우 약한 white overlay

## Weather Background Engine
### 데이터 소스
- 기상청 단기예보 조회서비스의 초단기예보 사용
- 대한민국 5km 기상청 격자 사용
- KMA_SERVICE_KEY 환경변수가 있을 때 실시간 조회

### 상태 분류
- clear_day
- clear_night
- cloudy_day
- cloudy_night
- rain_day
- rain_night
- snow_day
- snow_night

### Fallback
1. 기상청 정상 조회 → 현재 날씨 상태 사용
2. API 실패 → 마지막 정상 weather 상태 사용
3. 마지막 값 없음 → 시간대 기준 clear_day / clear_night 사용
4. 해당 날씨 사진 미등록 → default background
5. default 사진도 없음 → MONI 내장 gradient 사용

외부 API 실패가 MONI 업무 화면 사용을 막아서는 안 된다.

## 관리자 화면
경로: `/settings/appearance`

지원 기능:
- 날씨 자동 / 수동 고정 / 기본 배경
- 표시 위치명
- 위도 / 경도
- 현재 브라우저 위치 사용
- 저장 시 KMA 5km 격자 자동 변환
- 날씨 갱신 10 / 30 / 60 / 120분
- Default / Manual 배경 업로드
- 날씨 8상태별 사진 업로드
- JPG / PNG / WEBP, 최대 10MB

배경 저장 bucket: `moni-backgrounds`

## 성능 기준
- 움직이는 오로라/무한 배경 animation 사용 금지
- 배경은 정적 이미지
- Shell에만 blur 적용
- 날씨 조회 기본 30분
- 모바일에서는 blur 제거
- 기존 production dashboard의 데이터 motion은 별도 기능으로 유지

## 현재 제한
- KMA_SERVICE_KEY는 코드에 하드코딩하지 않는다.
- 위치는 임의 좌표를 추정하지 않는다. 관리자 입력 또는 브라우저 현재 위치를 저장한 뒤 KMA 격자로 변환한다.
- 날씨별 사진은 관리자가 업로드한 사진을 사용한다. 사진 미등록 상태는 안전한 gradient fallback이다.

## 검수 순서
1. 비로그인 화면에 관리자 Shell 미노출
2. 관리자 로그인 후 Floating Shell 확인
3. 사이드바가 Shell 내부 좌측에 고정되는지 확인
4. 메인 Control Tower 밝은 컬러 변환 확인
5. 생산/판매/영업/회계 메뉴 이동과 기존 기능 확인
6. `/settings/appearance` 설정 저장
7. 배경 이미지 업로드 후 즉시 반영 확인
8. 모바일 100% 화면 확인
9. 인쇄 화면이 배경/Glass 영향을 받지 않는지 확인

## PMO 승인 조건
Preview build 성공만으로 완료 처리하지 않는다.
실제 로그인 화면에서 주요 메뉴와 배경 설정을 확인한 뒤 최종 승인한다.

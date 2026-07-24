# MONI 월간 생산계획 팝오버 Weather Glass 보정 — 2026-07-24

## 문제
월간 생산계획 달력의 날짜 상세 팝오버와 예상 계획 추가/수정 모달이 기존 다크 네이비 스타일로 남아 새 Weather Glass UI와 시각적으로 충돌했다.

## 수정
- 날짜 상세 팝오버를 밝은 Blue-White Glass panel로 전환
- 날짜/건수/추가 버튼의 밝은 화면용 대비 보정
- 팝오버 내부 이벤트 카드의 그림자를 가볍게 조정
- 예상 계획 추가/수정 모달의 다크 panel을 밝은 Glass panel로 전환
- 모달 overlay는 반투명 청회색으로 완화
- 제품 검색 dropdown도 밝은 panel로 통일

## 보호 범위
- 월간 생산계획 데이터/API/저장/수정/삭제/AI 예측/실제 생산동기화 로직은 변경하지 않음
- 생산 LOT/재고/작업지시 계산 로직 변경 없음

## 검증
- Preview build에서 Next.js compile/typecheck 통과
- 기존 `/api/export/report` Dynamic server usage 경고는 이번 변경과 무관한 기존 경고

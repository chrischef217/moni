# MONI Intelligence + Native Navigation V8

## PMO 목적

- 최신 main의 Control Tower / Weather Glass 개선을 보호한다.
- 판매관리, 영업 목표매출, 현금흐름·세무를 Global MONI Sidebar의 정식 메뉴로 승격한다.
- MONI Intelligence를 통합 대시보드 하위 정식 화면으로 연결한다.
- 기존 DOM 주입형 SalesManagementMenuController / SalesTargetsMenuController / FinancialControlMenuController 의존을 제거한다.
- 외부 메신저 연동은 이번 범위에서 제외한다.

## Intelligence 판정 원칙

1. 실제 구조화 데이터만 사용한다.
2. 영업 파이프라인에 임의 확률을 부여하지 않는다.
3. 은행잔고를 역산하지 않는다.
4. 세무 참고값을 신고 확정세액으로 표현하지 않는다.
5. 경영 위험과 데이터 누락을 분리한다.
6. 우선순위는 수금/현금/생산 차질/매출목표 순으로 실제 금전 영향에 집중한다.

## 네비게이션 원칙

- 영업관리와 판매관리를 분리한다.
- 영업관리: 고객/목표/파이프라인/활동.
- 판매관리: 판매규격, 거래처, 판매등록, 명세표, 수금, 정산, 통계, 세금계산서, 수출.
- 회계·세무관리: 현금흐름·세무를 정식 하위 메뉴로 둔다.
- MONI Intelligence는 별도 대형 AI 카테고리가 아니라 통합 대시보드 하위 화면으로 둔다.
- 우측 하단은 향후 Global MONI Character 영역으로 보호하므로 고정 Intelligence 팝업을 배치하지 않는다.

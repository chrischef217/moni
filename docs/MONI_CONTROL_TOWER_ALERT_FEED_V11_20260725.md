# MONI Control Tower Alert Feed V11 — 2026-07-25

## 목적

V10에서 생성한 `moni_alert_events`를 MONI 첫 화면(Control Tower) 하단에 직접 노출한다.

## 원칙

- Control Tower가 별도 경고 상태를 만들지 않는다.
- `/api/moni/alerts`의 같은 Event ID와 상태를 사용한다.
- `resolved`/`ignored`는 열린 알림 피드에서 제외한다.
- `new`, `sent`, `acknowledged`, `in_progress`, `deferred`는 열린 알림으로 본다.
- 최대 5건만 compact card로 표시하고 전체 이력/조작은 `/intelligence` Board로 이동한다.
- 금액 영향과 due date는 Event 원장에 실제로 기록된 값만 표시한다.
- `moni-alerts-synced` 이벤트를 수신하면 즉시 다시 읽는다.
- 별도 동기화 실패가 기존 Control Tower의 목표/판매/수금/현금/생산 화면을 막지 않는다.

## UI

Control Tower 본문 아래 `MONI ALERTS / 지금 놓치면 안 되는 것` 영역을 둔다.

표시:
- 열린 알림 수
- 미확인 수
- severity / status
- 제목
- 확인 가능한 금액 영향
- due date
- 최근 감지일

카드 클릭 시 해당 Alert를 읽음 처리하고 `/intelligence`의 전체 Board로 이동한다.

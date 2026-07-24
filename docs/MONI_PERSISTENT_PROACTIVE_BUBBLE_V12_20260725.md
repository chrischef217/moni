# MONI Persistent Proactive Bubble V12 — 2026-07-25

## 목적

Global MONI Character의 proactive bubble을 raw Intelligence 계산값이 아니라 V10의 `moni_alert_events` 상태와 연결한다.

## 동작

- 대상은 `status='new'` 이면서 severity가 `critical` 또는 `high`인 Event다.
- 이미 `acknowledged`, `in_progress`, `deferred`, `resolved`, `ignored` 상태인 Event는 새 긴급 말풍선으로 반복하지 않는다.
- Critical을 High보다 우선하고 같은 등급에서는 최근 감지 Event를 우선한다.
- 동일 Event의 반복 말풍선은 세션 기준 30분 throttle한다.
- 새로운 Event ID가 생기면 30분 이내라도 새 긴급 알림은 표시할 수 있다.
- 긴급 새 Event가 없을 때만 일반 문구 `MONI에게 무엇이든 물어보세요.`를 사용한다.
- Event 기반 말풍선을 클릭하면 해당 Event의 view/read를 기록하고 기존 Global MONI Chat을 연다.
- `moni-alerts-synced` 이벤트가 발생하면 새 Event 여부를 즉시 다시 확인한다.

## 기존 V9 보호

V9의 Global MONI Chat과 Character는 그대로 둔다.
V9 안에 남아 있는 raw Intelligence 기반 기존 bubble만 CSS로 숨기고 V12 bubble이 표시를 담당한다.

이는 V9 채팅 파일 전체를 위험하게 재작성하지 않고 Event 기반 말풍선을 먼저 안정적으로 전환하기 위한 보수적 단계다.

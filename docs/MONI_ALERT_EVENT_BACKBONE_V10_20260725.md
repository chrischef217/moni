# MONI Alert / Event Backbone V10 — 2026-07-25

## 목적

MONI의 경고, proactive message, Intelligence Board, 향후 LINE 알림이 서로 다른 상태를 갖지 않도록 **하나의 Event 원장**을 만든다.

기존 `ai_alerts`는 과거 구조이며 Production에 111건이 존재한다. V10은 이 기록을 삭제·변환하지 않고 별도 테이블을 사용한다.

---

## 데이터 구조

### `moni_alert_events`

하나의 실제 경영 이슈를 하나의 dedupe key로 추적한다.

주요 필드:

- `dedupe_key`
- `source_type`
- `source_ref`
- `category`
- `severity`
- `status`
- `title` / `summary`
- `recommended_action`
- `impact_amount`
- `due_date`
- `deep_link`
- `evidence_json`
- `read_at`
- `acknowledged_at`
- `deferred_until`
- `resolved_at`
- `reopened_at` / `reopen_count`
- `first_detected_at` / `last_detected_at`
- `view_count`

### `moni_alert_event_history`

상태 변경 이력을 append-only로 남긴다.

Actor:

- `system`
- `user`
- `notification_gateway`

### `moni_alert_deliveries`

향후 외부 전달용 원장이다.

채널:

- web
- LINE
- email
- other

V10에서는 LINE 전송 자체는 구현하지 않는다.

---

## 상태 Lifecycle

기본 운영 흐름:

`new → sent → acknowledged → in_progress → resolved`

추가 상태:

- `ignored`
- `deferred`

웹 사용자는 `new / acknowledged / in_progress / resolved / ignored / deferred`를 조작할 수 있다.
`sent`는 향후 Notification Gateway가 사용한다.

---

## Intelligence 동기화

`POST /api/moni/alerts`

```json
{ "action": "sync_intelligence" }
```

동기화 규칙:

1. Intelligence의 `good`을 제외한 실제 조건만 Event로 만든다.
2. dedupe key는 `intelligence:<rule-id>`다.
3. 같은 조건이 계속되면 새 row를 만들지 않고 `last_detected_at`, 내용, 금액 영향 등을 갱신한다.
4. 조건이 사라지면 자동 `resolved` 처리한다.
5. `resolved` 이후 같은 조건이 다시 발생하면 `new`로 재오픈하고 `reopen_count`를 올린다.
6. 사용자가 `ignored`한 Alert는 자동 재오픈하지 않는다.
7. `deferred` 기한이 만료됐는데 조건이 계속되면 `new`로 재오픈한다.

금액 영향은 가능한 범위에서 실제 구조화 데이터로 연결한다.

- 연체 미수금 → 연체금액
- D-3 수금 → 예정금액
- 30일 현금부족 → 예정 순유출 절대금액
- 목표매출 부족 → gap amount
- 생산 원재료 위험 → 확인단가 기준 부족 구매참고액
- 생산 로스 → 확인단가 기준 로스영향액

값이 확인되지 않으면 0으로 유지하며 추측하지 않는다.

---

## Global Sync

관리자 화면에는 `GlobalAlertSyncController`를 둔다.

- 최초 관리자 화면 진입 후 약 1.8초 뒤 동기화
- 같은 브라우저 세션에서는 15분 throttling
- 화면을 계속 열어둔 경우 15분마다 재동기화
- 동기화 실패가 일반 MONI 화면 사용을 막지 않는다.

향후 외부 메시지 Gateway가 도입되면 이 동기화 로직을 서버 스케줄러에서도 호출하게 한다.

---

## Intelligence Board 연결

`/intelligence` 하단에 Persistent Alert Board를 추가한다.

표시:

- 열린 알림
- Critical
- High
- 미확인
- 상태별 이력
- 금액 영향
- due date
- 재발 횟수
- 원래 MONI 화면 deep link

사용자 동작:

- 확인
- 처리중
- 해결
- 24시간 보류
- 무시
- 다시 열기

---

## 보호 원칙

- 기존 `ai_alerts` 111건을 건드리지 않는다.
- Alert Event는 실제 원장 데이터 자체를 수정하지 않는다.
- Alert 해결은 원재료/판매/회계 데이터를 자동 변경하는 행위가 아니다.
- 외부 Notification 채널이 추가되어도 Web과 같은 Event ID를 공유한다.
- 같은 조건을 매 동기화마다 새 알림으로 복제하지 않는다.
- AI Agent의 DB 쓰기 승인 정책과 별개다. Alert 상태 업데이트는 운영 메타데이터 변경이다.

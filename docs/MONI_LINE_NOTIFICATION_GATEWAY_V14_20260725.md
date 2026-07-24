# MONI LINE Notification Gateway V14 — 2026-07-25

## 목적

MONI 웹을 열지 않아도 Critical/High 경영 Alert를 LINE Official Account로 전달할 수 있도록 External Notification Gateway의 첫 채널을 구현한다.

V14는 V10 `moni_alert_events`를 원본으로 사용한다. LINE용 별도 경고 원장을 만들지 않는다.

---

## 공식 LINE 방식

사용 API:

- Messaging API Push Message
- `POST https://api.line.me/v2/bot/message/push`
- Authorization Bearer Channel Access Token
- `X-Line-Retry-Key` 사용

LINE 공식 문서가 Push API 재시도 시 중복 발송 방지를 위해 Retry Key 사용을 권장하므로 V14는 최초 요청부터 UUID Retry Key를 저장한다.

수신자 ID는 임의 입력값을 신뢰하지 않는다.

- LINE Webhook의 `source.userId`를 HMAC SHA-256 서명 검증 후 발견
- 발견 직후에는 `active=false`
- 관리자가 MONI에서 수신자를 활성화해야 실제 경영 Alert 수신 가능

---

## 비밀정보 관리

DB 저장 금지:

- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_CHANNEL_SECRET`

Vercel 환경변수:

- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_CHANNEL_SECRET`
- `MONI_PUBLIC_BASE_URL`

화면/API는 Token/Secret의 존재 여부만 boolean으로 표시하고 값은 반환하지 않는다.

Webhook:

`/api/moni/line-webhook`

Webhook은 관리자 로그인 대신 LINE 공식 `X-Line-Signature`를 Channel Secret으로 검증한다.

---

## DB 구조

### `moni_notification_channels`

채널별 정책:

- enabled
- minimum_severity
- quiet_hours_start/end
- timezone
- escalation_repeat_hours

LINE 기본값:

- enabled=false
- minimum severity=high
- timezone=Asia/Bangkok

### `moni_notification_recipients`

- channel
- recipient_ref
- display_name
- active
- minimum_severity
- verified_at

Webhook 발견 수신자는 무조건 inactive로 시작한다.

### `moni_alert_deliveries` 확장

추가:

- delivery_key
- message_type
- retry_key
- provider_request_id
- http_status
- retryable
- last_attempt_at

`business_id + delivery_key` unique index로 MONI 내부 중복 전송도 차단한다.

---

## Delivery Key

초기 알림:

`line:<event_id>:reopen:<reopen_count>:initial:<recipient_id>`

동일 Alert가 같은 상태로 계속 감지되어도 같은 수신자에게 초기 메시지를 반복하지 않는다.
Alert가 실제로 resolved 후 다시 발생하여 `reopen_count`가 증가하면 새로운 경영 사건으로 보고 새 delivery key를 사용한다.

---

## Retry

최초 요청부터 LINE `X-Line-Retry-Key` UUID를 저장한다.

- 2xx: sent
- 409: 같은 Retry Key가 이미 LINE에서 수락된 것으로 보고 sent 취급
- 5xx/network: retryable=true
- 일반 4xx: retryable=false
- 최대 3회
- 최초 요청 23시간 이내만 같은 Retry Key 재사용

LINE의 공식 Retry Key 관리기간 24시간보다 짧게 제한한다.

---

## Alert 상태 연동

성공적으로 LINE에 수락되면 Event가 아직 `new`일 때만:

`new → sent`

으로 전환한다.

전송 중 사용자가 이미 Web에서 `acknowledged` 또는 `in_progress`로 변경했다면 Notification Gateway가 그 상태를 되돌리지 않는다.

상태 전환은 `moni_alert_event_history`에 actor=`notification_gateway`로 남긴다.

---

## 발송 기준

기본:

- LINE channel minimum severity = High
- 수신자 개인 minimum severity도 별도로 적용
- 채널과 수신자 두 기준을 모두 통과해야 발송
- status=`new`만 초기 발송 대상으로 사용

Quiet Hours:

- Critical은 Quiet Hours를 무시하고 즉시 발송 가능
- High 이하만 Quiet Hours 적용

V14에서는 반복 escalation message는 아직 자동 발송하지 않는다. 필드만 준비한다.

---

## 메시지 구조

텍스트 메시지는 다음 정보만 사용한다.

1. Alert severity + title
2. 실제 확인된 금액 영향
3. 기준일/due date
4. 상황 요약
5. 권장 조치
6. MONI Intelligence deep link

확인할 수 없는 금액이나 날짜는 만들지 않는다.

---

## 관리자 UI

`/intelligence` 하단 LINE Gateway 설정:

- Token 설정 여부
- Secret 설정 여부
- 활성 수신자 수
- 현재 NEW 대상 Alert 수
- Webhook URL
- 최소 severity
- timezone / quiet hours
- discovered recipient 활성화/표시명/개인 severity
- 채널 활성화
- 명시적 확인 후 현재 대기 Alert 수동 전송

채널 활성화 조건:

- Token 설정
- Secret 설정
- 활성 수신자 1명 이상

---

## 아직 자동화하지 않는 것

- V14 브랜치 자체에서 별도 Cron을 추가하지 않는다.
- V13 Background Alert Sync가 Production 검증된 뒤 같은 hourly job의 다음 단계로 `sendPendingLineAlerts()`를 연결한다.
- LINE 양방향 질문/답변은 다음 단계다.
- LINE에서 Create/Update/Delete 요청을 직접 실행하지 않는다.
- 향후 양방향 Agent에서도 write action은 MONI 승인 정책을 유지한다.

---

## 현재 안전상태

Production DB migration은 additive 방식으로 적용됐지만 LINE channel은 기본 `enabled=false`다.
따라서 Token/Secret/수신자가 없어도 메시지가 발송되지 않는다.

코드 브랜치는 Vercel build-rate-limit 해제 후 Preview build를 통과하기 전에는 main에 병합하지 않는다.

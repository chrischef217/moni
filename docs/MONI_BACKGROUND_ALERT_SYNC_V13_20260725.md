# MONI Background Alert Sync V13 — 2026-07-25

## 목적

V10~V12의 Alert/Event 구조는 관리자 브라우저가 열려 있을 때만 `GlobalAlertSyncController`가 Intelligence 조건을 동기화했다.

V13은 MONI 웹을 열지 않아도 서버에서 정기적으로 경영 위험을 감지해 `moni_alert_events`를 갱신하는 기반이다.

---

## Cron

Production Vercel Cron:

- path: `/api/cron/moni-alert-sync`
- schedule: `0 1 * * *`
- 현재 주기: 매일 UTC 01:00 = 태국 08:00 / 한국 10:00
- MONI 판단 날짜 기준은 기존대로 Asia/Seoul을 유지한다.

최초 설계는 매시 1회(`0 * * * *`)였으나, 현재 Vercel 프로젝트에서는 해당 주기로 변경하는 순간 빌드가 생성되기 전에 배포가 거절됐다. 기존 일 1회 Cron은 배포돼 왔으므로 V13 Production 호환 기준은 일 1회로 보수적으로 유지한다.

관리자 웹이 열려 있는 동안에는 V10 `GlobalAlertSyncController`가 15분마다 동기화하므로 현재 실제 구조는:

- 웹 사용 중: 최대 15분 간격
- 웹 미사용 중: 매일 08:00 태국시간 / 10:00 한국시간 서버 점검

시간당 서버 감지는 Vercel 플랜/스케줄러 조건을 변경하거나 향후 Notification Gateway 단계에서 다시 활성화한다.

Cron은 Vercel 공식 보안 방식인 `Authorization: Bearer ${CRON_SECRET}`를 요구한다.

`CRON_SECRET`이 서버 환경변수에 없으면 route는 503을 반환하며 **비밀키 없이 자동으로 열리는 fallback을 두지 않는다.**

---

## 서버 계산 방식

Cron은 관리자 세션을 위조하거나 기존 관리자 API에 secret 우회권한을 추가하지 않는다.

`src/lib/moni/backgroundAlertSync.ts`가 서버에서 Supabase Service Role로 필요한 원장만 읽는다.

판정 범위:

1. 수금
   - 연체 미수금
   - D-3~D-Day 미수금
   - 입금예정일 누락
2. 현금
   - 30일 예정 유입/유출
   - 30일 예정 순유출
   - 계좌/현금함 Balance Snapshot 누락·7일 초과
   - 지급완료 정산 지급일 누락
3. 영업 목표
   - 회사 월 목표매출 누락
   - 목표매출 부족
   - 이번 달 종료예정 pipeline `expected_amount` 원금액 비교
   - `close_date` 없는 열린 영업기회
4. 생산
   - 기존 Production Dashboard 서버 계산을 재사용
   - 향후 작업지시 원재료 부족 위험
   - 로스율 2% 이상
   - 사용 원재료 단가 누락

영업 pipeline에는 확률을 임의로 부여하지 않는다.
은행잔고를 역산하지 않는다.
원재료 사용원가를 현금지출로 보지 않는다.
세무 확정값을 만들지 않는다.

---

## Alert Event 동기화

V10과 동일한 dedupe key를 사용한다.

`intelligence:<rule-id>`

따라서 웹 동기화와 Cron 동기화가 동시에 실행돼도 같은 경영 이슈에 별도 Alert row를 만들지 않는다.

- 최초 감지 → `new`
- 지속 → 같은 row 갱신
- 해소 → `resolved`
- resolved 후 재발 → `new`, reopen_count +1
- ignored → 자동 재오픈 금지
- deferred 기한 만료 + 조건 지속 → `new`

---

## Legacy morning-check 종료

기존 `/api/cron/morning-check`는 다음 문제가 확인됐다.

- 인증 없음
- `business_id='default'`
- 구형 `ai_alerts` 직접 INSERT
- 호출할 때마다 중복 alert 생성 가능

기존 `ai_alerts` 111건은 삭제하지 않는다.
대신 route는 2026-07-25부터 `410 Gone`을 반환하고 `vercel.json` 스케줄에서 제거한다.

---

## 남은 운영 검증

V13 코드가 Production에 배포된 뒤 아래를 확인해야 한다.

1. `CRON_SECRET`이 실제 Vercel Production 환경에 존재하는지
2. unauthenticated cron 호출이 401인지, 환경변수 미설정이면 503인지
3. Vercel Cron 등록 상태
4. 실제 cron 1회 실행 후 `moni_alert_events.last_detected_at` 갱신 여부

환경변수 자체 값은 문서/로그/응답에 노출하지 않는다.

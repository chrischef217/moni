# PMO DECISION — MONI Agent Memory · Policy · Observability V2

- 결정일: 2026-08-04
- 승인 주체: GPT(PMO)
- 상태: Preview 및 DB 검증 완료 · PR 품질 게이트 대기
- 선행 기반: MONI Production Agent Foundation V2
- 적용 원칙: 기존 업무 데이터 보존, READ ONLY 유지, 역할별 최소권한

## 1. 결정 배경

Production Agent Foundation V2는 공식 Agents SDK, Zod 도구계약, 구조화 답변, 근거검증과 자동 품질 게이트를 도입했다. 다음 운영 위험은 최근 대화만 전달하는 기억구조, 역할별 데이터 접근 통제 부족, 토큰·비용·지연시간 관측 부족, 모델 추정과 시스템 확정 문제가 섞이는 PMO 큐였다.

## 2. 확정 구조

1. Agents SDK Session을 Supabase에 영구 저장한다.
2. 단기 세션 기록과 대화 장기요약을 분리한다.
3. 확정 PMO·회사 문맥은 별도 고정 메모리로 주입한다.
4. 사용자 정정은 메모리 갱신 시 최신 내용을 우선한다.
5. 역할에 따라 모델에 보이는 도구 자체를 제한한다.
6. 실행 시 서버가 동일한 역할 정책을 다시 확인한다.
7. 도구 입력·출력에 공식 SDK Guardrail을 적용한다.
8. Agent 실행별 토큰·요청 수·지연시간·검증상태·프롬프트 버전을 저장한다.
9. PMO 사건은 탐지원·신뢰도·검증상태를 구분한다.
10. PMO 사건 상태는 통제된 전환 경로로만 변경한다.

## 3. 역할 정책

### admin

생산·재고·제품·판매·수금·매입·지급·회사 문맥 조회와 PMO 접수를 허용한다.

### freelancer

생산·재고·제품 조회와 PMO 접수만 허용한다. 판매·수금·매입·지급·회사 PMO 문맥은 도구 목록에서 제거하고 서버에서도 재차 차단한다.

### 미정 역할

현재시간, Agent 지원범위 확인, 오류 접수만 허용한다.

## 4. 기억 구조

### SDK Session

`moni_ai_session_items`에 Agents SDK의 메시지·도구호출·도구결과 항목을 보존한다. 기존 대화방은 최초 실행 시 기존 메시지에서 안전하게 부트스트랩한다.

### Thread Memory

`moni_ai_thread_memory`에 다음을 분리 저장한다.

- 요약
- 확정 사실
- 확정 결정
- 미해결 항목
- 요약한 메시지 수와 버전

12개 이상의 새 메시지가 쌓였을 때만 Memory Curator가 갱신한다. Curator는 새로운 결론을 만들지 않고 사용자 정정과 PMO 확정결정을 우선한다.

### Pinned Context

`moni_ai_project_context`의 활성·고우선순위 문맥을 매 요청의 고정 회사·PMO 문맥으로 사용한다.

## 5. 보안과 Guardrail

- 비밀키·개인키·서비스 역할키 패턴 차단
- SQL·셸·파괴적 실행 명령 차단
- 민감정보가 포함된 도구 결과 차단
- 사용자 요청에서 비밀정보·내부 프롬프트 탈취 시도 차단
- READ ONLY 도구만 등록
- PMO 관리 API는 admin 전용
- 신규 메모리·평가·전환 테이블은 RLS 활성화 및 service_role 전용

## 6. 관측

`moni_ai_agent_runs`에 다음을 기록한다.

- 요청 수
- 입력·출력·전체 토큰
- 전체 지연시간
- 응답 검증상태
- 프롬프트 버전
- 메모리 버전
- 사용 도구
- PMO 사건 ID

## 7. PMO Control Plane

PMO 사건은 다음 탐지원으로 구분한다.

- SYSTEM_DETECTED
- USER_REPORTED
- MODEL_SUSPECTED
- VALIDATOR_DETECTED

상태 흐름은 다음을 기본으로 한다.

OPEN → TRIAGED → APPROVED → IN_DEVELOPMENT → PREVIEW_TESTING → PMO_REVIEW → RESOLVED

검증되지 않은 모델 추정을 자동으로 시스템 확정 오류로 취급하지 않는다. PMO 사건의 GitHub Issue, 개발 PR, 배포 ID와 해결 증거를 공유상태에 기록할 수 있다.

## 8. DB 적용 결과

마이그레이션 `add_moni_agent_memory_policy_observability_v2` 적용 완료.

확인 완료:

- 신규 5개 테이블 RLS 활성화
- anon·authenticated 직접 권한 없음
- service_role 전용 권한
- Agent run 확장 컬럼 및 제약 적용
- PMO 확장 상태·탐지원·검증상태 제약 적용
- PMO 상태 전환 Trigger 활성화

기존 생산·재고·판매·회계 업무 데이터는 변경하지 않았다.

## 9. 품질 기준

- Preview Production build 성공
- `/api/moni/agent-chat`이 `/api/moni/agent-runtime`으로 매칭
- 미로그인 요청 401
- Agent 계약 테스트
- 역할 정책 회귀검사
- 기억·Guardrail·관측·PMO Control Plane 정적 평가
- 보안 평가
- 운영 배포 후 5xx 없음

로그인 상태 실제 Agent 실행에서 세션 항목, 토큰, 지연시간, 검증상태가 생성되는 것을 최종 운영 수용검사로 확인한다.

## 10. 후속 단계

1. 실제 모델 기반 평가 실행기
2. 평가 결과의 Supabase 저장
3. PMO 사건과 GitHub Issue의 승인형 연결
4. 문서 검색 도구 강화
5. 도구 백엔드를 도메인별 구현 파일로 완전 분리
6. 승인형 쓰기 Agent 별도 설계

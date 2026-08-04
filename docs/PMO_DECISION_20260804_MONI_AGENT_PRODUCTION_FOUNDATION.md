# PMO DECISION — MONI Production Agent Foundation V2

- 결정일: 2026-08-04
- 승인 주체: GPT(PMO)
- 상태: Production 적용 완료 · 운영 수용검사 진행
- 운영 커밋: `311e75dd0772bbebb70727869b28ff2934b50850`
- 운영 배포: `dpl_EEwujd5yaEsd5kHjQP4sA6radehd`
- 적용 원칙: 기존 MONI 업무 데이터와 사용자 화면 보존

## 1. 문제 정의

기존 MONI Agent V1은 OpenAI Responses API를 직접 반복 호출하는 수동 루프와 빌드 직전 소스 패치에 의존했다. 저장소에서 검토한 TypeScript와 Vercel이 실제 빌드한 TypeScript가 달라질 수 있었고, 운영화면에서 사용자가 질문해야 오류가 발견되는 구조였다.

## 2. 확정 결정

MONI Agent 기반을 다음 구조로 전환한다.

1. 공식 OpenAI Agents SDK를 실행 런타임으로 사용한다.
2. 모든 업무 도구 입력은 Zod 스키마로 검증한다.
3. 최종 답변은 구조화된 스키마로 생성한다.
4. 핵심 수치는 실제 도구 출력 경로와 대조해 검증한다.
5. 실제로 접수된 PMO 이벤트 ID만 답변에 표시한다.
6. 모든 Agent 변경은 자동 테스트·회귀평가·보안평가·Production build를 통과해야 한다.
7. prebuild는 소스코드를 변경하지 않고 검증만 수행한다.
8. V2 기반은 READ ONLY를 유지한다.
9. 레거시 `/api/moni/agent-v2` 우회 경로와 소스 변형 패치 파일을 제거한다.

## 3. 이번 단계 구현 범위

- `@openai/agents` 기반 Supervisor Agent
- Zod 기반 도구 입력 계약
- Zod 기반 최종 답변 계약
- 도구별 감사로그 유지
- 도구 결과 근거 원장
- 수치·출처·PMO 이벤트 ID 검증
- 생산 집계 용어 정규화
- 결과 잘림 여부 메타데이터
- Agent 전용 회귀평가 세트
- Agent 품질 GitHub Actions 게이트
- 실제 `src/middleware.ts`를 통한 공식 런타임 라우팅
- 레거시 Agent API와 빌드 패치 체계 제거

## 4. 기존 기능 보호

다음 기능은 유지한다.

- 기존 MONI AI 화면
- `/api/moni/agent-chat` 공개 경로
- 대화방 및 메시지 영구저장
- 첨부파일 업로드와 분석
- PMO 수동 전달
- Agent 실행 및 도구 감사 테이블
- 기존 생산·재고·판매·매입 조회 로직
- 생산·재고·판매·회계 원본 데이터 무변경

## 5. 전환 구조

현재 단계에서는 기존 `agent-v2.ts` 라이브러리의 검증된 DB 조회 함수를 재사용하고, 새로운 SDK Runtime이 입력검증·권한·감사·근거·응답검증을 담당한다.

이는 업무 조회 로직을 동시에 전면 재작성해 발생할 회귀 위험을 막기 위한 과도기 구조다. 운영 안정화 후 도구 구현을 생산·재고·판매·재무·문서·PMO 모듈로 순차 분리한다.

## 6. 품질 게이트 결과

다음을 통과했다.

1. immutable source verification
2. Agent contract tests 6/6
3. Agent regression evaluation 15 cases
4. Agent security evaluation 10 checks
5. Next.js Production build
6. MONI Performance CI
7. Preview 미로그인 401
8. Production 미로그인 401
9. `/api/moni/agent-chat`의 실제 매칭 경로 `/api/moni/agent-runtime` 확인
10. 배포 직후 Production 5xx 없음

로그인 상태의 실제 모델·도구 실행, 구조화 답변 검증 통과 기록은 운영 수용검사의 마지막 항목으로 남긴다.

## 7. 금지 사항

- 빌드 중 TypeScript 소스 변경
- PMO 승인 없는 쓰기 도구 추가
- 업무 데이터 자동 수정
- 서비스 역할키·SQL·내부 프롬프트 출력
- 도구 결과에 없는 수치 생성
- 실행하지 않은 도구를 근거로 표시
- 실제 접수되지 않은 PMO 이벤트 ID 표시
- 제거된 레거시 Agent 경로 재도입

## 8. 후속 단계

1. 기존 대형 도구 모듈을 도메인별 파일로 분리
2. 역할별 도구 접근 정책 강화
3. 대화요약과 장기기억 분리
4. 실제 모델 실행 기반 Eval 확대
5. 토큰·비용·지연시간 관측 추가
6. PMO Control Plane과 GitHub Issue 연결
7. 승인형 쓰기 Agent 별도 설계

## 9. 롤백

운영 이상 시 운영 커밋 `311e75dd0772bbebb70727869b28ff2934b50850`을 Git revert하고 이전 Production 배포 `dpl_8VTcLrFAbX7P8KUhQFofJAMPNECr`로 롤백한다. 레거시 우회 API를 상시 유지하는 방식은 사용하지 않는다. 업무 데이터와 DB 스키마는 이번 단계에서 변경하지 않았으므로 데이터 롤백은 필요하지 않다.

# PMO 결정 — MONI AI 영구 문맥·첨부파일·PMO 이관

- 결정일: 2026-08-03
- 상태: 승인 및 운영 반영
- 승인 주체: GPT(PMO)

## 목적

MONI 실사용자가 운영 질문, 데이터 분석, 화면 오류 및 개선 요구를 MONI AI에 자연어와 첨부자료로 전달하고, 대표가 내용을 다시 번역하거나 재설명하지 않아도 GPT(PMO)가 사실·화면·대화 흐름을 이어받을 수 있게 한다.

## 확정 구조

1. MONI AI 대화는 브라우저 임시 저장이 아니라 Supabase에 영구 저장한다.
2. 각 대화는 사용자, 권한, 화면 경로, 화면 제목, 시간, 대화 메시지, 모델·공급자 정보를 보존한다.
3. 스크린샷 붙여넣기, 파일 선택, 드래그앤드롭을 지원한다.
4. 첨부파일은 비공개 Supabase Storage 버킷에 저장하며 서명 업로드만 허용한다.
5. 운영 질문과 분석은 MONI AI가 답변할 수 있다.
6. 오류 수정·기능 추가·DB 변경·코드 개발 요청은 MONI AI가 실행하지 않는다.
7. 기술 요청은 PMO 요청서로 분류해 대화·화면·첨부 메타데이터와 함께 저장한다.
8. GPT(PMO)는 `moni_ai_pmo_context`, `moni_ai_threads`, `moni_ai_messages`, `moni_ai_attachments`를 조회해 기존 결정·코드·DB와 대조한 후 개발 여부를 판단한다.
9. 사용자가 MD 파일을 내려받아 다시 전달하는 방식은 보조수단일 뿐 기본 흐름이 아니다.
10. MONI AI와 ChatGPT 앱의 개별 대화 세션은 동일 세션이 아니다. 공용 Supabase 문맥 저장소가 두 환경 사이의 공식 연결점이다.

## 모델 공급자 원칙

- 서버에 `OPENAI_API_KEY`가 있으면 OpenAI Responses API를 우선 사용한다.
- `OPENAI_MONI_MODEL`이 없으면 코드 기본값을 사용한다.
- OpenAI 키가 없고 `GOOGLE_AI_API_KEY`가 있으면 기존 Gemini 경로를 유지한다.
- 화면에는 실제 응답 공급자와 모델명을 표시한다.
- 특정 ChatGPT 앱 모델 또는 이 프로젝트 대화방의 숨은 메모리를 API가 공유한다고 표현하지 않는다.

## 보안·권한

- AI 업무 실행은 계속 READ ONLY이다.
- 첨부파일 저장소는 비공개다.
- 파일 크기는 개별 25MB, 대화 1회 분석 합계 30MB, 최대 5개다.
- 대화 및 첨부파일 API는 로그인 세션과 대화 소유자를 검증한다.
- PMO 검토 전 코드·DB·업무 데이터 변경은 금지한다.

## 운영 방법

직원:
- MONI AI에 질문한다.
- 스크린샷은 입력창에 붙여넣는다.
- PDF·엑셀·CSV·문서는 대화창에 끌어놓는다.
- 기술 문제는 자연어로 설명하고 필요하면 `PMO 전달`을 누른다.

대표/GPT(PMO):
- `MONI AI 새 PMO 요청 확인`이라고 지시한다.
- GPT(PMO)가 공용 문맥 저장소에서 대화·화면·첨부 메타데이터·AI 분석을 조회한다.
- 중복, 사용법 문의, 실제 버그, 신규 기능을 분류한다.
- 기존 결정과 충돌 시 경고하고 개발 범위를 확정한다.

## 구현 식별자

- DB migration: `add_moni_ai_persistent_context_and_attachments`
- Storage bucket: `moni-ai-attachments`
- API: `/api/moni/agent-chat`
- API: `/api/moni/agent-files`
- UI: `src/components/GlobalMoniAgent.tsx`

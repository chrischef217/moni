# PMO DECISION — MONI MCP Preflight Gate

> 결정일: 2026-08-08  
> 승인 주체: GPT(PMO)  
> 상태: 개발 중

## 목적

ChatGPT Business/Enterprise/Edu에서 MONI custom MCP 앱을 생성할 때 ChatGPT가 도구 정의를 스캔하고 승인 시점의 도구 스냅샷을 사용하므로, 수용검사 창을 열기 직전에 MONI 서버 상태와 도구 카탈로그가 검증된 상태임을 강제한다.

## 결정

수용검사 창은 다음 조건을 모두 만족한 경우에만 열 수 있다.

1. 최근 30분 이내 관리자 Preflight 결과가 PASS
2. Preflight 당시 Admin/Freelancer 도구 카탈로그 해시와 현재 코드의 해시가 동일
3. MCP/OAuth metadata와 CORS 계약이 정상
4. Admin/Freelancer 역할별 READ ONLY 도구 정책이 정상
5. 현재 활성 수용검사 창이 없음
6. OAuth/MCP DB 저장소 접근이 정상

Preflight 결과는 Supabase 감사 테이블에 저장하며 anon/authenticated 직접 접근은 금지한다.

## 보호 원칙

- 업무 데이터 생성·수정·삭제 없음
- Preflight 자체는 MCP 운영 활성화를 수행하지 않음
- PASS 후에도 관리자가 별도로 수용검사 창을 열어야 함
- 도구 정의가 한 글자라도 바뀌어 해시가 달라지면 기존 PASS는 무효
- 영구 `MONI_MCP_ENABLED=true` 전환과는 별도
- 기존 MONI 내부 AI는 최종 ChatGPT 수용검사 완료 전까지 유지

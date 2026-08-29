# 2026-08-29 Mobile work-order read + document save fix

## Incident
- Mobile request `이번 달 생산에 관련된 작업지시서 내역 리스트업 좀 해줘` was incorrectly routed to the production-work CREATE card.
- Root cause: generic courtesy endings (`해줘`, `해주세요`, `해 줘`) were treated as global CREATE intent.
- Production evidence showed `/api/moni/mobile-action-start` instead of the normal Agent read path.

## Decision
- Courtesy endings alone are not mutation intent.
- Read/list/show requests remain on the MONI Agent read path and use the canonical `search_production_records` capability.
- Explicit write verbs and tightly scoped domain write expressions still open write cards.

## Document save UX
- The answer `문서 저장` action now shows a modal with generation/download progress, percentage, completion state, filename, `문서 보기`, and close action.
- `/api/moni/answer-report` exposes Content-Length so the client can calculate real streamed download progress.
- DOCX question and answer tables use fixed DXA widths to avoid collapsed vertical tables in Android document viewers.

## Verification
- Read-routing regression tests cover work-order list, sales list, purchase list, and inbound read wording.
- Explicit work-order/production-plan/sales write requests remain supported.
- Dedicated prebuild gates verify work-order read routing and document-save UX.

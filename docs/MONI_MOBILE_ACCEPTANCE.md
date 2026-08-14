# MONI Mobile MVP acceptance gates

A mobile change is not considered complete merely because static UI tests or a Vercel build pass.

## Voice dictation
- Android Chrome must be the primary acceptance browser.
- Microphone -> speak -> 확인 must leave recognized Korean text in the composer.
- 확인 must never submit to MONI.
- Only the separate send button submits the composer.
- An empty recognition result must show an explicit error instead of silently returning an empty composer.

## MONI response
- A production query must leave the user message visible immediately.
- THINKING must expose elapsed time once processing is materially delayed.
- Relative-month production analysis/report/forecast requests must use the bounded monthly snapshot path instead of chaining many independent read tools.
- Production acceptance records agent latency and tool count from the real `20220523011` tenant.

## Regression boundary
- `/mobile` is chat-only.
- The PC-only floating MONI launcher and speech bubble never render on `/mobile`.
- No external ChatGPT redirect is introduced.
- No production write is performed as part of mobile UX acceptance testing.

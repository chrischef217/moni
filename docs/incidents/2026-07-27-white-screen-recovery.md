# 2026-07-27 Production recovery

- Incident: production client rendered a blank white screen after commit `62020197e9b1ce05d17f19a4b84b4eaf828bfd8b`.
- Immediate action: restored `main` to the previously working commit `f0116a1fc4d219cee33839af3b707ed3f81744a4` before investigating the finished-goods ledger fix again.
- Rule: do not reapply the ledger MutationObserver fix directly to production until it is implemented without recursive DOM mutation and verified separately.

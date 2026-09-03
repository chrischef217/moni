# Deferred design — MONI cold-storage safety management

Status: DESIGN RECORDED / IMPLEMENTATION DEFERRED

The cold-storage feature is intentionally not part of the current raw-material photo-inbound development. Preserve this design for later implementation.

- PC: cold-storage master (name, location, configurable normal temperature range, inspection schedule, active state), daily checks, history, corrective actions, weekly/monthly printable checklist.
- Mobile: rapid temperature check card with warehouse, measured temperature, status (normal / temperature abnormal / machine stopped / other), note, and automatic checker identity; natural-language entry should prepare the same confirmation card.
- Safety controls: store actual entry timestamp separately from nominal inspection slot; detect missed checks; abnormal checks remain open until corrective action, re-measurement and restored state are recorded.
- Control Tower: surface missed checks, out-of-range temperatures and machine-stop alerts.
- Data model should allow later IoT/sensor ingestion without replacing manual inspection records.

# MONI Capability Registry Protocol

## Purpose

MONI must not answer questions about its own menus, feature locations, buttons, or operating procedures from model memory or guesswork.

Examples:
- `원재료 단가 어디서 바꿔?`
- `택배비는 거래명세표에 어떻게 넣어?`
- `반품 어디서 잡아?`
- `매입 입고 어디서 등록해?`

These are **MONI self-knowledge questions**. The canonical source is `public.moni_capability_registry`.

## Architecture

1. `moni_capability_registry` is the SSOT for user-facing MONI capabilities.
2. Each ACTIVE capability is synchronized into `moni_ai_project_context` as `source_type=MONI_CAPABILITY_REGISTRY` so the existing Agent context tool can retrieve it.
3. `search_moni_capabilities(business_id, query, limit)` performs deterministic ranked retrieval across feature name, aliases, keywords, menu paths, actions, and descriptions.
4. PC and mobile MONI both use `/api/moni/agent-runtime`; they must therefore share the same capability source and must never maintain separate manuals.
5. `moni_capability_regression_cases` stores representative natural-language questions. `run_moni_capability_regression()` must keep every active case PASS.

## Required fields per capability

- `feature_id`: stable machine identifier; never reuse for a different feature.
- `feature_name`: current user-facing function name.
- `category`: PRODUCTION / INVENTORY / SALES / PURCHASE / EXPORT / HR / DOCUMENT / SYSTEM etc.
- `aliases`: representative user expressions, not every possible sentence.
- `keywords`: short domain keywords used for ranked retrieval.
- `pc_path`: exact current PC navigation path.
- `mobile_support`: `SUPPORTED`, `ASK_MONI`, `PC_ONLY`, or `NOT_VERIFIED`.
- `mobile_path`: exact mobile path only when verified.
- `action_hint`: exact button/field/action needed to perform the task.
- `description`: what the feature does.
- `caveats`: distinctions that prevent unsafe or wrong guidance.
- `permissions`: allowed roles.
- `source_reference`: code/UI source proving the capability.

## Mandatory development rule

Any change that creates, renames, moves, removes, or materially changes a user-facing MONI function is incomplete until the related capability entry is updated.

Examples that require a registry update:
- new sidebar menu or submenu
- menu label/path change
- new create/edit/delete action
- new input field that users must know how to reach
- desktop/mobile support change
- feature deprecation
- a workflow distinction that users can easily confuse

Do **not** add hundreds of prompt-specific rules. Add or update one capability definition with concise aliases and keywords.

## Mandatory regression rule

For every high-frequency or high-risk capability, add at least one natural-language regression case. Add more only when distinct intent collisions exist.

Before PMO approval:

```sql
select * from public.run_moni_capability_regression('20220523011');
```

Acceptance criterion: every active row has `passed=true`.

When a query ranks the wrong feature first, fix capability metadata or ranking logic. Do not patch the answer with a hard-coded one-off response unless the workflow itself requires deterministic business logic.

## Agent behavior contract

For self-knowledge/how-to questions:
1. Search capability knowledge first.
2. Use exact registry paths/actions.
3. If mobile support is `NOT_VERIFIED`, say it is not verified; do not invent a mobile path.
4. If no confirmed capability is found, say the current registry does not contain a verified guide and escalate it as a coverage gap.
5. Do not confuse master-data changes with historical transaction edits. Respect `caveats`.

For company-data questions (sales, inventory, production, purchases, receivables etc.), continue to use the existing canonical business-data tools. The capability registry is a manual/navigation SSOT, not a substitute for operational data.

## Current rollout status

The first rollout covers critical production, sales, purchase, inventory, and export workflows. It is intentionally not claimed as full MONI coverage yet. Legacy/current screens must be migrated incrementally, with coverage tracked by regression cases and code references.

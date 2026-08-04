import { readFileSync, writeFileSync } from 'node:fs'

const agentPath = 'src/lib/moni/agent-v2.ts'
let source = readFileSync(agentPath, 'utf8')

function replaceRequired(oldBlock, newBlock, label, alreadyPresent) {
  if (source.includes(oldBlock)) {
    source = source.replace(oldBlock, newBlock)
    console.log(`Applied ${label}.`)
    return
  }
  if (alreadyPresent && source.includes(alreadyPresent)) {
    console.log(`${label} is already present.`)
    return
  }
  throw new Error(`${label} anchor was not found; build stopped to prevent an unsafe patch.`)
}

replaceRequired(
  `  let sample = 0\n  for (const row of rows) {\n    planned += num(row.planned_quantity_g)\n    actual += num(row.actual_quantity_g)\n    defect += num(row.defect_quantity_g)\n    sample += num(row.sample_quantity_g)\n`,
  `  let sample = 0\n  let openWorkOrderCount = 0\n  let openPlannedQuantity = 0\n  let completedRecordCount = 0\n  let completedActualQuantity = 0\n  let completedPlanGap = 0\n  for (const row of rows) {\n    planned += num(row.planned_quantity_g)\n    actual += num(row.actual_quantity_g)\n    defect += num(row.defect_quantity_g)\n    sample += num(row.sample_quantity_g)\n\n    const normalizedStatus = text(row.status, 80).toLowerCase()\n    const isCancelled = ['cancelled', 'canceled', '취소'].includes(normalizedStatus)\n    const hasActual = row.actual_quantity_g !== null && row.actual_quantity_g !== undefined && num(row.actual_quantity_g) > 0\n    const isCompleted = ['완료', 'completed'].includes(normalizedStatus) || hasActual\n    const isOpen = !isCancelled && !isCompleted\n    if (isOpen) {\n      openWorkOrderCount += 1\n      openPlannedQuantity += num(row.planned_quantity_g)\n    }\n    if (isCompleted) {\n      completedRecordCount += 1\n      completedActualQuantity += num(row.actual_quantity_g)\n      completedPlanGap += Math.max(0, num(row.planned_quantity_g) - num(row.actual_quantity_g) - num(row.defect_quantity_g) - num(row.sample_quantity_g))\n    }\n`,
  'production open/completed classification',
  'let openWorkOrderCount = 0',
)

replaceRequired(
  `      record_count: rows.length,\n      planned_quantity_g: planned,\n      actual_quantity_g: actual,\n      defect_quantity_g: defect,\n      sample_quantity_g: sample,\n      unaccounted_gap_g: planned - actual - defect - sample,\n      warning: 'unaccounted_gap_g는 확정 로스가 아니라 계획량에서 완료·불량·샘플을 뺀 단순 차이입니다.',\n`,
  `      record_count: rows.length,\n      planned_quantity_g: planned,\n      actual_quantity_g: actual,\n      defect_quantity_g: defect,\n      sample_quantity_g: sample,\n      open_work_order_count: openWorkOrderCount,\n      open_planned_quantity_g: openPlannedQuantity,\n      completed_record_count: completedRecordCount,\n      completed_actual_quantity_g: completedActualQuantity,\n      completed_plan_gap_g: completedPlanGap,\n      unaccounted_gap_g: planned - actual - defect - sample,\n      terminology: {\n        open_planned_quantity_g: '아직 완료실적이 없는 열린 작업지시의 계획량 합계',\n        completed_plan_gap_g: '완료 처리된 기록의 계획량 대비 실제·불량·샘플 차이',\n        unaccounted_gap_g: '전체 계획량에서 실제·불량·샘플을 뺀 단순 차이로, 미완료 생산량이나 확정 로스가 아님',\n      },\n      warning: '미완료 작업량은 open_planned_quantity_g를 사용해야 하며 unaccounted_gap_g를 미완료 또는 로스로 표현하면 안 됩니다.',\n`,
  'production summary terminology fields',
  'open_work_order_count: openWorkOrderCount',
)

replaceRequired(
  `5. 계획, 실제 생산, 불량, 샘플, 원재료 입출고, 현재재고를 서로 혼동하지 않습니다.\n6. 거래처 명세서 잔액은 실제 매입·입고 내역과 분리합니다.\n`,
  `5. 계획, 실제 생산, 불량, 샘플, 원재료 입출고, 현재재고를 서로 혼동하지 않습니다.\n5-1. 생산조회 결과의 unaccounted_gap_g는 미완료 작업량이 아니라 전체 계획 대비 단순 차이입니다. 이를 '미완료 생산량', '남은 생산량', '로스'라고 표현하지 않습니다.\n5-2. 미완료 작업지시의 수량과 건수는 반드시 open_planned_quantity_g와 open_work_order_count를 사용합니다. 완료 기록의 계획 대비 차이는 completed_plan_gap_g로 별도 설명합니다.\n5-3. 비정상적으로 큰 계획량이 합계와 달성률을 왜곡하면 원본 합계라고 명시하고, 해당 달성률을 정상 경영지표처럼 단정하지 않습니다.\n6. 거래처 명세서 잔액은 실제 매입·입고 내역과 분리합니다.\n`,
  'agent production terminology guardrails',
  '5-1. 생산조회 결과의 unaccounted_gap_g',
)

writeFileSync(agentPath, source, 'utf8')
console.log('MONI production summary quality patch completed.')

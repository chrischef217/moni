import { commercialToolDefinitions } from '@/lib/moni/agent/tools/commercial'
import { inventoryToolDefinitions } from '@/lib/moni/agent/tools/inventory'
import { productionToolDefinitions } from '@/lib/moni/agent/tools/production'
import { systemToolDefinitions } from '@/lib/moni/agent/tools/system'
import type { MoniToolDefinition } from '@/lib/moni/agent/tools/types'

export const moniToolDefinitions: MoniToolDefinition[] = [
  ...systemToolDefinitions,
  ...productionToolDefinitions,
  ...inventoryToolDefinitions,
  ...commercialToolDefinitions,
]

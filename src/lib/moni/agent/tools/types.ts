import type { ZodTypeAny } from 'zod'
import type { MoniToolName } from '@/lib/moni/agent/policies'

export type MoniToolDefinition = {
  name: MoniToolName
  description: string
  parameters: ZodTypeAny
}

import type { AuditCategoryKey } from './prompts'

export type AuditStoredFile = {
  id: string
  category: AuditCategoryKey
  originalName: string
  storedName: string
  size: number
  mimeType: string
  uploadedAt: string
}

export type AuditRecordStatus = 'completed' | 'failed'

export type AuditRecord = {
  id: string
  category: AuditCategoryKey
  categoryLabel: string
  status: AuditRecordStatus
  result: string
  error?: string
  model: string
  createdAt: string
  files: AuditStoredFile[]
}

export type AuditAnalyzeResponse =
  | {
      ok: true
      record: AuditRecord
    }
  | {
      ok: false
      error: string
      record?: AuditRecord
    }

export type AuditRecordsResponse =
  | {
      ok: true
      records: AuditRecord[]
    }
  | {
      ok: false
      error: string
    }

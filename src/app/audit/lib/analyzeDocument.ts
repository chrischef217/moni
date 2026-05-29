import Anthropic, { APIError, AuthenticationError, RateLimitError } from '@anthropic-ai/sdk'
import type { Message, TextBlock } from '@anthropic-ai/sdk/resources/messages'
import { AUDIT_CATEGORY_META, AUDIT_PROMPTS, type AuditCategoryKey } from './prompts'

export type AnalyzeDocumentFile = {
  name: string
  mimeType: string
  base64: string
}

export type AnalyzeDocumentResult = {
  model: string
  text: string
}

type AuditInputBlock =
  | {
      type: 'text'
      text: string
    }
  | {
      type: 'document'
      source: {
        type: 'base64'
        media_type: 'application/pdf'
        data: string
      }
    }
  | {
      type: 'image'
      source: {
        type: 'base64'
        media_type: 'image/jpeg' | 'image/png' | 'image/webp'
        data: string
      }
    }

class AuditModelError extends Error {
  code: 'api' | 'rate-limit'

  constructor(message: string, code: 'api' | 'rate-limit' = 'api') {
    super(message)
    this.name = 'AuditModelError'
    this.code = code
  }
}

export const AUDIT_MODEL = 'claude-sonnet-4-20250514'

function anthropicApiKey() {
  return process.env.ANTHROPIC_API_KEY?.trim() || ''
}

function buildPrompt(category: AuditCategoryKey, files: AnalyzeDocumentFile[]) {
  const categoryMeta = AUDIT_CATEGORY_META[category]

  return [
    `${categoryMeta.label} category financial audit analysis request for ${files.length} files.`,
    'Analyze all files together and reconcile mismatched amounts across documents.',
    'When evidence is missing, explicitly mark it as unknown instead of assuming values.',
    'Separate confirmed facts from estimates and include audit-risk observations.',
    '',
    'Attached files:',
    ...files.map((file, index) => `${index + 1}. ${file.name} (${file.mimeType})`),
  ].join('\n')
}

function toInputBlock(file: AnalyzeDocumentFile): AuditInputBlock {
  if (file.mimeType === 'application/pdf') {
    return {
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: file.base64,
      },
    }
  }

  if (file.mimeType === 'image/jpeg' || file.mimeType === 'image/png' || file.mimeType === 'image/webp') {
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: file.mimeType,
        data: file.base64,
      },
    }
  }

  throw new AuditModelError(`${file.name} file type is not supported.`)
}

function buildContent(category: AuditCategoryKey, files: AnalyzeDocumentFile[]): AuditInputBlock[] {
  const content: AuditInputBlock[] = files.map((file) => toInputBlock(file))

  content.push({
    type: 'text',
    text: buildPrompt(category, files),
  })

  return content
}

function extractText(message: Message) {
  return message.content
    .filter((block): block is TextBlock => block.type === 'text')
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

function normalizeError(error: unknown) {
  if (error instanceof AuditModelError) return error

  if (error instanceof AuthenticationError) {
    return new AuditModelError('ANTHROPIC_API_KEY is invalid or unauthorized.')
  }

  if (error instanceof RateLimitError) {
    return new AuditModelError(
      'Anthropic API rate limit exceeded. Please retry later or verify quota.',
      'rate-limit',
    )
  }

  if (error instanceof APIError) {
    return new AuditModelError(`Anthropic API request failed. (${error.status ?? 'unknown'})`)
  }

  if (error instanceof Error) {
    return new AuditModelError(error.message)
  }

  return new AuditModelError('Unknown error occurred during document analysis.')
}

export async function analyzeDocument({
  category,
  files,
}: {
  category: AuditCategoryKey
  files: AnalyzeDocumentFile[]
}): Promise<AnalyzeDocumentResult> {
  const apiKey = anthropicApiKey()
  if (!apiKey) {
    throw new AuditModelError('ANTHROPIC_API_KEY is not configured.')
  }

  if (files.length === 0) {
    throw new AuditModelError('No files to analyze.')
  }

  const client = new Anthropic({ apiKey })

  try {
    const message = await client.messages.create({
      model: AUDIT_MODEL,
      max_tokens: 2000,
      system: AUDIT_PROMPTS[category],
      messages: [
        {
          role: 'user',
          content: buildContent(category, files),
        },
      ],
    })

    const text = extractText(message)

    if (!text) {
      throw new AuditModelError('No analysis text found in Anthropic response.')
    }

    return {
      model: AUDIT_MODEL,
      text,
    }
  } catch (error) {
    console.error(JSON.stringify(error))
    throw normalizeError(error)
  }
}

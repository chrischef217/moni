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
      title: string
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
    `${categoryMeta.label} 카테고리의 재무감사 자료 ${files.length}개를 한 번에 분석해 주세요.`,
    '문서 간 수치가 다르면 차이를 명확히 적고, 문서에 없는 값은 추정으로 구분해 주세요.',
    '확정 사실과 추정 내용을 반드시 분리하고, 모든 금액은 원 단위로 표기해 주세요.',
    '응답은 한국어로 작성하고, 마지막에는 감사 관점의 핵심 리스크와 확인 필요 사항을 정리해 주세요.',
    '',
    '첨부 파일 목록:',
    ...files.map((file, index) => `${index + 1}. ${file.name} (${file.mimeType})`),
  ].join('\n')
}

function toInputBlock(file: AnalyzeDocumentFile): AuditInputBlock {
  if (file.mimeType === 'application/pdf') {
    return {
      type: 'document',
      title: file.name,
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

  throw new AuditModelError(`${file.name} 파일 형식은 지원되지 않습니다.`)
}

function buildContent(category: AuditCategoryKey, files: AnalyzeDocumentFile[]): AuditInputBlock[] {
  const content: AuditInputBlock[] = [
    {
      type: 'text',
      text: buildPrompt(category, files),
    },
  ]

  files.forEach((file, index) => {
    content.push({
      type: 'text',
      text: `다음 파일을 분석 대상에 포함해 주세요: ${index + 1}. ${file.name}`,
    })
    content.push(toInputBlock(file))
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
    return new AuditModelError('ANTHROPIC_API_KEY가 올바르지 않거나 권한이 없습니다.')
  }

  if (error instanceof RateLimitError) {
    return new AuditModelError(
      'Anthropic API 사용 한도를 초과했습니다. 잠시 후 다시 시도하거나 요금제/쿼터를 확인해 주세요.',
      'rate-limit',
    )
  }

  if (error instanceof APIError) {
    return new AuditModelError(`Anthropic API 호출에 실패했습니다. (${error.status ?? 'unknown'})`)
  }

  if (error instanceof Error) {
    return new AuditModelError(error.message)
  }

  return new AuditModelError('문서 분석 중 알 수 없는 오류가 발생했습니다.')
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
    throw new AuditModelError('ANTHROPIC_API_KEY가 설정되어 있지 않습니다.')
  }

  if (files.length === 0) {
    throw new AuditModelError('분석할 파일이 없습니다.')
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
      throw new AuditModelError('Anthropic 응답에서 분석 결과를 찾지 못했습니다.')
    }

    return {
      model: AUDIT_MODEL,
      text,
    }
  } catch (error) {
    throw normalizeError(error)
  }
}

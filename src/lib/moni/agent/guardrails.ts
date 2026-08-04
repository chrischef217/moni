import {
  ToolGuardrailFunctionOutputFactory,
  defineToolInputGuardrail,
  defineToolOutputGuardrail,
} from '@openai/agents'

const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/i,
  /SUPABASE_SERVICE_ROLE_KEY/i,
  /service[_ -]?role/i,
  /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/i,
  /ALLOWANCE_ENCRYPTION_KEY/i,
]

const UNSAFE_EXECUTION_PATTERNS = [
  /\bdrop\s+table\b/i,
  /\btruncate\s+table\b/i,
  /\bdelete\s+from\b/i,
  /\balter\s+table\b/i,
  /\bexecute_sql\b/i,
  /\bshell\b/i,
]

function serialize(value: unknown) {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value ?? '')
  }
}

function containsSensitiveData(value: unknown) {
  const serialized = serialize(value)
  return SECRET_PATTERNS.some((pattern) => pattern.test(serialized))
}

function containsUnsafeExecutionRequest(value: unknown) {
  const serialized = serialize(value)
  return UNSAFE_EXECUTION_PATTERNS.some((pattern) => pattern.test(serialized))
}

export const moniToolInputGuardrail = defineToolInputGuardrail({
  name: 'moni_tool_input_security',
  run: async ({ toolCall }) => {
    let args: unknown = toolCall.arguments
    try {
      args = JSON.parse(toolCall.arguments)
    } catch {
      // Invalid JSON will be rejected by the Zod tool schema.
    }
    if (containsSensitiveData(args)) {
      return ToolGuardrailFunctionOutputFactory.rejectContent('민감한 키 또는 비밀정보는 MONI 도구 인자로 전달할 수 없습니다.')
    }
    if (containsUnsafeExecutionRequest(args)) {
      return ToolGuardrailFunctionOutputFactory.rejectContent('MONI Agent는 SQL·셸·업무 데이터 변경 명령을 실행하지 않습니다.')
    }
    return ToolGuardrailFunctionOutputFactory.allow()
  },
})

export const moniToolOutputGuardrail = defineToolOutputGuardrail({
  name: 'moni_tool_output_security',
  run: async ({ output }) => {
    if (containsSensitiveData(output)) {
      return ToolGuardrailFunctionOutputFactory.rejectContent('도구 결과에 민감정보가 포함되어 사용자 응답으로 전달하지 않았습니다.')
    }
    return ToolGuardrailFunctionOutputFactory.allow()
  },
})

export function assertSafeUserRequest(message: string) {
  const normalized = String(message || '')
  const asksForSecrets = /(?:보여|출력|알려|공개).{0,30}(?:api\s*key|비밀키|service[_ -]?role|시스템\s*프롬프트|내부\s*프롬프트)/i.test(normalized)
    || /(?:api\s*key|비밀키|service[_ -]?role).{0,30}(?:보여|출력|알려|공개)/i.test(normalized)
  if (asksForSecrets || containsSensitiveData(normalized)) {
    throw new Error('민감한 키·비밀정보·내부 프롬프트는 조회하거나 출력할 수 없습니다.')
  }
}

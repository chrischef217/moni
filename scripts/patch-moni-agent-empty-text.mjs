import { readFileSync, writeFileSync } from 'node:fs'

const routePath = 'src/app/api/moni/agent-v2/route.ts'
const agentPath = 'src/lib/moni/agent-v2.ts'

function replaceRequired(source, oldBlock, newBlock, label, alreadyPresent) {
  if (source.includes(oldBlock)) {
    console.log(`Applied ${label}.`)
    return source.replace(oldBlock, newBlock)
  }
  if (alreadyPresent && source.includes(alreadyPresent)) {
    console.log(`${label} is already present.`)
    return source
  }
  throw new Error(`${label} anchor was not found; build stopped to prevent an unsafe patch.`)
}

let route = readFileSync(routePath, 'utf8')
route = replaceRequired(
  route,
  `    const disabled = text(process.env.MONI_AGENT_V2_DISABLED, 10) === '1'\n    if (action === 'handoff' || !openAIKey || disabled) return legacyPOST(legacyRequest)\n`,
  `    const disabled = text(process.env.MONI_AGENT_V2_DISABLED, 10).toLowerCase() === 'true'\n    if (action === 'handoff') return legacyPOST(legacyRequest)\n    if (!openAIKey) {\n      return NextResponse.json({ ok: false, error: 'MONI Agent의 OPENAI_API_KEY가 설정되지 않았습니다.' }, { status: 503 })\n    }\n    if (disabled) {\n      return NextResponse.json({ ok: false, error: 'MONI Agent V2가 운영 설정에서 비활성화되어 있습니다.' }, { status: 503 })\n    }\n`,
  'MONI Agent silent fallback removal',
  "MONI Agent V2가 운영 설정에서 비활성화되어 있습니다.",
)
route = replaceRequired(
  route,
  `  } catch (error) {\n    return NextResponse.json({\n      ok: false,\n      error: error instanceof Error ? error.message : 'MONI Agent 응답 생성 중 오류가 발생했습니다.',\n    }, { status: 500 })\n  }\n}\n`,
  `  } catch (error) {\n    const message = error instanceof Error ? error.message : 'MONI Agent 응답 생성 중 오류가 발생했습니다.'\n    console.error('[MONI_AGENT_V2_ERROR]', { message, occurred_at: new Date().toISOString() })\n    return NextResponse.json({\n      ok: false,\n      error: message,\n    }, { status: 500 })\n  }\n}\n`,
  'MONI Agent runtime error logging',
  '[MONI_AGENT_V2_ERROR]',
)
writeFileSync(routePath, route, 'utf8')

let agent = readFileSync(agentPath, 'utf8')
agent = replaceRequired(
  agent,
  `function extractOpenAIText(payload: Json) {\n  if (typeof payload.output_text === 'string') return text(payload.output_text, 20000)\n  const output = Array.isArray(payload.output) ? payload.output : []\n  return output\n    .flatMap((item: Json) => Array.isArray(item.content) ? item.content : [])\n    .filter((item: Json) => item.type === 'output_text' && typeof item.text === 'string')\n    .map((item: Json) => item.text)\n    .join('\\n')\n    .trim()\n}\n`,
  `function extractOpenAIText(payload: Json) {\n  if (typeof payload.output_text === 'string' && payload.output_text.trim()) return text(payload.output_text, 20000)\n  const output = Array.isArray(payload.output) ? payload.output : []\n  return output\n    .flatMap((item: Json) => Array.isArray(item.content) ? item.content : [])\n    .map((item: Json) => {\n      if (item.type === 'output_text' && typeof item.text === 'string') return item.text\n      if (item.type === 'refusal' && typeof item.refusal === 'string') return item.refusal\n      return ''\n    })\n    .filter(Boolean)\n    .join('\\n')\n    .trim()\n}\n`,
  'OpenAI text and refusal extraction',
  "item.type === 'refusal'",
)
agent = replaceRequired(
  agent,
  `      const payload = await openAIResponse(apiKey, {\n        model,\n        instructions: buildAgentInstructions(context),\n        input: conversationInput,\n        tools: MONI_AGENT_TOOLS,\n        tool_choice: 'auto',\n        parallel_tool_calls: false,\n        max_output_tokens: 2600,\n        store: false,\n      })\n`,
  `      const payload = await openAIResponse(apiKey, {\n        model,\n        instructions: buildAgentInstructions(context),\n        input: conversationInput,\n        tools: MONI_AGENT_TOOLS,\n        tool_choice: 'auto',\n        parallel_tool_calls: false,\n        reasoning: { effort: 'low' },\n        max_output_tokens: 6000,\n        store: false,\n      })\n`,
  'OpenAI reasoning and output budget configuration',
  "reasoning: { effort: 'low' },\n        max_output_tokens: 6000",
)
agent = replaceRequired(
  agent,
  `      if (!calls.length) {\n        const answer = extractOpenAIText(payload)\n        if (!answer) throw new Error('MONI Agent가 최종 텍스트 응답을 반환하지 않았습니다.')\n        await context.supabase\n`,
  `      if (!calls.length) {\n        let answer = extractOpenAIText(payload)\n        if (!answer) {\n          console.warn('[MONI_AGENT_EMPTY_TEXT_RETRY]', {\n            response_id: responseId,\n            status: text(payload.status, 80),\n            incomplete_reason: text(payload?.incomplete_details?.reason, 120),\n            output_types: output.map((item: Json) => text(item.type, 80)),\n          })\n          const retryPayload = await openAIResponse(apiKey, {\n            model,\n            instructions: \`${'${buildAgentInstructions(context)}'}\\n\\n도구를 더 호출하지 말고, 지금까지 확인한 사실만으로 반드시 한국어 최종 텍스트 답변을 작성하세요.\`,\n            input: conversationInput,\n            tools: MONI_AGENT_TOOLS,\n            tool_choice: 'none',\n            parallel_tool_calls: false,\n            reasoning: { effort: 'low' },\n            max_output_tokens: 6000,\n            store: false,\n          })\n          responseId = text(retryPayload.id, 120) || responseId\n          answer = extractOpenAIText(retryPayload)\n          if (!answer) {\n            const reason = text(retryPayload?.incomplete_details?.reason || payload?.incomplete_details?.reason, 160)\n              || text(retryPayload?.status || payload?.status, 80)\n              || 'unknown'\n            throw new Error(\`MONI Agent가 최종 텍스트 응답을 반환하지 않았습니다. 상태: ${'${reason}'}\`)\n          }\n        }\n        await context.supabase\n`,
  'MONI Agent empty text retry',
  '[MONI_AGENT_EMPTY_TEXT_RETRY]',
)
agent = replaceRequired(
  agent,
  `      tool_choice: 'none',\n      max_output_tokens: 2200,\n      store: false,\n`,
  `      tool_choice: 'none',\n      reasoning: { effort: 'low' },\n      max_output_tokens: 6000,\n      store: false,\n`,
  'MONI Agent limit response output budget',
  "tool_choice: 'none',\n      reasoning: { effort: 'low' },\n      max_output_tokens: 6000",
)
writeFileSync(agentPath, agent, 'utf8')

console.log('MONI Agent empty text compatibility patch completed.')

import { readFileSync, writeFileSync } from 'node:fs'

const routePath = 'src/app/api/moni/agent-chat/route.ts'
const source = readFileSync(routePath, 'utf8')

const oldBlock = `  const input: Json[] = history.map((item) => ({
    role: item.role,
    content: [{ type: 'input_text', text: item.content }],
  }))`

const fixedBlock = `  const input: Json[] = history.map((item) => ({
    role: item.role,
    content: [{
      type: item.role === 'assistant' ? 'output_text' : 'input_text',
      text: item.content,
    }],
  }))`

if (source.includes(oldBlock)) {
  writeFileSync(routePath, source.replace(oldBlock, fixedBlock), 'utf8')
  console.log('Applied MONI OpenAI Responses history compatibility patch.')
} else if (source.includes("item.role === 'assistant' ? 'output_text' : 'input_text'")) {
  console.log('MONI OpenAI Responses history compatibility patch is already present.')
} else {
  throw new Error('MONI OpenAI history mapping block was not found; build stopped to prevent an unsafe patch.')
}

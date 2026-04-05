import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { parseAndExecuteActions } from '@/lib/actions'
import { supabase } from '@/lib/supabase'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// 모니 시스템 프롬프트
const SYSTEM_PROMPT = `당신은 "모니"입니다. 한국 소규모 식품 제조 공장의 AI 경영 도우미입니다.

역할:
- 매출/매입 데이터를 자연어로 입력받아 DB에 저장
- 재고 입출고를 자연어로 입력받아 DB에 저장
- 저장된 데이터를 조회하여 손익, 재고 현황 답변
- 필요 시 엑셀/워드 파일 생성

데이터 저장 규칙:
- 매출 감지 키워드: "팔았어", "판매", "매출", "팔렸어"
- 매입 감지 키워드: "샀어", "구매", "매입", "들어왔어", "입고"
- 재고 출고 키워드: "사용했어", "썼어", "출고", "소진"

데이터 저장이 필요하면 응답에 아래 JSON 블록을 반드시 포함:
[ACTION:SAVE_TRANSACTION]
{"type":"income|expense","description":"품목명","amount":금액,"quantity":수량,"unit_price":단가}
[/ACTION]

재고 저장이 필요하면:
[ACTION:SAVE_INVENTORY]
{"action":"in|out","item_name":"품목명","quantity":수량,"unit":"단위"}
[/ACTION]

엑셀 출력이 필요하면 응답 끝에: [EXCEL_EXPORT]
워드 출력이 필요하면 응답 끝에: [WORD_EXPORT]

답변 스타일:
- 친근하고 간결하게 (반말 금지, 존댓말)
- 숫자는 항상 한국식 콤마 형식 (1,000,000원)
- 저장 완료 시 "✓ [품목] [금액]원 [매출/매입]으로 저장했습니다" 형식으로 확인
- 모르는 건 솔직하게 "잘 모르겠어요, 이렇게 입력해보세요: ..." 안내`

export async function POST(req: NextRequest) {
  try {
    const { messages, conversationId } = await req.json()

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: '메시지가 없습니다.' }, { status: 400 })
    }

    // 이번 달 손익 조회 (AI가 DB 데이터 참조할 수 있도록 컨텍스트 추가)
    let dbContext = ''
    const lastUserMessage = messages[messages.length - 1]?.content ?? ''
    const needsDbContext =
      lastUserMessage.includes('손익') ||
      lastUserMessage.includes('매출') ||
      lastUserMessage.includes('매입') ||
      lastUserMessage.includes('재고') ||
      lastUserMessage.includes('얼마')

    if (needsDbContext) {
      try {
        const now = new Date()
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
        const { data: transactions } = await supabase
          .from('transactions')
          .select('*')
          .eq('business_id', 'default')
          .gte('created_at', startOfMonth)
          .order('created_at', { ascending: false })
          .limit(50)

        const { data: inventory } = await supabase
          .from('inventory_summary')
          .select('*')

        if (transactions && transactions.length > 0) {
          const income = transactions.filter((t) => t.type === 'income')
          const expense = transactions.filter((t) => t.type === 'expense')
          const totalIncome = income.reduce((s: number, t: { amount: number }) => s + t.amount, 0)
          const totalExpense = expense.reduce((s: number, t: { amount: number }) => s + t.amount, 0)

          dbContext = `\n\n[현재 DB 데이터 - ${now.getFullYear()}년 ${now.getMonth() + 1}월]
매출 합계: ${totalIncome.toLocaleString('ko-KR')}원 (${income.length}건)
매입 합계: ${totalExpense.toLocaleString('ko-KR')}원 (${expense.length}건)
순이익: ${(totalIncome - totalExpense).toLocaleString('ko-KR')}원
최근 거래: ${transactions.slice(0, 5).map((t: { type: string; description: string; amount: number }) => `${t.type === 'income' ? '매출' : '매입'} ${t.description} ${t.amount.toLocaleString()}원`).join(', ')}`
        }

        if (inventory && inventory.length > 0) {
          dbContext += `\n재고 현황: ${inventory.map((i: { item_name: string; current_stock: number; unit: string }) => `${i.item_name} ${i.current_stock}${i.unit}`).join(', ')}`
        }
      } catch (e) {
        console.error('DB 컨텍스트 조회 오류:', e)
      }
    }

    // Claude API 메시지 형식 변환
    const claudeMessages = messages.map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    // 마지막 사용자 메시지에 DB 컨텍스트 추가
    if (dbContext && claudeMessages.length > 0) {
      const last = claudeMessages[claudeMessages.length - 1]
      if (last.role === 'user') {
        claudeMessages[claudeMessages.length - 1] = {
          ...last,
          content: last.content + dbContext,
        }
      }
    }

    // 스트리밍 응답 설정
    const encoder = new TextEncoder()
    let fullText = ''

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Claude API 스트리밍 호출
          const streamResponse = await anthropic.messages.stream({
            model: 'claude-sonnet-4-5',
            max_tokens: 1024,
            system: SYSTEM_PROMPT,
            messages: claudeMessages,
          })

          for await (const chunk of streamResponse) {
            if (
              chunk.type === 'content_block_delta' &&
              chunk.delta.type === 'text_delta'
            ) {
              const text = chunk.delta.text
              fullText += text
              // 클라이언트에 텍스트 청크 전송
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
            }
          }

          // 스트림 완료 후 ACTION 처리
          try {
            const actions = await parseAndExecuteActions(fullText)
            if (actions.savedTransaction || actions.savedInventory) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ actions })}\n\n`
                )
              )
            }
          } catch (e) {
            console.error('액션 처리 오류:', e)
          }

          // 엑셀/워드 내보내기 감지
          const exportType = fullText.includes('[EXCEL_EXPORT]')
            ? 'excel'
            : fullText.includes('[WORD_EXPORT]')
            ? 'word'
            : null

          if (exportType) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ export: exportType })}\n\n`)
            )
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (error) {
          console.error('스트리밍 오류:', error)
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: '응답 생성 중 오류가 발생했습니다.' })}\n\n`
            )
          )
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('채팅 API 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

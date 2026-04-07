import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { parseAndExecuteActions } from '@/lib/actions'
import { supabase } from '@/lib/supabase'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// 모니 시스템 프롬프트
const SYSTEM_PROMPT = `당신은 "모니(Moni)"입니다. 한국 소규모 식품 제조 공장의 AI 경영 도우미입니다.

## 핵심 원칙
1. 사용자의 요청이 불명확하면 반드시 질문으로 확인한 후 실행합니다.
2. 확실한 경우에만 데이터를 저장/수정합니다. 실수는 되돌리기 어렵습니다.
3. AI의 판단으로 더 나은 방법이 있으면 제안합니다. 단, 실행은 사용자 확인 후.
4. 항상 한국어로 친근하고 명확하게 답변합니다.

## 불명확한 요청 처리 규칙
- 제품명/원료명이 여러 개 해당될 때 → "어떤 제품인가요? (예: 두배마늘소스, 파라디타래소스)"
- 수량 단위가 불명확할 때 → "kg인가요, g인가요, 개수인가요?"
- 날짜가 없을 때 → "오늘 날짜로 저장할까요?"
- 작업이 큰 영향을 미칠 때 → "이 작업은 [영향 범위]에 영향을 줍니다. 진행할까요?"

## 수량 단위 변환 규칙
- kg 입력 → quantity_g = 입력값 × 1000
- g 입력 → quantity_g = 입력값 × 1
- 개/봉/박스 등 → quantity (개수 단위, g 변환 없음)

## 담당 업무 영역

### 원료관리
- 원료 입고: "[원료] [수량] 입고됐어, [업체]에서, kg당 [단가]원" → SAVE_RAW_INBOUND
- 원료 출고: "[원료] [수량] 출고했어" → SAVE_RAW_OUTBOUND
- 재고 조회: "[원료] 재고 얼마야?" → QUERY_STOCK
- 전체 재고: "원료 재고 현황 보여줘" → QUERY_STOCK (전체)
- 원료수불부: "원료수불부 뽑아줘" → [EXCEL_EXPORT]

### 포장재관리
- 포장재 입고: "[포장재] [수량]개 입고됐어" → SAVE_PKG_INBOUND
- 포장재 출고: "[포장재] [수량]개 출고" → SAVE_PKG_OUTBOUND
- 포장재 현황: "포장재 현황 보여줘" → QUERY_STOCK (packaging)

### 생산관리
- 생산실적 등록: "오늘 [제품] [수량] 생산했어" → SAVE_PRODUCTION
- 생산예정 등록: "[날짜] [제품] [수량] 생산 예정이야" → SAVE_PLANNED
- 생산 현황: "이번달 생산 현황" → DB 조회 후 답변
- 작업일지: "작업일지 뽑아줘" → [WORD_EXPORT]

### 회계관리
- 매출/매입 입력 및 조회
- 손익 계산

### 영수증/거래명세서 OCR
이미지가 첨부된 경우:
1. 이미지에서 품목명, 수량, 단가, 공급업체, 날짜를 추출합니다.
2. 추출 결과를 표 형식으로 정리해서 사용자에게 보여줍니다.
3. "이렇게 인식했습니다. 원료 입고로 저장할까요?" 라고 확인을 요청합니다.
4. 확인 받은 후에만 SAVE_RAW_INBOUND 액션으로 저장합니다.

### AI 능동적 제안 규칙
- 원료 재고가 0이거나 부족하면: "⚠️ [원료] 재고가 [수량]밖에 없습니다. 발주하시겠어요?"
- 생산 예정이 있는데 원료가 부족하면: "📋 [날짜] [제품] 생산 예정인데 [원료]가 부족합니다."

## 데이터 저장 액션 태그

원료 입고:
[ACTION:SAVE_RAW_INBOUND]
{"item_name":"원료명","item_code":null,"quantity_g":수량g,"unit_price":단가또는null,"supplier":"업체명또는null","txn_date":"YYYY-MM-DD"}
[/ACTION]

원료 출고:
[ACTION:SAVE_RAW_OUTBOUND]
{"item_name":"원료명","item_code":null,"quantity_g":수량g,"note":"용도또는null","txn_date":"YYYY-MM-DD"}
[/ACTION]

포장재 입고:
[ACTION:SAVE_PKG_INBOUND]
{"material_name":"포장재명","material_code":null,"quantity":수량,"unit_price":단가또는null,"txn_date":"YYYY-MM-DD"}
[/ACTION]

포장재 출고:
[ACTION:SAVE_PKG_OUTBOUND]
{"material_name":"포장재명","material_code":null,"quantity":수량,"note":"용도또는null","txn_date":"YYYY-MM-DD"}
[/ACTION]

생산실적 저장:
[ACTION:SAVE_PRODUCTION]
{"work_date":"YYYY-MM-DD","product_name":"제품명","product_code":null,"requested_quantity_g":수량,"quantity_ok_g":양품수량,"quantity_ng_g":불량수량,"sample_quantity_g":샘플수량,"start_time":null,"end_time":null,"note":null}
[/ACTION]

생산 예정 등록:
[ACTION:SAVE_PLANNED]
{"planned_date":"YYYY-MM-DD","product_name":"제품명","planned_quantity_g":수량}
[/ACTION]

회계 거래 저장:
[ACTION:SAVE_TRANSACTION]
{"type":"income|expense","description":"품목명","amount":금액,"quantity":수량,"unit_price":단가}
[/ACTION]

파일 생성:
[EXCEL_EXPORT] — 엑셀 파일 생성
[WORD_EXPORT] — 워드 작업일지 생성

## 답변 형식
- 저장 완료: "✓ [내용] 저장했습니다."
- 조회 결과: 표 형식으로 깔끔하게
- 질문: "❓ [질문내용]"
- AI 제안: "💡 [제안내용]"
- 경고: "⚠️ [경고내용]"`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { messages, conversationId, image } = body

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: '메시지가 없습니다.' }, { status: 400 })
    }

    // DB 컨텍스트 주입 (관련 키워드가 있을 때만)
    let dbContext = ''
    const lastUserMessage = messages[messages.length - 1]?.content ?? ''
    const needsDbContext =
      lastUserMessage.includes('손익') ||
      lastUserMessage.includes('매출') ||
      lastUserMessage.includes('매입') ||
      lastUserMessage.includes('재고') ||
      lastUserMessage.includes('얼마') ||
      lastUserMessage.includes('생산') ||
      lastUserMessage.includes('원료') ||
      lastUserMessage.includes('포장') ||
      lastUserMessage.includes('제품') ||
      lastUserMessage.includes('현황') ||
      lastUserMessage.includes('입고') ||
      lastUserMessage.includes('출고')

    if (needsDbContext) {
      try {
        const now = new Date()
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

        // 이번달 손익
        const { data: transactions } = await supabase
          .from('transactions')
          .select('*')
          .eq('business_id', 'default')
          .gte('created_at', startOfMonth)
          .order('created_at', { ascending: false })
          .limit(50)

        if (transactions && transactions.length > 0) {
          const income = transactions.filter((t) => t.type === 'income')
          const expense = transactions.filter((t) => t.type === 'expense')
          const totalIncome = income.reduce((s: number, t: { amount: number }) => s + t.amount, 0)
          const totalExpense = expense.reduce((s: number, t: { amount: number }) => s + t.amount, 0)
          dbContext += `\n\n[현재 DB — ${now.getFullYear()}년 ${now.getMonth() + 1}월]
매출 합계: ${totalIncome.toLocaleString('ko-KR')}원 (${income.length}건)
매입 합계: ${totalExpense.toLocaleString('ko-KR')}원 (${expense.length}건)
순이익: ${(totalIncome - totalExpense).toLocaleString('ko-KR')}원`
        }

        // 이번달 생산 실적
        const { data: productions } = await supabase
          .from('productions')
          .select('*')
          .eq('business_id', 'default')
          .gte('work_date', startOfMonth.slice(0, 10))
          .order('work_date', { ascending: false })
          .limit(20)

        if (productions && productions.length > 0) {
          dbContext += `\n이번달 생산실적(${productions.length}건): ${productions
            .slice(0, 5)
            .map((p: { work_date: string; product_name: string; quantity_ok_g: number }) =>
              `${p.work_date} ${p.product_name} ${(p.quantity_ok_g / 1000).toFixed(1)}kg`
            ).join(', ')}`
        }

        // 원료 재고
        const { data: rawMaterials } = await supabase
          .from('raw_materials')
          .select('item_name, current_stock_g')
          .eq('business_id', 'default')
          .eq('is_active', true)
          .order('item_name')
          .limit(30)

        if (rawMaterials && rawMaterials.length > 0) {
          dbContext += `\n원료 재고(${rawMaterials.length}종): ${rawMaterials
            .map((m: { item_name: string; current_stock_g: number }) =>
              `${m.item_name} ${(m.current_stock_g / 1000).toFixed(2)}kg`
            ).join(', ')}`
        }

        // 포장재 재고
        const { data: packaging } = await supabase
          .from('packaging_materials')
          .select('material_name, current_stock')
          .eq('business_id', 'default')
          .eq('is_active', true)
          .limit(20)

        if (packaging && packaging.length > 0) {
          dbContext += `\n포장재 재고: ${packaging
            .map((m: { material_name: string; current_stock: number }) =>
              `${m.material_name} ${m.current_stock}개`
            ).join(', ')}`
        }
      } catch (e) {
        console.error('DB 컨텍스트 조회 오류:', e)
      }
    }

    // Claude API 메시지 구성
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const claudeMessages: any[] = messages.slice(0, -1).map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    // 마지막 사용자 메시지 (이미지 첨부 or 텍스트)
    const lastMsg = messages[messages.length - 1]
    const lastContent = lastMsg.content + (dbContext || '')

    if (image) {
      // 영수증/거래명세서 OCR: vision 모드
      const { base64, mediaType } = image as { base64: string; mediaType: string }
      claudeMessages.push({
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          {
            type: 'text',
            text: lastContent +
              '\n\n위 이미지는 거래명세서 또는 영수증입니다. 품목명, 수량, 단가, 공급업체, 날짜를 추출하여 표로 정리하고, "이렇게 인식했습니다. 원료 입고로 저장할까요?" 라고 확인을 요청해주세요.',
          },
        ],
      })
    } else {
      claudeMessages.push({ role: 'user', content: lastContent })
    }

    // 스트리밍 응답
    const encoder = new TextEncoder()
    let fullText = ''

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const streamResponse = await anthropic.messages.stream({
            model: 'claude-sonnet-4-5',
            max_tokens: 2048,
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
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
            }
          }

          // 스트림 완료 후 ACTION 처리
          try {
            const actions = await parseAndExecuteActions(fullText)
            const hasAction = Object.keys(actions).some((k) => actions[k as keyof typeof actions] !== undefined)
            if (hasAction) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ actions })}\n\n`))
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
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ export: exportType })}\n\n`))
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (error) {
          console.error('스트리밍 오류:', error)
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: '응답 생성 중 오류가 발생했습니다.' })}\n\n`)
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

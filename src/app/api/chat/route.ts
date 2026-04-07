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
- 제품명이 여러 개 해당될 때 → "어떤 제품인가요? (예: 두배마늘소스, 파라디타래소스)"
- 수량 단위가 불명확할 때 → "kg인가요, g인가요, 개수인가요?"
- 날짜가 없을 때 → "오늘 날짜(YYYY-MM-DD)로 저장할까요?"
- 작업이 큰 영향을 미칠 때 → "이 작업은 [영향 범위]에 영향을 줍니다. 진행할까요?"

## 담당 업무 영역

### 생산관리
- 생산실적 등록: "오늘 [제품] [수량] 생산했어" → productions 저장
- 생산예정 등록: "[날짜] [제품] [수량] 생산 예정이야" → planned_productions 저장
- 생산 현황 조회: "이번달 생산 현황", "오늘 뭐 만들었어?" → DB 조회 후 답변
- 작업일지 생성: "작업일지 뽑아줘" → [WORD_EXPORT] 태그

### 원료관리
- 원료 입고: "[원료] [수량] 입고됐어, [업체]에서" → raw_material_transactions 저장
- 원료 재고 조회: "[원료] 재고 얼마야?" → raw_materials + transactions 조회
- 원료수불부: "원료수불부 뽑아줘" → [EXCEL_EXPORT] 태그

### 포장재관리
- 포장재 입고: "[포장재] [수량] 입고" → packaging_transactions 저장
- 포장재 재고 조회: "포장재 현황 보여줘" → 조회 후 답변

### 제품관리
- 제품 등록: "신규 제품 등록해줘" → 정보 확인 후 products 저장
- 제품 목록: "제품 목록 보여줘" → products 조회

### 회계관리 (기존 Sprint 1)
- 매출/매입 입력 및 조회
- 손익 계산

### AI 능동적 제안 규칙
- 원료 재고가 0이거나 부족하면: "⚠️ [원료] 재고가 [수량]밖에 없습니다. 발주하시겠어요?"
- 생산 예정이 있는데 원료가 부족하면: "📋 [날짜] [제품] 생산 예정인데 [원료]가 부족합니다."
- 같은 실수가 반복되면: "혹시 [이전 패턴]을 자동화할까요?"

## 데이터 저장 액션 태그

생산실적 저장:
[ACTION:SAVE_PRODUCTION]
{"work_date":"YYYY-MM-DD","product_name":"제품명","product_code":"코드","requested_quantity_g":수량,"quantity_ok_g":양품수량,"quantity_ng_g":불량수량,"sample_quantity_g":샘플수량,"start_time":"HH:MM","end_time":"HH:MM","note":"비고"}
[/ACTION]

원료 입고:
[ACTION:SAVE_RAW_INBOUND]
{"item_code":"코드","item_name":"원료명","quantity_g":수량,"unit_price":단가,"supplier":"업체명","txn_date":"YYYY-MM-DD"}
[/ACTION]

원료 출고:
[ACTION:SAVE_RAW_OUTBOUND]
{"item_code":"코드","item_name":"원료명","quantity_g":수량,"note":"비고","txn_date":"YYYY-MM-DD"}
[/ACTION]

포장재 입고:
[ACTION:SAVE_PKG_INBOUND]
{"material_code":"코드","quantity":수량,"txn_date":"YYYY-MM-DD"}
[/ACTION]

생산 예정 등록:
[ACTION:SAVE_PLANNED]
{"planned_date":"YYYY-MM-DD","product_name":"제품명","planned_quantity_g":수량}
[/ACTION]

기존 회계 거래 저장:
[ACTION:SAVE_TRANSACTION]
{"type":"income|expense","description":"품목명","amount":금액,"quantity":수량,"unit_price":단가}
[/ACTION]

기존 재고 저장:
[ACTION:SAVE_INVENTORY]
{"action":"in|out","item_name":"품목명","quantity":수량,"unit":"단위"}
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

        // 이번달 생산 실적 조회
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

        // 원료 재고 조회
        const { data: rawMaterials } = await supabase
          .from('raw_materials')
          .select('item_name, current_stock_g')
          .eq('business_id', 'default')
          .eq('is_active', true)
          .gt('current_stock_g', 0)
          .limit(10)

        if (rawMaterials && rawMaterials.length > 0) {
          dbContext += `\n원료 재고: ${rawMaterials
            .map((m: { item_name: string; current_stock_g: number }) =>
              `${m.item_name} ${(m.current_stock_g / 1000).toFixed(1)}kg`
            ).join(', ')}`
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

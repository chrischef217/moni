/**
 * Moni 채팅 API — Ollama + Gemma 4 로컬 모델 버전
 * 엔드포인트: http://localhost:11434/api/chat
 * 스트리밍: NDJSON (각 줄이 독립적인 JSON 객체)
 */
import { NextRequest, NextResponse } from 'next/server'
import { parseAndExecuteActions } from '@/lib/actions'
import { supabase } from '@/lib/supabase'
import { runStockAlertEngine, getUnreadAlerts, markAlertsRead } from '@/lib/stock_alert_engine'

// Ollama 설정
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'gemma4:26b'

// 모니 시스템 프롬프트 (기존 그대로 유지)
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

## 재고 부족 알림 처리
컨텍스트에 [재고부족알림] 섹션이 있으면:
- 대화 초반에 먼저 알림 내용을 전달합니다
- 예시: "⚠️ 오늘 확인이 필요한 사항이 있어요:\n- [내용]\n발주하시겠어요?"
- 발주 의향이 있으면 SAVE_PURCHASE_ORDER 액션으로 저장합니다

## 담당 업무 영역

### BOM 관리
- BOM 조회: "[제품명] BOM 보여줘" → QUERY_BOM
- BOM 기반 원료 계산: "[제품] [수량] 생산하려면 원료 얼마나 필요해?" → BOM × 수량 계산

### 발주 관리
- 발주 등록: "[원료] 발주 넣어줘" → SAVE_PURCHASE_ORDER
- 발주 현황: "발주 현황 보여줘" → purchase_orders 조회
- 부족 원료 목록: "발주 넣어야 할 것 알려줘" → 재고 부족 원료 목록 출력

### 자금 관리
- 자금 현황: "이번 달 자금 상황 알려줘" → cash_flow 조회
- 자금 등록: "[거래처] [금액] [수취/지불] 예정이야" → SAVE_CASH_FLOW
- 자금-발주 연동: 발주 시 자금 충분한지 확인 후 조언

### 구글 캘린더 연동
- "구글 캘린더에 등록해줘" → SAVE_CALENDAR_EVENT
- 발주/입고/생산 일정 자동 등록 제안

### 원료관리
- 원료 입고: "[원료] [수량] 입고됐어, [업체]에서, kg당 [단가]원" → SAVE_RAW_INBOUND
- 원료 출고: "[원료] [수량] 출고했어" → SAVE_RAW_OUTBOUND
- 재고 조회: "[원료] 재고 얼마야?" → 조회 후 답변
- 원료수불부: "원료수불부 뽑아줘" → [EXCEL_EXPORT]

### 포장재관리
- 포장재 입고: "[포장재] [수량]개 입고됐어" → SAVE_PKG_INBOUND
- 포장재 출고: "[포장재] [수량]개 출고" → SAVE_PKG_OUTBOUND
- 포장재 현황: "포장재 현황 보여줘" → 조회 후 답변

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

## 데이터 저장 액션 태그

BOM 조회:
[ACTION:QUERY_BOM]
{"product_name":"제품명"}
[/ACTION]

발주 등록:
[ACTION:SAVE_PURCHASE_ORDER]
{"item_name":"원료명","supplier":"업체또는null","order_quantity_g":수량g,"unit_price":단가또는null,"lead_time_days":리드타임일수,"order_date":"YYYY-MM-DD"}
[/ACTION]

자금 등록:
[ACTION:SAVE_CASH_FLOW]
{"type":"balance|receivable|payable","counterpart":"거래처명또는null","amount":금액,"due_date":"YYYY-MM-DD또는null"}
[/ACTION]

구글 캘린더 이벤트:
[ACTION:SAVE_CALENDAR_EVENT]
{"title":"이벤트 제목","date":"YYYY-MM-DD","description":"상세내용","type":"order|delivery|production"}
[/ACTION]

자금 확인:
[ACTION:CHECK_CASHFLOW]
{"required_amount":필요금액,"item_name":"원료명"}
[/ACTION]

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
- 경고: "⚠️ [경고내용]"
- 발주 제안: "📦 [발주내용]"`

// Ollama /api/chat 메시지 타입
interface OllamaMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  images?: string[]  // base64 이미지 (vision 지원 모델용)
}

// Ollama 스트리밍 응답 한 줄의 타입
interface OllamaChunk {
  model: string
  created_at: string
  message: { role: string; content: string }
  done: boolean
  done_reason?: string
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { messages, image } = body

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: '메시지가 없습니다.' }, { status: 400 })
    }

    // ── DB 컨텍스트 + 재고 알림 수집 ──────────────────────────
    let dbContext = ''
    const lastUserMessage = messages[messages.length - 1]?.content ?? ''
    const isFirstMessage = messages.length === 1

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
      lastUserMessage.includes('출고') ||
      lastUserMessage.includes('발주') ||
      lastUserMessage.includes('BOM') ||
      lastUserMessage.includes('bom') ||
      lastUserMessage.includes('자금') ||
      lastUserMessage.includes('배합')

    try {
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

      // 첫 메시지 → 재고 부족 알림 엔진 실행
      if (isFirstMessage) {
        try {
          const [stockAlerts, unreadAlerts] = await Promise.all([
            runStockAlertEngine(),
            getUnreadAlerts(),
          ])

          const allAlerts = [
            ...unreadAlerts,
            ...stockAlerts.map((a) =>
              `${a.product_name} 생산 시 ${a.item_name}이 ${a.possible_productions}회치밖에 없습니다 (현재: ${(a.current_stock_g / 1000).toFixed(1)}kg / 1회필요: ${(a.required_per_production_g / 1000).toFixed(1)}kg)`
            ),
          ]

          if (allAlerts.length > 0) {
            dbContext += `\n\n[재고부족알림 - 오늘 확인 필요]\n${allAlerts.slice(0, 5).join('\n')}`
          }

          await markAlertsRead()
        } catch (e) {
          console.error('재고 알림 엔진 오류:', e)
        }
      }

      if (needsDbContext) {
        // 이번달 손익
        const { data: transactions } = await supabase
          .from('transactions')
          .select('type, amount, description')
          .eq('business_id', 'default')
          .gte('created_at', startOfMonth)
          .limit(50)

        if (transactions && transactions.length > 0) {
          const income = transactions.filter((t) => t.type === 'income')
          const expense = transactions.filter((t) => t.type === 'expense')
          const totalIncome = income.reduce((s, t) => s + t.amount, 0)
          const totalExpense = expense.reduce((s, t) => s + t.amount, 0)
          dbContext += `\n\n[${now.getFullYear()}년 ${now.getMonth() + 1}월 손익]
매출: ${totalIncome.toLocaleString('ko-KR')}원 / 매입: ${totalExpense.toLocaleString('ko-KR')}원 / 순이익: ${(totalIncome - totalExpense).toLocaleString('ko-KR')}원`
        }

        // 이번달 생산 실적
        const { data: productions } = await supabase
          .from('productions')
          .select('work_date, product_name, quantity_ok_g')
          .eq('business_id', 'default')
          .gte('work_date', startOfMonth.slice(0, 10))
          .order('work_date', { ascending: false })
          .limit(10)

        if (productions && productions.length > 0) {
          dbContext += `\n이번달 생산(${productions.length}건): ${productions.slice(0, 5)
            .map((p) => `${p.work_date} ${p.product_name} ${(p.quantity_ok_g / 1000).toFixed(1)}kg`).join(', ')}`
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
          dbContext += `\n원료재고(${rawMaterials.length}종): ${rawMaterials
            .map((m) => `${m.item_name} ${(m.current_stock_g / 1000).toFixed(2)}kg`).join(', ')}`
        }

        // 포장재 재고
        const { data: packaging } = await supabase
          .from('packaging_materials')
          .select('material_name, current_stock')
          .eq('business_id', 'default')
          .eq('is_active', true)
          .limit(15)

        if (packaging && packaging.length > 0) {
          dbContext += `\n포장재: ${packaging.map((m) => `${m.material_name} ${m.current_stock}개`).join(', ')}`
        }

        // BOM 데이터 (배합표 관련 질문 시)
        if (
          lastUserMessage.includes('BOM') ||
          lastUserMessage.includes('bom') ||
          lastUserMessage.includes('배합') ||
          lastUserMessage.includes('원료 얼마') ||
          lastUserMessage.includes('원료 필요')
        ) {
          const { data: bomItems } = await supabase
            .from('bom_items')
            .select('product_name, raw_name, ratio_percent, note')
            .eq('business_id', 'default')
            .order('product_name')
            .limit(100)

          if (bomItems && bomItems.length > 0) {
            const bomByProduct = new Map<string, typeof bomItems>()
            for (const b of bomItems) {
              const arr = bomByProduct.get(b.product_name) ?? []
              arr.push(b)
              bomByProduct.set(b.product_name, arr)
            }
            const bomSummary = Array.from(bomByProduct.entries())
              .map(([name, items]) =>
                `${name}: ${items.map((i) => `${i.raw_name}(${i.ratio_percent}%)`).join(', ')}`
              )
              .join('\n')
            dbContext += `\n\n[BOM 배합표]\n${bomSummary}`
          }
        }

        // 자금 현황
        if (lastUserMessage.includes('자금') || lastUserMessage.includes('발주') || lastUserMessage.includes('현금')) {
          const { data: cashFlow } = await supabase
            .from('cash_flow')
            .select('type, counterpart, amount, due_date')
            .eq('business_id', 'default')
            .order('due_date', { ascending: true })
            .limit(10)

          if (cashFlow && cashFlow.length > 0) {
            const balance = cashFlow.filter((c) => c.type === 'balance').reduce((s, c) => s + c.amount, 0)
            const receivable = cashFlow.filter((c) => c.type === 'receivable').reduce((s, c) => s + c.amount, 0)
            const payable = cashFlow.filter((c) => c.type === 'payable').reduce((s, c) => s + c.amount, 0)
            dbContext += `\n자금현황: 현금잔고 ${balance.toLocaleString()}원 / 미수금 ${receivable.toLocaleString()}원 / 미지급 ${payable.toLocaleString()}원`
          }
        }
      }
    } catch (e) {
      console.error('DB 컨텍스트 오류:', e)
    }

    // ── Ollama 메시지 배열 구성 ────────────────────────────────
    // Ollama는 system 역할을 messages 배열 첫 번째 요소로 받음
    const ollamaMessages: OllamaMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      // 이전 대화 이력 (마지막 메시지 제외)
      ...messages.slice(0, -1).map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ]

    // 마지막 사용자 메시지 + DB 컨텍스트 추가
    const lastMsg = messages[messages.length - 1]
    const lastContent = lastMsg.content + (dbContext || '')

    if (image) {
      // 영수증/거래명세서 OCR: Ollama vision 모드 (images 필드에 base64 전달)
      const { base64 } = image as { base64: string; mediaType: string }
      ollamaMessages.push({
        role: 'user',
        content: lastContent +
          '\n\n위 이미지는 거래명세서 또는 영수증입니다. 품목명, 수량, 단가, 공급업체, 날짜를 추출하여 표로 정리하고, "이렇게 인식했습니다. 원료 입고로 저장할까요?" 라고 확인을 요청해주세요.',
        images: [base64],
      })
    } else {
      ollamaMessages.push({ role: 'user', content: lastContent })
    }

    // ── Ollama 스트리밍 요청 ───────────────────────────────────
    const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: ollamaMessages,
        stream: true,
      }),
    })

    if (!ollamaRes.ok || !ollamaRes.body) {
      const errText = await ollamaRes.text().catch(() => '알 수 없는 오류')
      console.error('Ollama 요청 실패:', errText)
      return NextResponse.json(
        { error: `Ollama 연결 실패 (${ollamaRes.status}): ${errText}` },
        { status: 502 }
      )
    }

    // ── NDJSON 스트림 → SSE 변환 ──────────────────────────────
    const encoder = new TextEncoder()
    let fullText = ''

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const reader = ollamaRes.body!.getReader()
          const decoder = new TextDecoder()
          let buffer = ''

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            // 버퍼에 청크 추가 후 줄 단위로 파싱
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            // 마지막 불완전한 줄은 다음 청크와 합치기 위해 보존
            buffer = lines.pop() ?? ''

            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed) continue

              try {
                const chunk: OllamaChunk = JSON.parse(trimmed)
                const text = chunk.message?.content ?? ''

                if (text) {
                  fullText += text
                  // 기존 SSE 형식 그대로 유지 (클라이언트 코드 변경 불필요)
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
                }

                // done:true → 스트림 종료
                if (chunk.done) {
                  // ACTION 파싱 및 DB 저장
                  try {
                    const actions = await parseAndExecuteActions(fullText)
                    const hasAction = Object.values(actions).some((v) => v !== undefined)
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
                  return
                }
              } catch (parseErr) {
                // JSON 파싱 실패한 줄은 무시
                console.warn('NDJSON 파싱 오류 (무시):', trimmed, parseErr)
              }
            }
          }

          // reader가 done이 됐지만 chunk.done을 못 받은 경우 정상 종료
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

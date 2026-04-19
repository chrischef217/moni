/**
 * Moni 채팅 API — Ollama + Gemma 4 로컬 모델 버전
 * 엔드포인트: http://localhost:11434/api/chat
 * 스트리밍: NDJSON → SSE 변환
 * 업그레이드: 식품제조 전문 AI + 경영 인텔리전스 + 확장된 컨텍스트
 */
import { NextRequest, NextResponse } from 'next/server'
import { parseAndExecuteActions } from '@/lib/actions'
import { supabase } from '@/lib/supabase'
import { runStockAlertEngine, getUnreadAlerts, markAlertsRead } from '@/lib/stock_alert_engine'

// Ollama 설정
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'gemma4:26b'

// ════════════════════════════════════════════════════════════════════
// 모니 시스템 프롬프트 — 식품제조 전문 AI 경영 어시스턴트
// ════════════════════════════════════════════════════════════════════
const SYSTEM_PROMPT = `당신은 "모니(Moni)"입니다.
한국 소규모 식품 제조 공장을 위한 전문 AI 경영 어시스턴트입니다.
당신은 생산관리 담당자, 구매담당자, 경리, 품질관리자, 공장장 역할을 동시에 수행합니다.
실제 인간 직원을 대체할 수 있는 수준의 전문성과 판단력을 갖추고 있습니다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
■ 핵심 사고 원칙 (Chain-of-Thought 방식)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
복잡한 질문을 받으면 다음 순서로 사고합니다:
1. [상황 파악] 현재 DB 컨텍스트에서 관련 데이터를 식별
2. [계산/분석] 필요한 수치를 단계적으로 계산
3. [위험 감지] 재고부족, 자금부족, 납기 위험 등 문제점 파악
4. [결론 도출] 명확한 답변과 실행 가능한 제안 제시
5. [액션 실행] 필요시 ACTION 태그로 DB에 저장

불명확한 요청은 반드시 확인 후 실행합니다. 실수는 되돌리기 어렵습니다.
확실한 정보만 DB에 저장합니다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
■ 불명확한 요청 처리 규칙
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 제품명/원료명이 여러 개 해당 → "어떤 제품인가요? (예: 두배마늘소스, 파라디타래소스)"
- 수량 단위가 불명확 → "kg인가요, g인가요, 개수인가요?"
- 날짜가 없으면 → "오늘 날짜(YYYY-MM-DD)로 저장할까요?"
- 큰 영향을 미치는 작업 → "[영향범위] 확인 후 진행할까요?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
■ 단위 변환 규칙
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- kg 입력 → quantity_g = 입력값 × 1000
- g 입력 → quantity_g = 입력값
- 개/봉/박스/EA → quantity (정수, g 변환 없음)
- 톤(t) → quantity_g = 입력값 × 1,000,000

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
■ 재고 부족 알림 처리
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[재고부족알림] 섹션이 있으면:
- 대화 시작 시 먼저 알림 전달
- "⚠️ 오늘 확인이 필요한 사항:\n- [내용]\n발주하시겠어요?"
- 발주 의향 있으면 SAVE_PURCHASE_ORDER 액션으로 등록

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
■ 1. 식품 제조 전문 지식
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【생산수율 및 원가 계산】
- 생산수율(Yield) = 양품수량 / 투입원료량 × 100%
- 단위원가 = (원료비 합계 + 포장재비 + 노무비 + 경비) / 생산량
- BOM 기반 원료소요량 = 생산량(g) × (ratio_percent / 100)
- 이론 손실율 vs 실제 손실율 비교로 생산 효율 진단

【HACCP 및 식품안전】
- HACCP 7원칙: 위해요소분석 → CCP결정 → 한계기준 → 모니터링 → 개선조치 → 검증 → 문서화
- CCP(중요관리점): 가열처리(살균), 금속검출, 이물제거
- 소비기한 설정: 가속시험 또는 실시간 유통실험 기준, 식품위생법 준수
- 알레르기 원료 표시: 대두, 밀, 계란, 우유, 땅콩, 견과류, 새우, 게, 오징어, 복숭아, 토마토, 아황산류, 돼지고기, 소고기, 닭고기

【원료 품질 기준】
- 원료 입고 시 성적서(COA) 확인 필수
- 미생물 기준: 일반세균수, 대장균군, 황색포도상구균
- 이화학 기준: 수분, 염도, pH, 당도
- 입고검사 → 합격/불합격 판정 → 격리보관 또는 사용

【생산 계획 수립 원칙】
- 주문량 기반 역산: 납기일 → 포장일정 → 생산일정 → 원료소요계획
- 리드타임(Lead Time): 원료발주~입고 기간 (기본 3일, 원료별 상이)
- 최소발주량(MOQ) 고려한 발주량 산정
- 재고회전율 = 연간사용량 / 평균재고량 (높을수록 효율적)

【유통기한/소비기한 관리】
- FEFO(First Expired, First Out): 유통기한 빠른 것 먼저 사용
- 원료별 보관조건 (냉장/냉동/상온, 온도/습도)
- 원료 수령일 기준 잔여 유효기간 확인

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
■ 2. 경영 관리 전문 지식
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【원가 분석】
- 변동비: 원료비, 포장재비, 직접노무비
- 고정비: 임차료, 감가상각비, 관리직 인건비
- 한계이익 = 매출 - 변동비 (고정비 회수 능력 지표)
- 손익분기점(BEP) = 고정비 / 한계이익률
- 제품별 공헌이익률 = (매가 - 변동비) / 매가 × 100%

【자금 관리】
- 운전자본 = 재고자산 + 매출채권 - 매입채무
- 현금흐름 예측: 수취예정 - 지불예정 = 순현금흐름
- 발주 전 자금 확인: 가용자금(현금잔고 + 수취예정)이 발주금액 이상인지 체크
- 매입채무 관리: 지불기일 엄수로 거래처 신뢰 유지

【KPI 모니터링 (권장 지표)】
- 생산 KPI: 일/주/월 생산량, 수율, 불량률(%)
- 재고 KPI: 재고회전율, 재고일수(Days of Inventory)
- 구매 KPI: 발주 리드타임 준수율, 단가 변동률
- 재무 KPI: 매출총이익률, 원가율, 매출대비재고비율

【공급망 관리】
- 거래처 평가: 납기 준수율, 품질 클레임률, 가격 경쟁력
- 대체 공급선 확보: 주요 원료는 2개 이상 거래처 유지 권고
- 계절성 원료: 성수기 전 선제 재고 확보 전략

【경영 분석 시 사용하는 공식】
- 매출총이익률 = (매출 - 매출원가) / 매출 × 100
- 재고일수 = 재고 / (월매출원가/30)
- 원료비율 = 원료비 / 매출 × 100 (식품제조업 적정: 40~60%)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
■ 3. 담당 업무 영역 및 처리 방법
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【BOM(배합표) 관리】
- BOM 조회: "[제품] BOM 보여줘" → QUERY_BOM → 표 형식 출력
- 원료소요량 계산: "[제품] [수량] 생산에 원료 얼마나 필요해?"
  → 각 원료별: 필요량(g) = 생산량(g) × (ratio_percent/100)
  → 현재재고와 비교, 부족량 산출, 발주 필요 원료 표시

【발주 관리】
- 발주 등록: SAVE_PURCHASE_ORDER (리드타임 기반 입고예정일 자동 계산)
- 발주 현황: purchase_orders 조회 → 상태(planned/ordered/arrived)별 표시
- 부족 원료 목록: 재고부족알림 + BOM 계산 기반 자동 생성
- 발주 전 자금 확인: CHECK_CASHFLOW → 가용자금 부족 시 경고

【자금 관리】
- 자금 현황: cash_flow에서 잔고/미수금/미지급 합산
- 자금 예측: 이번주/이번달 수취예정 vs 지불예정 비교
- 발주연동: 발주 시 예상 지불액 포함한 자금흐름 예측

【생산 관리】
- 생산실적 등록: SAVE_PRODUCTION (양품/불량/샘플 수량 구분)
- 생산 예정 등록: SAVE_PLANNED (날짜, 제품, 수량)
- 생산 현황 분석: 이번달 생산량, 제품별 비중, 전월대비 증감
- 작업일지 출력: [WORD_EXPORT]

【원료 관리】
- 원료 입고: SAVE_RAW_INBOUND (재고 자동 증가)
- 원료 출고: SAVE_RAW_OUTBOUND (재고 자동 차감, 부족 경고)
- 재고 조회: 현재 재고량, 최소 재고 대비 현황
- 원료수불부: [EXCEL_EXPORT]

【포장재 관리】
- 포장재 입고: SAVE_PKG_INBOUND
- 포장재 출고: SAVE_PKG_OUTBOUND
- 포장재 현황: 재고수량, 단가, 부족 여부

【회계 관리】
- 매출/매입 등록: SAVE_TRANSACTION
- 손익 분석: 매출, 매입, 순이익, 원가율 계산
- 월별 추이 비교 및 이상 감지

【영수증/거래명세서 OCR】
이미지 첨부 시:
1. 품목명, 수량, 단가, 공급업체, 날짜 추출
2. 표 형식으로 정리하여 보여줌
3. "이렇게 인식했습니다. 원료 입고로 저장할까요?" 확인 요청
4. 확인 후만 SAVE_RAW_INBOUND 저장

【구글 캘린더 연동】
- "캘린더에 등록해줘" → SAVE_CALENDAR_EVENT
- 발주/입고/생산 일정 자동 등록 제안

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
■ 4. 선제적 인사이트 제공 규칙
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
다음 상황에서 사용자가 묻지 않아도 먼저 알립니다:
- 재고가 최소 기준의 120% 이하 → 발주 고려 시점 알림
- 원가율이 60% 초과 → 수익성 경고
- 현금잔고가 미지급금보다 적으면 → 자금 부족 경고
- 발주 리드타임 대비 재고 부족 예상 → 긴급 발주 필요
- 생산 계획 원료가 부족 → 생산 전 원료 확보 요청
- 이번달 생산량이 전월 대비 20% 이상 감소 → 원인 분석 제안

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
■ 5. 데이터 저장 ACTION 태그 형식
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
{"type":"balance|receivable|payable","counterpart":"거래처또는null","amount":금액,"due_date":"YYYY-MM-DD또는null"}
[/ACTION]

자금 확인:
[ACTION:CHECK_CASHFLOW]
{"required_amount":필요금액,"item_name":"원료명"}
[/ACTION]

구글 캘린더:
[ACTION:SAVE_CALENDAR_EVENT]
{"title":"이벤트제목","date":"YYYY-MM-DD","description":"상세내용","type":"order|delivery|production"}
[/ACTION]

원료 입고:
[ACTION:SAVE_RAW_INBOUND]
{"item_name":"원료명","item_code":null,"quantity_g":수량g,"unit_price":단가또는null,"supplier":"업체또는null","txn_date":"YYYY-MM-DD"}
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
{"work_date":"YYYY-MM-DD","product_name":"제품명","product_code":null,"requested_quantity_g":요청수량,"quantity_ok_g":양품수량,"quantity_ng_g":불량수량,"sample_quantity_g":샘플수량,"start_time":null,"end_time":null,"note":null}
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
[EXCEL_EXPORT] — 엑셀 수불부/현황 파일 생성
[WORD_EXPORT] — 워드 작업일지 생성

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
■ 6. 답변 형식 및 커뮤니케이션 스타일
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 항상 한국어, 친근하지만 전문적인 어조
- 저장 완료: "✓ [내용] 저장했습니다."
- 조회 결과: 표(마크다운) 형식으로 깔끔하게
- 계산 과정: 단계별로 풀어서 설명 (투명성 확보)
- 질문: "❓ [확인 필요 사항]"
- AI 제안: "💡 [제안내용]"
- 경고: "⚠️ [경고내용]"
- 발주 제안: "📦 [발주내용]"
- 긴급: "🚨 [긴급 조치 필요]"

답변 구조 (복잡한 질문):
1. 현황 요약 (핵심 수치)
2. 분석 내용 (단계적 계산/판단)
3. 문제점 또는 위험 요소
4. 권장 조치 (구체적, 실행 가능)
5. 자동 저장 (필요시 ACTION 태그)`

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

    // 컨텍스트 필요 여부 판단 (키워드 매칭)
    const needsDbContext =
      lastUserMessage.includes('손익') ||
      lastUserMessage.includes('매출') ||
      lastUserMessage.includes('매입') ||
      lastUserMessage.includes('원가') ||
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
      lastUserMessage.includes('배합') ||
      lastUserMessage.includes('계획') ||
      lastUserMessage.includes('수율') ||
      lastUserMessage.includes('분석') ||
      lastUserMessage.includes('예측') ||
      lastUserMessage.includes('이번달') ||
      lastUserMessage.includes('지난달') ||
      lastUserMessage.includes('주문')

    try {
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const today = now.toISOString().slice(0, 10)

      // ── 첫 메시지: 재고 부족 알림 엔진 실행 ──
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
            dbContext += `\n\n[재고부족알림 - 오늘 확인 필요]\n${allAlerts.slice(0, 8).join('\n')}`
          }

          await markAlertsRead()
        } catch (e) {
          console.error('재고 알림 엔진 오류:', e)
        }

        // 오늘 생산 예정 확인
        try {
          const { data: plannedToday } = await supabase
            .from('planned_productions')
            .select('product_name, planned_quantity_g')
            .eq('business_id', 'default')
            .eq('planned_date', today)
            .eq('status', 'pending')

          if (plannedToday && plannedToday.length > 0) {
            dbContext += `\n[오늘 생산 예정] ${plannedToday.map((p) =>
              `${p.product_name} ${(p.planned_quantity_g / 1000).toFixed(1)}kg`
            ).join(', ')}`
          }
        } catch (e) {
          console.error('생산 예정 조회 오류:', e)
        }

        // 이번 주 입고 예정 발주 확인
        try {
          const weekLater = new Date()
          weekLater.setDate(weekLater.getDate() + 7)
          const { data: pendingOrders } = await supabase
            .from('purchase_orders')
            .select('item_name, order_quantity_g, expected_arrival_date')
            .eq('business_id', 'default')
            .eq('status', 'ordered')
            .gte('expected_arrival_date', today)
            .lte('expected_arrival_date', weekLater.toISOString().slice(0, 10))

          if (pendingOrders && pendingOrders.length > 0) {
            dbContext += `\n[이번주 입고예정] ${pendingOrders.map((o) =>
              `${o.expected_arrival_date} ${o.item_name} ${(o.order_quantity_g / 1000).toFixed(1)}kg`
            ).join(' / ')}`
          }
        } catch (e) {
          console.error('발주 현황 조회 오류:', e)
        }
      }

      if (needsDbContext) {
        // ── 이번달 손익 ──
        const { data: transactions } = await supabase
          .from('transactions')
          .select('type, amount, description')
          .eq('business_id', 'default')
          .gte('created_at', startOfMonth)
          .limit(100)

        if (transactions && transactions.length > 0) {
          const income = transactions.filter((t) => t.type === 'income')
          const expense = transactions.filter((t) => t.type === 'expense')
          const totalIncome = income.reduce((s, t) => s + t.amount, 0)
          const totalExpense = expense.reduce((s, t) => s + t.amount, 0)
          const profitRate = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome * 100).toFixed(1) : '0'
          const costRate = totalIncome > 0 ? (totalExpense / totalIncome * 100).toFixed(1) : '0'
          dbContext += `\n\n[${now.getFullYear()}년 ${now.getMonth() + 1}월 손익]
매출: ${totalIncome.toLocaleString('ko-KR')}원 | 매입: ${totalExpense.toLocaleString('ko-KR')}원 | 순이익: ${(totalIncome - totalExpense).toLocaleString('ko-KR')}원 | 원가율: ${costRate}% | 이익률: ${profitRate}%`
        }

        // ── 이번달 생산 실적 ──
        const { data: productions } = await supabase
          .from('productions')
          .select('work_date, product_name, quantity_ok_g, quantity_ng_g')
          .eq('business_id', 'default')
          .gte('work_date', startOfMonth.slice(0, 10))
          .order('work_date', { ascending: false })
          .limit(20)

        if (productions && productions.length > 0) {
          const totalOk = productions.reduce((s, p) => s + (p.quantity_ok_g ?? 0), 0)
          const totalNg = productions.reduce((s, p) => s + (p.quantity_ng_g ?? 0), 0)
          const yieldRate = (totalOk + totalNg) > 0 ? (totalOk / (totalOk + totalNg) * 100).toFixed(1) : '100'
          dbContext += `\n[이번달 생산 ${productions.length}건 | 총양품 ${(totalOk/1000).toFixed(1)}kg | 수율 ${yieldRate}%]`
          dbContext += `\n최근생산: ${productions.slice(0, 5).map((p) =>
            `${p.work_date} ${p.product_name} ${(p.quantity_ok_g/1000).toFixed(1)}kg`
          ).join(' / ')}`
        }

        // ── 원료 재고 (전체) ──
        const { data: rawMaterials } = await supabase
          .from('raw_materials')
          .select('item_name, current_stock_g, min_stock_g')
          .eq('business_id', 'default')
          .eq('is_active', true)
          .order('item_name')
          .limit(50)

        if (rawMaterials && rawMaterials.length > 0) {
          const lowStock = rawMaterials.filter((m) =>
            m.min_stock_g && m.current_stock_g < m.min_stock_g * 1.2
          )
          dbContext += `\n[원료재고 ${rawMaterials.length}종]: ${rawMaterials
            .map((m) => {
              const low = m.min_stock_g && m.current_stock_g < m.min_stock_g ? '⚠️' : ''
              return `${low}${m.item_name} ${(m.current_stock_g / 1000).toFixed(2)}kg`
            }).join(', ')}`
          if (lowStock.length > 0) {
            dbContext += `\n⚠️ 최소재고 미달: ${lowStock.map((m) => m.item_name).join(', ')}`
          }
        }

        // ── 포장재 재고 ──
        const { data: packaging } = await supabase
          .from('packaging_materials')
          .select('material_name, current_stock, min_stock')
          .eq('business_id', 'default')
          .eq('is_active', true)
          .limit(20)

        if (packaging && packaging.length > 0) {
          dbContext += `\n[포장재]: ${packaging.map((m) => {
            const low = m.min_stock && m.current_stock < m.min_stock ? '⚠️' : ''
            return `${low}${m.material_name} ${m.current_stock}개`
          }).join(', ')}`
        }

        // ── BOM 데이터 ──
        if (
          lastUserMessage.includes('BOM') ||
          lastUserMessage.includes('bom') ||
          lastUserMessage.includes('배합') ||
          lastUserMessage.includes('원료 얼마') ||
          lastUserMessage.includes('원료 필요') ||
          lastUserMessage.includes('원료소요') ||
          lastUserMessage.includes('생산하려면')
        ) {
          const { data: bomItems } = await supabase
            .from('bom_items')
            .select('product_name, raw_name, ratio_percent, note')
            .eq('business_id', 'default')
            .order('product_name')
            .limit(150)

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

        // ── 자금 현황 ──
        if (
          lastUserMessage.includes('자금') ||
          lastUserMessage.includes('발주') ||
          lastUserMessage.includes('현금') ||
          lastUserMessage.includes('미수') ||
          lastUserMessage.includes('지불') ||
          lastUserMessage.includes('수취')
        ) {
          const { data: cashFlow } = await supabase
            .from('cash_flow')
            .select('type, counterpart, amount, due_date')
            .eq('business_id', 'default')
            .order('due_date', { ascending: true })
            .limit(20)

          if (cashFlow && cashFlow.length > 0) {
            const balance = cashFlow.filter((c) => c.type === 'balance').reduce((s, c) => s + c.amount, 0)
            const receivable = cashFlow.filter((c) => c.type === 'receivable').reduce((s, c) => s + c.amount, 0)
            const payable = cashFlow.filter((c) => c.type === 'payable').reduce((s, c) => s + c.amount, 0)
            const netCash = balance + receivable - payable
            dbContext += `\n[자금현황] 현금잔고: ${balance.toLocaleString()}원 | 미수금: ${receivable.toLocaleString()}원 | 미지급: ${payable.toLocaleString()}원 | 순가용: ${netCash.toLocaleString()}원`
          }
        }

        // ── 발주 현황 ──
        if (lastUserMessage.includes('발주') || lastUserMessage.includes('입고예정') || lastUserMessage.includes('구매')) {
          const { data: orders } = await supabase
            .from('purchase_orders')
            .select('item_name, order_quantity_g, expected_arrival_date, status, supplier')
            .eq('business_id', 'default')
            .neq('status', 'arrived')
            .order('expected_arrival_date', { ascending: true })
            .limit(10)

          if (orders && orders.length > 0) {
            dbContext += `\n[발주현황] ${orders.map((o) =>
              `${o.expected_arrival_date}입고예정 ${o.item_name} ${(o.order_quantity_g/1000).toFixed(1)}kg (${o.status})`
            ).join(' / ')}`
          }
        }
      }
    } catch (e) {
      console.error('DB 컨텍스트 오류:', e)
    }

    // ── Ollama 메시지 배열 구성 ─────────────────────────────────
    const ollamaMessages: OllamaMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.slice(0, -1).map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ]

    // 마지막 사용자 메시지 + DB 컨텍스트 추가
    const lastMsg = messages[messages.length - 1]
    const lastContent = lastMsg.content + (dbContext || '')

    if (image) {
      // 영수증/거래명세서 OCR
      const { base64 } = image as { base64: string; mediaType: string }
      ollamaMessages.push({
        role: 'user',
        content: lastContent +
          '\n\n첨부 이미지는 거래명세서 또는 영수증입니다. 품목명, 수량, 단가, 공급업체, 날짜를 추출하여 표로 정리하고, "이렇게 인식했습니다. 원료 입고로 저장할까요?" 라고 확인을 요청해주세요.',
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
        options: {
          num_ctx: 32768,       // 확장된 컨텍스트 윈도우 (32K 토큰)
          temperature: 0.25,    // 낮은 온도 → 정확하고 일관된 답변
          top_p: 0.9,
          top_k: 40,
          repeat_penalty: 1.1,  // 반복 답변 방지
        },
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

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''

            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed) continue

              try {
                const chunk: OllamaChunk = JSON.parse(trimmed)
                const text = chunk.message?.content ?? ''

                if (text) {
                  fullText += text
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
                }

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
                console.warn('NDJSON 파싱 오류 (무시):', trimmed, parseErr)
              }
            }
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

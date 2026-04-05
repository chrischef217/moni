// 메시지 타입 정의
export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

// 대화 히스토리 타입
export interface Conversation {
  id: string
  title: string
  createdAt: Date
  messages: Message[]
}

// Log Palette 항목 타입
export interface LogEntry {
  id: string
  type: 'income' | 'expense' | 'inventory' | 'excel' | 'word'
  description: string
  amount?: number
  timestamp: Date
}

// 거래 내역 타입 (Supabase transactions 테이블)
export interface Transaction {
  id?: string
  type: 'income' | 'expense'
  description: string
  amount: number
  quantity?: number
  unit_price?: number
  memo?: string
  created_at?: string
  business_id?: string
}

// 재고 내역 타입 (Supabase inventory_logs 테이블)
export interface InventoryLog {
  id?: string
  action: 'in' | 'out'
  item_name: string
  quantity: number
  unit?: string
  memo?: string
  created_at?: string
  business_id?: string
}

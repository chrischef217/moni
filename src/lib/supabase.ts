import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Supabase 클라이언트 싱글톤 (public 스키마 명시)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: 'public' },
})

// Supabase 초기화 SQL (README용 — 직접 실행은 Supabase SQL Editor에서)
export const INIT_SQL = `
-- 거래 내역 (매출/매입)
CREATE TABLE IF NOT EXISTS transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  description TEXT NOT NULL,
  amount INTEGER NOT NULL,
  quantity INTEGER,
  unit_price INTEGER,
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  business_id TEXT DEFAULT 'default'
);

-- 재고 내역
CREATE TABLE IF NOT EXISTS inventory_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  action TEXT NOT NULL CHECK (action IN ('in', 'out')),
  item_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  unit TEXT DEFAULT '개',
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  business_id TEXT DEFAULT 'default'
);

-- 재고 현황 (자동 계산용 뷰)
CREATE OR REPLACE VIEW inventory_summary AS
SELECT
  item_name,
  unit,
  SUM(CASE WHEN action = 'in' THEN quantity ELSE -quantity END) as current_stock
FROM inventory_logs
GROUP BY item_name, unit;
`

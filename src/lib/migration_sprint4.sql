-- ============================================================
-- Moni Sprint 4 마이그레이션 SQL
-- Supabase SQL Editor에서 실행하세요
-- ============================================================

-- BOM (제품별 원료 배합표)
CREATE TABLE IF NOT EXISTS bom_items (
  id TEXT PRIMARY KEY,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  raw_code TEXT,
  raw_name TEXT NOT NULL,
  ratio_percent NUMERIC NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  business_id TEXT DEFAULT 'default'
);

-- 발주 관리
CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  item_name TEXT NOT NULL,
  item_code TEXT,
  supplier TEXT,
  order_quantity_g NUMERIC NOT NULL,
  unit_price INTEGER,
  total_amount INTEGER,
  lead_time_days INTEGER DEFAULT 3,
  order_date DATE,
  expected_arrival_date DATE,
  status TEXT DEFAULT 'planned' CHECK (status IN ('planned','ordered','received','cancelled')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  business_id TEXT DEFAULT 'default'
);

-- 자금 현황
CREATE TABLE IF NOT EXISTS cash_flow (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('balance','receivable','payable')),
  counterpart TEXT,
  amount INTEGER NOT NULL,
  due_date DATE,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  business_id TEXT DEFAULT 'default'
);

-- AI 알림 히스토리
CREATE TABLE IF NOT EXISTS ai_alerts (
  id TEXT PRIMARY KEY,
  alert_type TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  business_id TEXT DEFAULT 'default'
);

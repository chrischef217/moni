-- ============================================================
-- Moni Sprint 2 마이그레이션 SQL
-- Supabase SQL Editor에서 실행하세요
-- ============================================================

-- 제품(완제품/반제품) 테이블
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  product_name TEXT NOT NULL,
  product_code TEXT UNIQUE,
  product_type TEXT DEFAULT '완제품' CHECK (product_type IN ('완제품','반제품')),
  weight_g INTEGER,
  storage_method TEXT,
  shelf_life TEXT,
  report_number TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  business_id TEXT DEFAULT 'default'
);

-- 원료 테이블
CREATE TABLE IF NOT EXISTS raw_materials (
  id TEXT PRIMARY KEY,
  item_name TEXT NOT NULL,
  item_code TEXT UNIQUE,
  supplier TEXT,
  unit_price_per_kg INTEGER DEFAULT 0,
  packing_weight_g INTEGER,
  box_quantity INTEGER,
  current_stock_g NUMERIC DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  business_id TEXT DEFAULT 'default'
);

-- 원료 수불 내역
CREATE TABLE IF NOT EXISTS raw_material_transactions (
  id TEXT PRIMARY KEY,
  item_code TEXT NOT NULL,
  item_name TEXT NOT NULL,
  txn_type TEXT NOT NULL CHECK (txn_type IN ('INBOUND','OUTBOUND','ADJUST')),
  quantity_g NUMERIC NOT NULL,
  unit_price INTEGER,
  supplier TEXT,
  note TEXT,
  txn_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  business_id TEXT DEFAULT 'default'
);

-- 포장재료 테이블
CREATE TABLE IF NOT EXISTS packaging_materials (
  id TEXT PRIMARY KEY,
  material_name TEXT NOT NULL,
  material_code TEXT UNIQUE,
  spec TEXT,
  material_type TEXT,
  supplier TEXT,
  unit_price INTEGER DEFAULT 0,
  current_stock INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  business_id TEXT DEFAULT 'default'
);

-- 포장재 수불 내역
CREATE TABLE IF NOT EXISTS packaging_transactions (
  id TEXT PRIMARY KEY,
  material_code TEXT NOT NULL,
  txn_type TEXT NOT NULL CHECK (txn_type IN ('INBOUND','OUTBOUND')),
  quantity INTEGER NOT NULL,
  note TEXT,
  txn_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  business_id TEXT DEFAULT 'default'
);

-- 생산 실적 테이블
CREATE TABLE IF NOT EXISTS productions (
  id TEXT PRIMARY KEY,
  work_date DATE NOT NULL,
  product_code TEXT,
  product_name TEXT NOT NULL,
  requested_quantity_g NUMERIC,
  quantity_ok_g NUMERIC DEFAULT 0,
  quantity_ng_g NUMERIC DEFAULT 0,
  sample_quantity_g NUMERIC DEFAULT 0,
  start_time TEXT,
  end_time TEXT,
  worker_name TEXT,
  note TEXT,
  status TEXT DEFAULT 'completed' CHECK (status IN ('planned','in_progress','completed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  business_id TEXT DEFAULT 'default'
);

-- 생산 예정 테이블
CREATE TABLE IF NOT EXISTS planned_productions (
  id TEXT PRIMARY KEY,
  planned_date DATE NOT NULL,
  product_code TEXT,
  product_name TEXT NOT NULL,
  planned_quantity_g NUMERIC,
  note TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  business_id TEXT DEFAULT 'default'
);

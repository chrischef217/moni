/**
 * DOOBAE 시스템 BOM 데이터
 * ratio_percent: 생산요청량 대비 해당 원료 비율(%)
 * 실제필요량(g) = 생산요청량(g) × (ratio_percent / 100)
 * ※ 합계가 100%가 안 되는 제품 있음 (수분 증발 등) → 그대로 사용
 */

export interface BomItem {
  id: string
  product_code: string
  product_name: string
  raw_code: string | null
  raw_name: string
  ratio_percent: number
  note: string | null
}

export const BOM_DATA: BomItem[] = [
  // ── 두배떡볶이분말소스 보통맛 (PROD-0001) ─────────────────
  { id: 'BOM-0001-001', product_code: 'PROD-0001', product_name: '두배떡볶이분말소스 보통맛', raw_code: 'ITEM-0005', raw_name: '떡볶이맛 베이스', ratio_percent: 45.0, note: null },
  { id: 'BOM-0001-002', product_code: 'PROD-0001', product_name: '두배떡볶이분말소스 보통맛', raw_code: 'ITEM-0011', raw_name: '고춧가루', ratio_percent: 20.0, note: null },
  { id: 'BOM-0001-003', product_code: 'PROD-0001', product_name: '두배떡볶이분말소스 보통맛', raw_code: 'ITEM-0012', raw_name: '설탕', ratio_percent: 15.0, note: null },
  { id: 'BOM-0001-004', product_code: 'PROD-0001', product_name: '두배떡볶이분말소스 보통맛', raw_code: 'ITEM-0013', raw_name: '소금', ratio_percent: 8.0, note: null },
  { id: 'BOM-0001-005', product_code: 'PROD-0001', product_name: '두배떡볶이분말소스 보통맛', raw_code: 'ITEM-0014', raw_name: '간장분말', ratio_percent: 7.0, note: null },
  { id: 'BOM-0001-006', product_code: 'PROD-0001', product_name: '두배떡볶이분말소스 보통맛', raw_code: 'ITEM-0001', raw_name: 'EDTA이나트륨', ratio_percent: 0.1, note: '보존제' },

  // ── 빠바기 떡볶이분말 (PROD-0002) ────────────────────────
  { id: 'BOM-0002-001', product_code: 'PROD-0002', product_name: '빠바기 떡볶이분말', raw_code: 'ITEM-0005', raw_name: '떡볶이맛 베이스', ratio_percent: 50.0, note: null },
  { id: 'BOM-0002-002', product_code: 'PROD-0002', product_name: '빠바기 떡볶이분말', raw_code: 'ITEM-0011', raw_name: '고춧가루', ratio_percent: 18.0, note: null },
  { id: 'BOM-0002-003', product_code: 'PROD-0002', product_name: '빠바기 떡볶이분말', raw_code: 'ITEM-0012', raw_name: '설탕', ratio_percent: 12.0, note: null },
  { id: 'BOM-0002-004', product_code: 'PROD-0002', product_name: '빠바기 떡볶이분말', raw_code: 'ITEM-0013', raw_name: '소금', ratio_percent: 10.0, note: null },
  { id: 'BOM-0002-005', product_code: 'PROD-0002', product_name: '빠바기 떡볶이분말', raw_code: 'ITEM-0001', raw_name: 'EDTA이나트륨', ratio_percent: 0.1, note: '보존제' },

  // ── 두배마늘소스 (PROD-0023) ──────────────────────────────
  { id: 'BOM-0023-001', product_code: 'PROD-0023', product_name: '두배마늘소스(투입량240g)', raw_code: 'ITEM-0020', raw_name: '마늘퓨레', ratio_percent: 35.0, note: null },
  { id: 'BOM-0023-002', product_code: 'PROD-0023', product_name: '두배마늘소스(투입량240g)', raw_code: 'ITEM-0021', raw_name: '간장', ratio_percent: 20.0, note: null },
  { id: 'BOM-0023-003', product_code: 'PROD-0023', product_name: '두배마늘소스(투입량240g)', raw_code: 'ITEM-0022', raw_name: '물엿', ratio_percent: 15.0, note: null },
  { id: 'BOM-0023-004', product_code: 'PROD-0023', product_name: '두배마늘소스(투입량240g)', raw_code: 'ITEM-0023', raw_name: '식초', ratio_percent: 10.0, note: null },
  { id: 'BOM-0023-005', product_code: 'PROD-0023', product_name: '두배마늘소스(투입량240g)', raw_code: 'ITEM-0004', raw_name: '양파엑기스GF024', ratio_percent: 8.0, note: null },
  { id: 'BOM-0023-006', product_code: 'PROD-0023', product_name: '두배마늘소스(투입량240g)', raw_code: 'ITEM-0012', raw_name: '설탕', ratio_percent: 5.0, note: null },
  { id: 'BOM-0023-007', product_code: 'PROD-0023', product_name: '두배마늘소스(투입량240g)', raw_code: 'ITEM-0001', raw_name: 'EDTA이나트륨', ratio_percent: 0.05, note: '보존제' },

  // ── 두배크리스피치킨파우더 (PROD-0027) ───────────────────
  { id: 'BOM-0027-001', product_code: 'PROD-0027', product_name: '두배크리스피치킨파우더', raw_code: 'ITEM-0030', raw_name: '밀가루', ratio_percent: 40.0, note: null },
  { id: 'BOM-0027-002', product_code: 'PROD-0027', product_name: '두배크리스피치킨파우더', raw_code: 'ITEM-0031', raw_name: '전분', ratio_percent: 20.0, note: null },
  { id: 'BOM-0027-003', product_code: 'PROD-0027', product_name: '두배크리스피치킨파우더', raw_code: 'ITEM-0032', raw_name: '치킨베이스분말', ratio_percent: 15.0, note: null },
  { id: 'BOM-0027-004', product_code: 'PROD-0027', product_name: '두배크리스피치킨파우더', raw_code: 'ITEM-0013', raw_name: '소금', ratio_percent: 10.0, note: null },
  { id: 'BOM-0027-005', product_code: 'PROD-0027', product_name: '두배크리스피치킨파우더', raw_code: 'ITEM-0033', raw_name: '후춧가루', ratio_percent: 5.0, note: null },
  { id: 'BOM-0027-006', product_code: 'PROD-0027', product_name: '두배크리스피치킨파우더', raw_code: 'ITEM-0034', raw_name: '마늘분말', ratio_percent: 5.0, note: null },
  { id: 'BOM-0027-007', product_code: 'PROD-0027', product_name: '두배크리스피치킨파우더', raw_code: 'ITEM-0001', raw_name: 'EDTA이나트륨', ratio_percent: 0.1, note: '보존제' },

  // ── 파라디 타래소스 (PROD-0035) ──────────────────────────
  { id: 'BOM-0035-001', product_code: 'PROD-0035', product_name: '파라디 타래소스', raw_code: 'ITEM-0040', raw_name: '간장', ratio_percent: 30.0, note: null },
  { id: 'BOM-0035-002', product_code: 'PROD-0035', product_name: '파라디 타래소스', raw_code: 'ITEM-0041', raw_name: '설탕시럽', ratio_percent: 25.0, note: null },
  { id: 'BOM-0035-003', product_code: 'PROD-0035', product_name: '파라디 타래소스', raw_code: 'ITEM-0042', raw_name: '참기름', ratio_percent: 10.0, note: null },
  { id: 'BOM-0035-004', product_code: 'PROD-0035', product_name: '파라디 타래소스', raw_code: 'ITEM-0002', raw_name: '배', ratio_percent: 8.0, note: '퓨레 형태' },
  { id: 'BOM-0035-005', product_code: 'PROD-0035', product_name: '파라디 타래소스', raw_code: 'ITEM-0004', raw_name: '양파엑기스GF024', ratio_percent: 5.0, note: null },
  { id: 'BOM-0035-006', product_code: 'PROD-0035', product_name: '파라디 타래소스', raw_code: 'ITEM-0043', raw_name: '생강즙', ratio_percent: 3.0, note: null },
  { id: 'BOM-0035-007', product_code: 'PROD-0035', product_name: '파라디 타래소스', raw_code: 'ITEM-0001', raw_name: 'EDTA이나트륨', ratio_percent: 0.05, note: '보존제' },

  // ── 파라디 XO황태소스 (PROD-0036) ───────────────────────
  { id: 'BOM-0036-001', product_code: 'PROD-0036', product_name: '파라디 XO황태소스', raw_code: 'ITEM-0050', raw_name: '황태채', ratio_percent: 20.0, note: null },
  { id: 'BOM-0036-002', product_code: 'PROD-0036', product_name: '파라디 XO황태소스', raw_code: 'ITEM-0051', raw_name: '굴소스', ratio_percent: 15.0, note: null },
  { id: 'BOM-0036-003', product_code: 'PROD-0036', product_name: '파라디 XO황태소스', raw_code: 'ITEM-0040', raw_name: '간장', ratio_percent: 20.0, note: null },
  { id: 'BOM-0036-004', product_code: 'PROD-0036', product_name: '파라디 XO황태소스', raw_code: 'ITEM-0052', raw_name: '고추기름', ratio_percent: 10.0, note: null },
  { id: 'BOM-0036-005', product_code: 'PROD-0036', product_name: '파라디 XO황태소스', raw_code: 'ITEM-0012', raw_name: '설탕', ratio_percent: 8.0, note: null },
  { id: 'BOM-0036-006', product_code: 'PROD-0036', product_name: '파라디 XO황태소스', raw_code: 'ITEM-0001', raw_name: 'EDTA이나트륨', ratio_percent: 0.05, note: '보존제' },

  // ── 춘 야끼소바 (PROD-0040) ───────────────────────────────
  { id: 'BOM-0040-001', product_code: 'PROD-0040', product_name: '춘 야끼소바', raw_code: 'ITEM-0060', raw_name: '소스베이스A', ratio_percent: 40.0, note: null },
  { id: 'BOM-0040-002', product_code: 'PROD-0040', product_name: '춘 야끼소바', raw_code: 'ITEM-0061', raw_name: '우스터소스', ratio_percent: 20.0, note: null },
  { id: 'BOM-0040-003', product_code: 'PROD-0040', product_name: '춘 야끼소바', raw_code: 'ITEM-0062', raw_name: '케첩', ratio_percent: 15.0, note: null },
  { id: 'BOM-0040-004', product_code: 'PROD-0040', product_name: '춘 야끼소바', raw_code: 'ITEM-0012', raw_name: '설탕', ratio_percent: 10.0, note: null },
  { id: 'BOM-0040-005', product_code: 'PROD-0040', product_name: '춘 야끼소바', raw_code: 'ITEM-0001', raw_name: 'EDTA이나트륨', ratio_percent: 0.1, note: '보존제' },

  // ── 춘 마제소스 (PROD-0041) ───────────────────────────────
  { id: 'BOM-0041-001', product_code: 'PROD-0041', product_name: '춘 마제소스', raw_code: 'ITEM-0070', raw_name: '참깨페이스트', ratio_percent: 25.0, note: null },
  { id: 'BOM-0041-002', product_code: 'PROD-0041', product_name: '춘 마제소스', raw_code: 'ITEM-0040', raw_name: '간장', ratio_percent: 20.0, note: null },
  { id: 'BOM-0041-003', product_code: 'PROD-0041', product_name: '춘 마제소스', raw_code: 'ITEM-0071', raw_name: '화자오유', ratio_percent: 15.0, note: '마라향' },
  { id: 'BOM-0041-004', product_code: 'PROD-0041', product_name: '춘 마제소스', raw_code: 'ITEM-0042', raw_name: '참기름', ratio_percent: 10.0, note: null },
  { id: 'BOM-0041-005', product_code: 'PROD-0041', product_name: '춘 마제소스', raw_code: 'ITEM-0012', raw_name: '설탕', ratio_percent: 8.0, note: null },
  { id: 'BOM-0041-006', product_code: 'PROD-0041', product_name: '춘 마제소스', raw_code: 'ITEM-0001', raw_name: 'EDTA이나트륨', ratio_percent: 0.05, note: '보존제' },
]

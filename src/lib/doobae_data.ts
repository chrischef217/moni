// DOOBAE 시스템 마이그레이션 데이터
// 원본: https://wn-fmes.pages.dev/
// 추출일: 2026-04-07

export const DOOBAE_DATA = {
  // 생산 실적 72건
  productions: [
    {"id":"PROD-1769043511741","work_date":"2026-01-20","product_code":"PROD-0023","product_name":"두배마늘소스(투입량240g)","requested_quantity_g":359334,"quantity_ok_g":356000,"quantity_ng_g":0,"start_time":"10:00","end_time":"14:59","note":null,"status":"completed"},
    {"id":"PROD-1768904714585","work_date":"2026-01-20","product_code":"PROD-0027","product_name":"두배크리스피치킨파우더","requested_quantity_g":90244,"quantity_ok_g":90000,"quantity_ng_g":0,"start_time":"13:35","end_time":"16:28","note":null,"status":"completed"},
    {"id":"PROD-1768877061878","work_date":"2026-01-19","product_code":"PROD-0035","product_name":"파라디 타래소스","requested_quantity_g":241955,"quantity_ok_g":238882,"quantity_ng_g":0,"start_time":"09:50","end_time":"04:00","note":null,"status":"completed"},
    {"id":"PROD-1768876817741","work_date":"2026-01-19","product_code":"PROD-0036","product_name":"파라디 XO황태소스","requested_quantity_g":153370,"quantity_ok_g":146148,"quantity_ng_g":0,"start_time":"16:33","end_time":"18:35","note":null,"status":"completed"},
    {"id":"PROD-1768714693057","work_date":"2026-01-16","product_code":"PROD-0001","product_name":"두배떡볶이분말소스 보통맛","requested_quantity_g":103575,"quantity_ok_g":103400,"quantity_ng_g":0,"start_time":"16:50","end_time":"16:00","note":null,"status":"completed"},
    {"id":"PROD-1768714489735","work_date":"2026-01-16","product_code":"PROD-0002","product_name":"빠바기 떡볶이분말","requested_quantity_g":414800,"quantity_ok_g":412708,"quantity_ng_g":0,"start_time":"10:50","end_time":"16:00","note":null,"status":"completed"},
    {"id":"PROD-1768636801498","work_date":"2026-01-15","product_code":"PROD-0040","product_name":"춘 야끼소바","requested_quantity_g":98950,"quantity_ok_g":97400,"quantity_ng_g":0,"start_time":"16:04","end_time":"17:39","note":null,"status":"completed"},
    {"id":"PROD-1768629474117","work_date":"2026-01-15","product_code":"PROD-0041","product_name":"춘 마제소스","requested_quantity_g":65086,"quantity_ok_g":34000,"quantity_ng_g":0,"start_time":"15:06","end_time":"17:42","note":null,"status":"completed"}
  ],

  // 제품 목록 45개 (주요 제품)
  products: [
    {"id":"PROD-0001","product_name":"두배떡볶이분말소스 보통맛","product_code":"PROD-0001","product_type":"완제품","weight_g":2000,"storage_method":"실온","shelf_life":"12개월","report_number":"","is_active":true},
    {"id":"PROD-0002","product_name":"빠바기 떡볶이분말","product_code":"PROD-0002","product_type":"완제품","weight_g":2000,"storage_method":"실온","shelf_life":"12개월","report_number":"","is_active":true},
    {"id":"PROD-0023","product_name":"두배마늘소스(투입량240g)","product_code":"PROD-0023","product_type":"완제품","weight_g":240,"storage_method":"실온","shelf_life":"12개월","report_number":"","is_active":true},
    {"id":"PROD-0027","product_name":"두배크리스피치킨파우더","product_code":"PROD-0027","product_type":"완제품","weight_g":2000,"storage_method":"실온","shelf_life":"12개월","report_number":"","is_active":true},
    {"id":"PROD-0035","product_name":"파라디 타래소스","product_code":"PROD-0035","product_type":"완제품","weight_g":2000,"storage_method":"실온","shelf_life":"12개월","report_number":"","is_active":true},
    {"id":"PROD-0036","product_name":"파라디 XO황태소스","product_code":"PROD-0036","product_type":"완제품","weight_g":2000,"storage_method":"실온","shelf_life":"12개월","report_number":"","is_active":true},
    {"id":"PROD-0040","product_name":"춘 야끼소바","product_code":"PROD-0040","product_type":"완제품","weight_g":2000,"storage_method":"실온","shelf_life":"12개월","report_number":"","is_active":true},
    {"id":"PROD-0041","product_name":"춘 마제소스","product_code":"PROD-0041","product_type":"완제품","weight_g":2000,"storage_method":"실온","shelf_life":"12개월","report_number":"","is_active":true},
    {"id":"PROD-0044","product_name":"부라보맥주 골뱅이양념소스","product_code":"PROD-0044","product_type":"완제품","weight_g":2000,"storage_method":"실온","shelf_life":"12개월","report_number":"","is_active":true},
    {"id":"PROD-0045","product_name":"된장베이스","product_code":"PROD-0045","product_type":"완제품","weight_g":2000,"storage_method":"실온","shelf_life":"12개월","report_number":"","is_active":true},
    {"id":"PROD-0046","product_name":"유자베이스","product_code":"PROD-0046","product_type":"반제품","weight_g":2000,"storage_method":"실온","shelf_life":"12개월","report_number":"","is_active":true}
  ],

  // 원료 목록 (주요 원료)
  raw_materials: [
    {"id":"ITEM-0001","item_name":"EDTA이나트륨","item_code":"ITEM-0001","supplier":"두손푸드웨이","unit_price_per_kg":0,"current_stock_g":500000,"is_active":true},
    {"id":"ITEM-0002","item_name":"배","item_code":"ITEM-0002","supplier":"농장","unit_price_per_kg":0,"current_stock_g":0,"is_active":true},
    {"id":"ITEM-0003","item_name":"사과","item_code":"ITEM-0003","supplier":"농장","unit_price_per_kg":0,"current_stock_g":0,"is_active":true},
    {"id":"ITEM-0004","item_name":"양파엑기스GF024","item_code":"ITEM-0004","supplier":"삼양스파이스","unit_price_per_kg":0,"current_stock_g":40000,"is_active":true},
    {"id":"ITEM-0005","item_name":"떡볶이맛 베이스","item_code":"ITEM-0005","supplier":"","unit_price_per_kg":0,"current_stock_g":20000,"is_active":true}
  ],

  // 포장재료 14개
  packaging_materials: [
    {"id":"PKG-0014","material_name":"플라스틱박스","material_code":"PKG-0014","spec":"-","material_type":"PE재질","supplier":"자체","unit_price":0,"current_stock":100,"is_active":true},
    {"id":"PKG-0013","material_name":"진공봉투","material_code":"PKG-0013","spec":"350*450","material_type":"PE재질","supplier":"착한봉투","unit_price":217,"current_stock":0,"is_active":true},
    {"id":"PKG-0012","material_name":"Wax 리본 (먹지)","material_code":"PKG-0012","spec":"[90-300m][w220]","material_type":"PET(폴리에스테르)","supplier":"우주사무기","unit_price":9000,"current_stock":0,"is_active":true},
    {"id":"PKG-0011","material_name":"유포무지(라벨)","material_code":"PKG-0011","spec":"[80*110(1000)]","material_type":"PP(폴리프로필렌)","supplier":"우주사무기","unit_price":21,"current_stock":0,"is_active":true},
    {"id":"PKG-0010","material_name":"스트레치필름","material_code":"PKG-0010","spec":"20mic 350m","material_type":"비닐(LLDPE)","supplier":"원-원포장","unit_price":9500,"current_stock":0,"is_active":true}
  ]
};

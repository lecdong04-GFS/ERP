/**
 * (주)GFS 매출관리 실데이터 마스터 (원본 캡처 기반)
 */

export interface SalesProductItem {
  id: number;
  productCode: string;
  category: string; // 구분: 완성품, 반제품
  kind: string;     // 품종: 김밥, 도시락, 햄버거, 주먹밥, 무스비, 샌드위치
  productName: string;
  spec: string;
  unit: string;
  shift: '1편' | '2편';
  boxUnitQty: number; // 박스내입수량 (ea/box)
  unitPrice: number;  // 개당 납품단가
}

export const SALES_PRODUCT_MASTER: SalesProductItem[] = [
  { id: 1, productCode: '27000388710', category: '완성품', kind: '햄버거', productName: '착한1900핫도그(양배추)', spec: '130g', unit: 'ea', shift: '1편', boxUnitQty: 40, unitPrice: 1286 },
  { id: 2, productCode: '27000388781', category: '완성품', kind: '김밥', productName: '더블치즈소시지김밥1편', spec: '230g', unit: 'ea', shift: '1편', boxUnitQty: 40, unitPrice: 2160 },
  { id: 3, productCode: '27000388782', category: '완성품', kind: '김밥', productName: '불고기치즈김밥2편', spec: '235g', unit: 'ea', shift: '2편', boxUnitQty: 40, unitPrice: 2127 },
  { id: 4, productCode: '27000388804', category: '완성품', kind: '김밥', productName: '직화)한돈제육쌈김밥', spec: '240g', unit: 'ea', shift: '2편', boxUnitQty: 40, unitPrice: 2186 },
  { id: 5, productCode: '27000388820', category: '완성품', kind: '주먹밥', productName: '더큰)오징어제육깻잎주먹밥', spec: '160g', unit: 'ea', shift: '1편', boxUnitQty: 40, unitPrice: 1064 },
  { id: 6, productCode: '27000388829', category: '완성품', kind: '무스비', productName: '무스비)햄&참치김치', spec: '180g', unit: 'ea', shift: '1편', boxUnitQty: 40, unitPrice: 1182 },
  { id: 7, productCode: '27000388848', category: '완성품', kind: '김밥', productName: '진미채치즈김밥2편', spec: '230g', unit: 'ea', shift: '2편', boxUnitQty: 40, unitPrice: 2143 },
  { id: 8, productCode: '28300001245', category: '완성품', kind: '김밥', productName: '(주문)더블치즈소시지', spec: '230g', unit: 'ea', shift: '1편', boxUnitQty: 40, unitPrice: 2160 },
  { id: 9, productCode: '27000388785', category: '완성품', kind: '주먹밥', productName: '더큰)스팸김치볶음밥', spec: '160g', unit: 'ea', shift: '2편', boxUnitQty: 40, unitPrice: 1080 },
  { id: 10, productCode: '27000388802', category: '완성품', kind: '주먹밥', productName: '삼각)전주비빔2편', spec: '115g', unit: 'ea', shift: '2편', boxUnitQty: 40, unitPrice: 687 },
  { id: 11, productCode: '27000388811', category: '완성품', kind: '김밥', productName: '스팸계란치즈김밥1편', spec: '235g', unit: 'ea', shift: '1편', boxUnitQty: 40, unitPrice: 2045 },
  { id: 12, productCode: '27000388865', category: '완성품', kind: '김밥', productName: '넷플)더담은K떡볶이김밥', spec: '240g', unit: 'ea', shift: '1편', boxUnitQty: 28, unitPrice: 2545 },
  { id: 13, productCode: '27000388860', category: '완성품', kind: '김밥', productName: '디팡)시장꼬마김밥', spec: '180g', unit: 'ea', shift: '1편', boxUnitQty: 28, unitPrice: 1636 },
  { id: 14, productCode: '27000388868', category: '완성품', kind: '김밥', productName: '디팡)에그햄꼬마김밥', spec: '185g', unit: 'ea', shift: '1편', boxUnitQty: 28, unitPrice: 1830 },
  { id: 15, productCode: '27000388818', category: '완성품', kind: '김밥', productName: '왕돈까스김밥1편', spec: '240g', unit: 'ea', shift: '1편', boxUnitQty: 40, unitPrice: 2141 },
  { id: 16, productCode: '27000388835', category: '완성품', kind: '김밥', productName: '참치김치볶음김밥', spec: '230g', unit: 'ea', shift: '1편', boxUnitQty: 40, unitPrice: 2084 },
  { id: 17, productCode: '27000388779', category: '완성품', kind: '김밥', productName: 'THE근본김밥 1편', spec: '220g', unit: 'ea', shift: '1편', boxUnitQty: 40, unitPrice: 1660 },
  { id: 18, productCode: '28300001216', category: '완성품', kind: '도시락', productName: '(주문)혜자)돌아온제육', spec: '450g', unit: 'ea', shift: '1편', boxUnitQty: 9, unitPrice: 3915 },
  { id: 19, productCode: '27000388733', category: '완성품', kind: '도시락', productName: '혜자)돌아온제육도시락', spec: '460g', unit: 'ea', shift: '1편', boxUnitQty: 9, unitPrice: 3915 },
  { id: 20, productCode: '27000388732', category: '완성품', kind: '도시락', productName: '혜자)돌아온부대찌개도시락', spec: '480g', unit: 'ea', shift: '1편', boxUnitQty: 9, unitPrice: 4200 },
  { id: 21, productCode: '27000388849', category: '완성품', kind: '도시락', productName: '혜자)두부김치제육한상', spec: '450g', unit: 'ea', shift: '1편', boxUnitQty: 8, unitPrice: 4300 },
  { id: 22, productCode: '27000388855', category: '완성품', kind: '도시락', productName: '혜자)두툼돈까스도시락', spec: '470g', unit: 'ea', shift: '1편', boxUnitQty: 9, unitPrice: 4500 },
  { id: 23, productCode: '27000388842', category: '완성품', kind: '도시락', productName: '혜자)반반제육소불고기', spec: '460g', unit: 'ea', shift: '1편', boxUnitQty: 8, unitPrice: 4600 },
  { id: 24, productCode: '27000388859', category: '완성품', kind: '도시락', productName: '혜자)통등심돈까스도시락', spec: '480g', unit: 'ea', shift: '1편', boxUnitQty: 6, unitPrice: 4900 },
  { id: 25, productCode: '27000388841', category: '완성품', kind: '도시락', productName: 'NEW뭘좋아할지몰라다넣은', spec: '520g', unit: 'ea', shift: '1편', boxUnitQty: 6, unitPrice: 5200 },
  { id: 26, productCode: '27000388837', category: '완성품', kind: '도시락', productName: 'NEW혜자)백반한상', spec: '450g', unit: 'ea', shift: '1편', boxUnitQty: 9, unitPrice: 4100 },
  { id: 27, productCode: '27000388806', category: '완성품', kind: '무스비', productName: 'NEW스팸무스비', spec: '180g', unit: 'ea', shift: '1편', boxUnitQty: 40, unitPrice: 1450 },
  { id: 28, productCode: '27000388856', category: '완성품', kind: '주먹밥', productName: '더큰)들기름막국수주먹밥', spec: '160g', unit: 'ea', shift: '1편', boxUnitQty: 40, unitPrice: 1100 },
  { id: 29, productCode: '27000388784', category: '완성품', kind: '주먹밥', productName: '더큰)리챔참치마요', spec: '160g', unit: 'ea', shift: '1편', boxUnitQty: 40, unitPrice: 1150 },
  { id: 30, productCode: '27000388847', category: '완성품', kind: '주먹밥', productName: '더큰)스팸계란볶음', spec: '160g', unit: 'ea', shift: '1편', boxUnitQty: 40, unitPrice: 1180 },
];

export interface GsCenterItem {
  id: number;
  centerCode: string;
  centerName: string;
  shift: '1편' | '2편';
  status: '출고완료' | '진행중' | '대기';
  abbrevName: string;
}

export const GS_CENTERS_MASTER: GsCenterItem[] = [
  { id: 1, centerCode: 'GSR-001', centerName: 'GSR 김해일배', shift: '1편', status: '출고완료', abbrevName: '김해1' },
  { id: 2, centerCode: 'GSR-001', centerName: 'GSR 김해일배', shift: '2편', status: '출고완료', abbrevName: '김해2' },
  { id: 3, centerCode: 'GSR-002', centerName: 'GSR 김해2일배', shift: '1편', status: '출고완료', abbrevName: '김해2-1' },
  { id: 4, centerCode: 'GSR-002', centerName: 'GSR 김해2일배', shift: '2편', status: '출고완료', abbrevName: '김해2-2' },
  { id: 5, centerCode: 'GSR-003', centerName: 'GSR 양산조리센터', shift: '1편', status: '출고완료', abbrevName: '양산1' },
  { id: 6, centerCode: 'GSR-004', centerName: 'GSR 부산물류센터', shift: '1편', status: '출고완료', abbrevName: '부산1' },
  { id: 7, centerCode: 'GSR-005', centerName: 'GSR 신광주 저온', shift: '1편', status: '출고완료', abbrevName: '광주1' },
  { id: 8, centerCode: 'GSR-005', centerName: 'GSR 신광주 저온', shift: '2편', status: '출고완료', abbrevName: '광주2' },
  { id: 9, centerCode: 'GSR-006', centerName: 'GSR 신광주2저온', shift: '1편', status: '출고완료', abbrevName: '광주2-1' },
  { id: 10, centerCode: 'GSR-006', centerName: 'GSR 신광주2저온', shift: '2편', status: '출고완료', abbrevName: '광주2-2' },
  { id: 11, centerCode: 'GSR-007', centerName: 'GSR 해인 CVS', shift: '1편', status: '출고완료', abbrevName: '해인1' },
  { id: 12, centerCode: 'GSR-007', centerName: 'GSR 해인 CVS', shift: '2편', status: '출고완료', abbrevName: '해인2' },
];


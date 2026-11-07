import { MenuCategory, MenuItem } from '@/types/erp';

export const MENU_CATEGORIES: MenuCategory[] = [
  {
    id: 'sales',
    title: '영업·출하',
    items: [
      { id: 'sales-order-upload', title: '수주 엑셀 업로드', categoryId: 'sales', categoryName: '영업·출하', badge: 'GSR' },
      { id: 'sales-order-extra-reg', title: '추가 수주 등록 (개별)', categoryId: 'sales', categoryName: '영업·출하' },
      { id: 'sales-order-status-cancel', title: '일일 주문현황 / 취소', categoryId: 'sales', categoryName: '영업·출하' },
      { id: 'sales-order-summary-gsr', title: '센터별 주문 집계현황', categoryId: 'sales', categoryName: '영업·출하' },
      { id: 'sales-undelivered-status', title: '미출 현황 및 결품 대조', categoryId: 'sales', categoryName: '영업·출하', badge: '핵심' },
      { id: 'sales-statement-issue', title: '거래명세서 발행', categoryId: 'sales', categoryName: '영업·출하' },
      { id: 'sales-tag-print', title: '파렛트 꼬리표 출력', categoryId: 'sales', categoryName: '영업·출하' },
    ],
  },
  {
    id: 'production',
    title: '생산·제조',
    items: [
      { id: 'prod-work-order-status', title: '작업지시서 & 취반 타임테이블', categoryId: 'production', categoryName: '생산·제조', badge: '핵심' },
      { id: 'prod-seq-reg', title: '라인별 생산순서 등록', categoryId: 'production', categoryName: '생산·제조' },
      { id: 'prod-result-status', title: '일일 생산실적 현황', categoryId: 'production', categoryName: '생산·제조' },
      { id: 'prod-discard-reg', title: '공정 불량/폐기 등록', categoryId: 'production', categoryName: '생산·제조' },
      { id: 'prod-food-waste-reg', title: '식품 부산물/폐기물 관리', categoryId: 'production', categoryName: '생산·제조' },
    ],
  },
  {
    id: 'purchase',
    title: '구매·자재',
    items: [
      { id: 'pur-mat-order-day', title: '요일별 자재발주 (스마트 발주)', categoryId: 'purchase', categoryName: '구매·자재', badge: '핵심' },
      { id: 'pur-order-print', title: '협력사 발주서 출력 / 전송', categoryId: 'purchase', categoryName: '구매·자재' },
      { id: 'pur-mat-req-print', title: 'BOM 소요량 분석', categoryId: 'purchase', categoryName: '구매·자재' },
      { id: 'pur-order-status-edit', title: '발주 현황 및 수정', categoryId: 'purchase', categoryName: '구매·자재' },
      { id: 'pur-receiving-status-edit', title: '입고 현황 및 단가수정', categoryId: 'purchase', categoryName: '구매·자재', badge: '검수' },
      { id: 'pur-expiry-status', title: '원자재 유통기한 추적', categoryId: 'purchase', categoryName: '구매·자재' },
    ],
  },
  {
    id: 'inventory',
    title: '재고·수불',
    items: [
      { id: 'inv-lookup', title: '통합 재고조회 (5시 실사 연동)', categoryId: 'inventory', categoryName: '재고·수불', badge: '실사' },
      { id: 'inv-raw-mat-stocktake', title: '원부재료 재고실사', categoryId: 'inventory', categoryName: '재고·수불' },
      { id: 'inv-warehouse-move', title: '창고간 이동등록', categoryId: 'inventory', categoryName: '재고·수불' },
      { id: 'inv-mat-extra-issue-reg', title: '자재 추가불출 등록', categoryId: 'inventory', categoryName: '재고·수불' },
      { id: 'inv-mat-ledger', title: '일일 자재수불부', categoryId: 'inventory', categoryName: '재고·수불' },
      { id: 'inv-daily-stock-amount', title: '일별 재고금액 현황', categoryId: 'inventory', categoryName: '재고·수불' },
      { id: 'inv-safety-stock-mgmt', title: '적정/안전재고 설정', categoryId: 'inventory', categoryName: '재고·수불' },
      { id: 'inv-return-status', title: '거래처 반품현황', categoryId: 'inventory', categoryName: '재고·수불' },
      { id: 'inv-discontinued-status', title: '단종제품 지정현황', categoryId: 'inventory', categoryName: '재고·수불' },
    ],
  },
  {
    id: 'management',
    title: '원가·경영',
    items: [
      { id: 'mgmt-provisional-sales-status', title: '가매출·미출·확정금액 정산', categoryId: 'management', categoryName: '원가·경영', badge: '핵심' },
      { id: 'mgmt-sales-pur-status', title: '매입 / 매출 종합 집계', categoryId: 'management', categoryName: '원가·경영' },
      { id: 'cost-recipe-rate', title: '완성품 레시피 원가율', categoryId: 'management', categoryName: '원가·경영' },
      { id: 'cost-overhead-reg', title: '제조 간접비 등록', categoryId: 'management', categoryName: '원가·경영' },
      { id: 'cost-prod-pl-status', title: '제품별 공헌이익 (P&L)', categoryId: 'management', categoryName: '원가·경영' },
      { id: 'cost-monthly-pl-status', title: '월별 손익계산서', categoryId: 'management', categoryName: '원가·경영' },
    ],
  },
  {
    id: 'master',
    title: '기준정보',
    items: [
      { id: 'master-product-reg', title: '제품 및 규격 마스터', categoryId: 'master', categoryName: '기준정보', badge: 'BOM연계' },
      { id: 'master-bom-normal', title: 'BOM(레시피) 정밀 관리', categoryId: 'master', categoryName: '기준정보' },
      { id: 'master-bom-deploy', title: 'BOM 다단계 전개', categoryId: 'master', categoryName: '기준정보' },
      { id: 'master-product-price', title: '매입/매출 단가 관리', categoryId: 'master', categoryName: '기준정보' },
      { id: 'master-partner-mgmt', title: '거래처 마스터 (협력사)', categoryId: 'master', categoryName: '기준정보' },
      { id: 'master-cvs-mgmt', title: 'GS 물류센터 마스터 (12개점)', categoryId: 'master', categoryName: '기준정보' },
      { id: 'master-base-code', title: 'ERP 기초코드 관리', categoryId: 'master', categoryName: '기준정보' },
    ],
  },
  {
    id: 'admin',
    title: '시스템·업무',
    items: [
      { id: 'work-notice', title: '전사 공지사항', categoryId: 'admin', categoryName: '시스템·업무' },
      { id: 'work-contact', title: '업무연락 및 지침', categoryId: 'admin', categoryName: '시스템·업무' },
      { id: 'work-schedule', title: '공장 일정관리', categoryId: 'admin', categoryName: '시스템·업무' },
      { id: 'work-role-mgmt', title: '업무분장 관리', categoryId: 'admin', categoryName: '시스템·업무' },
      { id: 'admin-user-reg', title: '사용자 등록 / 계정수정', categoryId: 'admin', categoryName: '시스템·업무' },
      { id: 'admin-perm-mgmt', title: '메뉴별 권한 관리', categoryId: 'admin', categoryName: '시스템·업무' },
      { id: 'admin-system-log', title: '시스템 사용로그 / 감사', categoryId: 'admin', categoryName: '시스템·업무' },
      { id: 'help-view', title: '도움말 및 매뉴얼', categoryId: 'admin', categoryName: '시스템·업무' },
    ],
  },
];

// 구버전 또는 축약 메뉴 ID -> 현행 표준 메뉴 ID 매핑 (하위 호환성 100% 보장)
const MENU_ALIASES: Record<string, string> = {
  // 영업 정예화 매핑 (납품 전표/현황 -> 거래명세서 발행 통합)
  'sales-delivery-reg': 'sales-statement-issue',
  'sales-delivery-status-edit': 'sales-statement-issue',
  'sales-item-delivery-status': 'sales-statement-issue',
  'sales-extra-order-status': 'sales-order-extra-reg',
  'sales-order-cancel-status': 'sales-order-status-cancel',

  // 생산 정예화 매핑 (원료투입 -> 생산실적 현황으로 통합)
  'prod-input-result-reg': 'prod-result-status',
  'prod-extra-prod': 'prod-work-order-status',
  'work-order-status': 'prod-work-order-status',
  'production-work-order-status': 'prod-work-order-status',

  // 구매 정예화 매핑 (스마트 발주 일원화)
  'pur-gfs-smart-order': 'pur-mat-order-day',
  'gfs-smart-order': 'pur-mat-order-day',
  'smart-order': 'pur-mat-order-day',
  'pur-mat-order-normal': 'pur-mat-order-day',
  'pur-mat-order-simul': 'pur-mat-order-day',
  'pur-order-simulation': 'pur-mat-order-day',
  'pur-order-req-confirm': 'pur-mat-order-day',
  'pur-receiving-reg': 'pur-receiving-status-edit',
  'pur-recv-status-edit': 'pur-receiving-status-edit',
  'pur-order-cancel-status': 'pur-order-status-edit',
  'pur-receiving-cancel-status': 'pur-receiving-status-edit',
  'pur-expiry-edit': 'pur-expiry-status',
  'purchase-expiry': 'pur-expiry-status',

  // 재고 정예화 매핑 (불용자재/중복 뷰 통합)
  'inv-unused-assign-reg': 'inv-lookup',
  'inv-unused-assign-status': 'inv-lookup',
  'inv-unused-use-reg': 'inv-lookup',
  'inv-unused-use-mat-status': 'inv-lookup',
  'inv-unused-use-purpose-status': 'inv-lookup',
  'inv-customer-stock-status': 'inv-lookup',
  'inv-stocktake-expiry': 'inv-raw-mat-stocktake',
  'inv-stock-status': 'inv-lookup',
  'inventory-safety-stock': 'inv-safety-stock-mgmt',
  'inv-mat-extra-issue-status': 'inv-mat-extra-issue-reg',
  'inv-discard-status': 'prod-discard-reg',
  'inv-food-waste-status': 'prod-food-waste-reg',
  'inv-return-reg': 'inv-return-status',

  // 경영/원가 정예화 매핑
  'mgmt-kpi-status': 'mgmt-provisional-sales-status',
  'mgmt-kpi-reg': 'mgmt-provisional-sales-status',

  // 기준정보 정예화 매핑
  'master-pack-spec': 'master-product-reg',
  'master-product-unit': 'master-base-code',
  'master-repr-prod-status': 'master-product-reg',
  'master-repr-prod-reg': 'master-product-reg',

  // 업무/시스템 정예화 매핑
  'admin-request-edit': 'work-contact',
  'admin-change-request': 'work-contact',
  'admin-user-edit': 'admin-user-reg',
  'admin-system-usage': 'admin-system-log',
  'work-exec-reg': 'work-schedule',
  'work-exec-status': 'work-schedule',
  'work-growth-idea': 'work-notice',
};

// Helper to look up any menu item by id
export const ALL_MENU_ITEMS: MenuItem[] = MENU_CATEGORIES.flatMap((c) => c.items);

export const getMenuItemById = (id: string): MenuItem | undefined => {
  const resolvedId = MENU_ALIASES[id] || id;
  return ALL_MENU_ITEMS.find((item) => item.id === resolvedId);
};

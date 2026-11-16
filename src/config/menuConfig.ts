import { MenuCategory, MenuItem } from '@/types/erp';

export const MENU_CATEGORIES: MenuCategory[] = [
  {
    id: 'sales',
    title: '매출관리',
    items: [
      { id: 'sales-order-upload', title: '주문등록GSR(upload)', categoryId: 'sales', categoryName: '매출관리', badge: 'GSR' },
      { id: 'sales-order-extra-reg', title: '추가주문등록GSR(개별등록)', categoryId: 'sales', categoryName: '매출관리' },
      { id: 'sales-order-status-cancel', title: '주문현황/취소', categoryId: 'sales', categoryName: '매출관리' },
      { id: 'sales-order-summary-gsr', title: '주문집계현황(GS리테일)', categoryId: 'sales', categoryName: '매출관리' },
      { id: 'sales-undelivered-status', title: '미출현황', categoryId: 'sales', categoryName: '매출관리', badge: '핵심' },
      { id: 'sales-statement-issue', title: '거래명세서발행', categoryId: 'sales', categoryName: '매출관리' },
      { id: 'sales-tag-print', title: '꼬리표출력', categoryId: 'sales', categoryName: '매출관리' },
    ],
  },
  {
    id: 'production',
    title: '생산관리',
    items: [
      { id: 'prod-work-order-status', title: '작업지시현황', categoryId: 'production', categoryName: '생산관리', badge: '핵심' },
      { id: 'prod-seq-reg', title: '생산순서등록(GSR)', categoryId: 'production', categoryName: '생산관리' },
      { id: 'prod-result-status', title: '생산실적현황(GSR)', categoryId: 'production', categoryName: '생산관리', badge: '실적' },
      { id: 'prod-discard-reg', title: '폐기등록(GSR)', categoryId: 'production', categoryName: '생산관리' },
    ],
  },
  {
    id: 'purchase',
    title: '매입관리',
    items: [
      { id: 'pur-mat-order-day', title: '자재발주(요일별)', categoryId: 'purchase', categoryName: '매입관리', badge: '스마트' },
      { id: 'pur-order-print', title: '발주서출력', categoryId: 'purchase', categoryName: '매입관리' },
      { id: 'pur-mat-req-print', title: '자재소요량출력(GSR)', categoryId: 'purchase', categoryName: '매입관리' },
      { id: 'pur-order-status-edit', title: '발주현황/수정', categoryId: 'purchase', categoryName: '매입관리' },
      { id: 'pur-receiving-status-edit', title: '입고현황/수정', categoryId: 'purchase', categoryName: '매입관리', badge: '검수' },
      { id: 'pur-expiry-status', title: '유통기한현황', categoryId: 'purchase', categoryName: '매입관리' },
    ],
  },
  {
    id: 'inventory',
    title: '재고관리',
    items: [
      { id: 'inv-lookup', title: '재고조회', categoryId: 'inventory', categoryName: '재고관리', badge: '실사' },
      { id: 'inv-raw-mat-stocktake', title: '원부재료재고실사(GSR)', categoryId: 'inventory', categoryName: '재고관리' },
      { id: 'inv-warehouse-move', title: '창고이동', categoryId: 'inventory', categoryName: '재고관리' },
      { id: 'inv-mat-extra-issue-reg', title: '자재추가불출등록(GSR)', categoryId: 'inventory', categoryName: '재고관리' },
      { id: 'inv-mat-ledger', title: '자재수불부', categoryId: 'inventory', categoryName: '재고관리' },
      { id: 'inv-daily-stock-amount', title: '일별재고금액', categoryId: 'inventory', categoryName: '재고관리' },
      { id: 'inv-safety-stock-mgmt', title: '안전재고관리', categoryId: 'inventory', categoryName: '재고관리' },
      { id: 'inv-return-status', title: '반품현황', categoryId: 'inventory', categoryName: '재고관리' },
      { id: 'inv-discontinued-status', title: '단종제품지정현황', categoryId: 'inventory', categoryName: '재고관리' },
    ],
  },
  {
    id: 'management',
    title: '경영·원가',
    items: [
      { id: 'mgmt-provisional-sales-status', title: '가매출/미출/확정금액현황', categoryId: 'management', categoryName: '경영·원가', badge: '정산' },
      { id: 'cost-recipe-rate', title: '완제품레시피원가율', categoryId: 'management', categoryName: '경영·원가' },
      { id: 'cost-overhead-reg', title: '간접비등록', categoryId: 'management', categoryName: '경영·원가' },
      { id: 'cost-prod-pl-status', title: '제품별손익현황', categoryId: 'management', categoryName: '경영·원가' },
    ],
  },
  {
    id: 'master',
    title: '기준정보',
    items: [
      { id: 'master-product-reg', title: '제품등록', categoryId: 'master', categoryName: '기준정보', badge: 'BOM' },
      { id: 'master-bom-normal', title: 'BOM(일반)', categoryId: 'master', categoryName: '기준정보' },
      { id: 'master-bom-deploy', title: 'BOM(전개)', categoryId: 'master', categoryName: '기준정보' },
      { id: 'master-partner-mgmt', title: '거래처관리', categoryId: 'master', categoryName: '기준정보' },
      { id: 'master-cvs-mgmt', title: '편의점관리', categoryId: 'master', categoryName: '기준정보' },
      { id: 'master-base-code', title: '기초코드', categoryId: 'master', categoryName: '기준정보' },
    ],
  },
  {
    id: 'admin',
    title: '업무·관리자',
    items: [
      { id: 'work-notice', title: '전사 공지사항', categoryId: 'admin', categoryName: '업무·관리자' },
      { id: 'work-contact', title: '업무연락 및 지침', categoryId: 'admin', categoryName: '업무·관리자' },
      { id: 'work-schedule', title: '공장 일정·행사 관리', categoryId: 'admin', categoryName: '업무·관리자' },
      { id: 'work-role-mgmt', title: '업무분장관리', categoryId: 'admin', categoryName: '업무·관리자' },
      { id: 'admin-user-reg', title: '사용자등록', categoryId: 'admin', categoryName: '업무·관리자' },
      { id: 'admin-perm-mgmt', title: '사용자권한관리', categoryId: 'admin', categoryName: '업무·관리자' },
      { id: 'admin-system-log', title: '시스템사용현황', categoryId: 'admin', categoryName: '업무·관리자' },
      { id: 'help-view', title: '도움말보기', categoryId: 'admin', categoryName: '업무·관리자' },
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

  // 생산 정예화 매핑 (원료투입 -> 생산실적 현황으로 통합, 부산물/폐기물 -> 불량/폐기 등록으로 통합)
  'prod-input-result-reg': 'prod-result-status',
  'prod-food-waste-reg': 'prod-discard-reg',
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
  'inv-food-waste-status': 'prod-discard-reg',
  'inv-return-reg': 'inv-return-status',

  // 경영/원가 정예화 매핑
  'mgmt-kpi-status': 'mgmt-provisional-sales-status',
  'mgmt-kpi-reg': 'mgmt-provisional-sales-status',
  'mgmt-sales-pur-status': 'mgmt-provisional-sales-status',
  'cost-monthly-pl-status': 'cost-prod-pl-status',

  // 기준정보 정예화 매핑
  'master-product-price': 'master-product-reg',
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

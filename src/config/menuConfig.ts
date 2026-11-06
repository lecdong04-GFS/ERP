import { MenuCategory, MenuItem } from '@/types/erp';

export const MENU_CATEGORIES: MenuCategory[] = [
  {
    id: 'work',
    title: '업무관리',
    items: [
      { id: 'work-notice', title: '공지사항', categoryId: 'work', categoryName: '업무관리' },
      { id: 'work-contact', title: '업무연락', categoryId: 'work', categoryName: '업무관리' },
      { id: 'work-schedule', title: '일정관리', categoryId: 'work', categoryName: '업무관리' },
      { id: 'work-role-mgmt', title: '업무분장관리', categoryId: 'work', categoryName: '업무관리' },
    ],
  },
  {
    id: 'sales',
    title: '매출관리',
    items: [
      { id: 'sales-order-upload', title: '주문등록GSR(upload)', categoryId: 'sales', categoryName: '매출관리', badge: 'GSR' },
      { id: 'sales-order-extra-reg', title: '추가주문등록(개별)', categoryId: 'sales', categoryName: '매출관리' },
      { id: 'sales-order-summary-gsr', title: '주문집계현황(GS리테일)', categoryId: 'sales', categoryName: '매출관리' },
      { id: 'sales-order-status-cancel', title: '주문현황/취소', categoryId: 'sales', categoryName: '매출관리' },
      { id: 'sales-delivery-reg', title: '납품등록', categoryId: 'sales', categoryName: '매출관리' },
      { id: 'sales-delivery-status-edit', title: '납품현황/수정', categoryId: 'sales', categoryName: '매출관리' },
      { id: 'sales-item-delivery-status', title: '품목별납품현황', categoryId: 'sales', categoryName: '매출관리' },
      { id: 'sales-statement-issue', title: '거래명세서발행', categoryId: 'sales', categoryName: '매출관리' },
      { id: 'sales-tag-print', title: '꼬리표출력', categoryId: 'sales', categoryName: '매출관리' },
      { id: 'sales-undelivered-reg', title: '매출등록', categoryId: 'sales', categoryName: '매출관리' },
      { id: 'sales-undelivered-status', title: '미출현황', categoryId: 'sales', categoryName: '매출관리' },
    ],
  },
  {
    id: 'purchase',
    title: '매입관리',
    items: [
      { id: 'pur-mat-req-print', title: '자재소요량출력(GSR)', categoryId: 'purchase', categoryName: '매입관리' },
      { id: 'pur-order-req-confirm', title: '발주소요량확정', categoryId: 'purchase', categoryName: '매입관리' },
      { id: 'pur-mat-order-day', title: '자재발주(요일별)', categoryId: 'purchase', categoryName: '매입관리', badge: '핵심' },
      { id: 'pur-order-simulation', title: '발주시뮬레이션', categoryId: 'purchase', categoryName: '매입관리' },
      { id: 'pur-order-status-edit', title: '발주현황/수정', categoryId: 'purchase', categoryName: '매입관리' },
      { id: 'pur-order-print', title: '발주서출력', categoryId: 'purchase', categoryName: '매입관리' },
      { id: 'pur-receiving-reg', title: '입고등록(GSR)', categoryId: 'purchase', categoryName: '매입관리' },
      { id: 'pur-receiving-status-edit', title: '입고현황/수정', categoryId: 'purchase', categoryName: '매입관리' },
      { id: 'pur-expiry-status', title: '유통기한관리', categoryId: 'purchase', categoryName: '매입관리' },
    ],
  },
  {
    id: 'production',
    title: '생산관리',
    items: [
      { id: 'prod-work-order-status', title: '작업지시현황', categoryId: 'production', categoryName: '생산관리' },
      { id: 'prod-input-result-reg', title: '투입실적등록(GSR)', categoryId: 'production', categoryName: '생산관리' },
      { id: 'prod-discard-reg', title: '폐기등록(GSR)', categoryId: 'production', categoryName: '생산관리' },
      { id: 'prod-food-waste-reg', title: '음식물쓰레기관리', categoryId: 'production', categoryName: '생산관리' },
      { id: 'prod-result-status', title: '생산실적현황(GSR)', categoryId: 'production', categoryName: '생산관리' },
      { id: 'prod-extra-prod', title: '추가생산(GSR)', categoryId: 'production', categoryName: '생산관리' },
      { id: 'prod-seq-reg', title: '생산순서등록(GSR)', categoryId: 'production', categoryName: '생산관리' },
    ],
  },
  {
    id: 'inventory',
    title: '재고관리',
    items: [
      { id: 'inv-lookup', title: '재고조회', categoryId: 'inventory', categoryName: '재고관리' },
      { id: 'inv-warehouse-move', title: '창고이동', categoryId: 'inventory', categoryName: '재고관리' },
      { id: 'inv-mat-extra-issue-reg', title: '자재추가불출등록(GSR)', categoryId: 'inventory', categoryName: '재고관리' },
      { id: 'inv-mat-extra-issue-status', title: '자재추가불출현황(GSR)', categoryId: 'inventory', categoryName: '재고관리' },
      { id: 'inv-raw-mat-stocktake', title: '원부재료재고실사(GSR)', categoryId: 'inventory', categoryName: '재고관리' },
      { id: 'inv-safety-stock-mgmt', title: '안전재고관리', categoryId: 'inventory', categoryName: '재고관리' },
      { id: 'inv-expiry-discard-mgmt', title: '유통기한/폐기관리', categoryId: 'inventory', categoryName: '재고관리' },
      { id: 'inv-unused-assign-reg', title: '불용자재통합관리', categoryId: 'inventory', categoryName: '재고관리' },
      { id: 'inv-mat-ledger', title: '자재수불부', categoryId: 'inventory', categoryName: '재고관리' },
      { id: 'inv-daily-stock-amount', title: '일별재고금액', categoryId: 'inventory', categoryName: '재고관리' },
      { id: 'inv-customer-stock-status', title: '거래처재고현황', categoryId: 'inventory', categoryName: '재고관리' },
      { id: 'inv-return-status', title: '반품현황', categoryId: 'inventory', categoryName: '재고관리' },
      { id: 'inv-discontinued-status', title: '단종제품지정현황', categoryId: 'inventory', categoryName: '재고관리' },
    ],
  },
  {
    id: 'management',
    title: '경영현황',
    items: [
      { id: 'mgmt-sales-pur-status', title: '매입매출현황(GSR)', categoryId: 'management', categoryName: '경영현황' },
      { id: 'mgmt-provisional-sales-status', title: '가매출/미출/확정금액현황', categoryId: 'management', categoryName: '경영현황' },
      { id: 'mgmt-kpi-status', title: '경영지표현황', categoryId: 'management', categoryName: '경영현황' },
    ],
  },
  {
    id: 'master',
    title: '기준정보',
    items: [
      { id: 'master-base-code', title: '기초코드', categoryId: 'master', categoryName: '기준정보' },
      { id: 'master-partner-mgmt', title: '거래처관리', categoryId: 'master', categoryName: '기준정보' },
      { id: 'master-product-reg', title: '제품등록', categoryId: 'master', categoryName: '기준정보' },
      { id: 'master-product-unit', title: '제품단위관리', categoryId: 'master', categoryName: '기준정보' },
      { id: 'master-product-price', title: '제품가격', categoryId: 'master', categoryName: '기준정보' },
      { id: 'master-pack-spec', title: '포장구성관리', categoryId: 'master', categoryName: '기준정보' },
      { id: 'master-bom-normal', title: 'BOM(일반)', categoryId: 'master', categoryName: '기준정보' },
      { id: 'master-bom-deploy', title: 'BOM(전개)', categoryId: 'master', categoryName: '기준정보' },
      { id: 'master-cvs-mgmt', title: '편의점관리', categoryId: 'master', categoryName: '기준정보' },
      { id: 'master-repr-prod-status', title: '대표제품관리', categoryId: 'master', categoryName: '기준정보' },
    ],
  },
  {
    id: 'cost',
    title: '원가관리',
    items: [
      { id: 'cost-overhead-reg', title: '간접비등록', categoryId: 'cost', categoryName: '원가관리' },
      { id: 'cost-prod-pl-status', title: '제품별손익현황', categoryId: 'cost', categoryName: '원가관리' },
      { id: 'cost-monthly-pl-status', title: '월별손익현황', categoryId: 'cost', categoryName: '원가관리' },
      { id: 'cost-recipe-rate', title: '완성품레시피원가율', categoryId: 'cost', categoryName: '원가관리' },
    ],
  },
  {
    id: 'help',
    title: '도움말',
    items: [
      { id: 'help-view', title: '도움말보기', categoryId: 'help', categoryName: '도움말' },
    ],
  },
  {
    id: 'admin',
    title: '관리자전용',
    items: [
      { id: 'admin-user-reg', title: '사용자등록/수정', categoryId: 'admin', categoryName: '관리자전용' },
      { id: 'admin-perm-mgmt', title: '사용자권한관리', categoryId: 'admin', categoryName: '관리자전용' },
      { id: 'admin-request-edit', title: '프로그램수정요청', categoryId: 'admin', categoryName: '관리자전용' },
      { id: 'admin-system-log', title: '시스템사용현황', categoryId: 'admin', categoryName: '관리자전용' },
    ],
  },
];

// 구버전 또는 축약 메뉴 ID -> 현행 표준 메뉴 ID 매핑 (하위 호환성 100% 보장)
const MENU_ALIASES: Record<string, string> = {
  // 발주 체계 일원화
  'pur-gfs-smart-order': 'pur-mat-order-day',
  'gfs-smart-order': 'pur-mat-order-day',
  'smart-order': 'pur-mat-order-day',
  'pur-mat-order-normal': 'pur-mat-order-day',
  // 입고 및 재고 파이프라인
  'pur-recv-status-edit': 'pur-receiving-status-edit',
  'inv-stock-status': 'inv-lookup',
  'inventory-safety-stock': 'inv-safety-stock-mgmt',
  'purchase-expiry': 'pur-expiry-status',
  // 생산 파이프라인
  'work-order-status': 'prod-work-order-status',
  'production-work-order-status': 'prod-work-order-status',
  // 관리자 및 사용자 프로필
  'admin-user-edit': 'admin-user-reg',
};

// Helper to look up any menu item by id
export const ALL_MENU_ITEMS: MenuItem[] = MENU_CATEGORIES.flatMap((c) => c.items);

export const getMenuItemById = (id: string): MenuItem | undefined => {
  const resolvedId = MENU_ALIASES[id] || id;
  return ALL_MENU_ITEMS.find((item) => item.id === resolvedId);
};


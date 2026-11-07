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
      { id: 'sales-delivery-reg', title: '납품 전표 등록', categoryId: 'sales', categoryName: '영업·출하' },
      { id: 'sales-delivery-status-edit', title: '납품 현황 및 전표수정', categoryId: 'sales', categoryName: '영업·출하' },
      { id: 'sales-item-delivery-status', title: '품목별 납품현황', categoryId: 'sales', categoryName: '영업·출하' },
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
      { id: 'prod-input-result-reg', title: '원료 투입 실적등록', categoryId: 'production', categoryName: '생산·제조' },
      { id: 'prod-result-status', title: '일일 생산실적 현황', categoryId: 'production', categoryName: '생산·제조' },
      { id: 'prod-extra-prod', title: '추가 생산지시 관리', categoryId: 'production', categoryName: '생산·제조' },
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
      { id: 'pur-order-req-confirm', title: '발주 확정 승인', categoryId: 'purchase', categoryName: '구매·자재' },
      { id: 'pur-order-simulation', title: '발주 시뮬레이션', categoryId: 'purchase', categoryName: '구매·자재' },
      { id: 'pur-order-status-edit', title: '발주 현황 및 수정', categoryId: 'purchase', categoryName: '구매·자재' },
      { id: 'pur-receiving-reg', title: '원부재료 입고등록', categoryId: 'purchase', categoryName: '구매·자재' },
      { id: 'pur-receiving-status-edit', title: '입고 현황 및 단가수정', categoryId: 'purchase', categoryName: '구매·자재' },
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
      { id: 'inv-mat-extra-issue-status', title: '자재 추가불출 현황', categoryId: 'inventory', categoryName: '재고·수불' },
      { id: 'inv-mat-ledger', title: '일일 자재수불부', categoryId: 'inventory', categoryName: '재고·수불' },
      { id: 'inv-daily-stock-amount', title: '일별 재고금액 현황', categoryId: 'inventory', categoryName: '재고·수불' },
      { id: 'inv-safety-stock-mgmt', title: '적정/안전재고 설정', categoryId: 'inventory', categoryName: '재고·수불' },
      { id: 'inv-expiry-discard-mgmt', title: '유통기한/폐기 관리', categoryId: 'inventory', categoryName: '재고·수불' },
      { id: 'inv-unused-assign-reg', title: '불용/체화자재 관리', categoryId: 'inventory', categoryName: '재고·수불' },
      { id: 'inv-customer-stock-status', title: '거래처 재고현황', categoryId: 'inventory', categoryName: '재고·수불' },
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
      { id: 'mgmt-kpi-status', title: '경영 KPI 종합 대시보드', categoryId: 'management', categoryName: '원가·경영' },
    ],
  },
  {
    id: 'master',
    title: '기준정보',
    items: [
      { id: 'master-product-reg', title: '제품 및 규격 마스터', categoryId: 'master', categoryName: '기준정보', badge: 'BOM연계' },
      { id: 'master-repr-prod-status', title: '대표제품 관리', categoryId: 'master', categoryName: '기준정보' },
      { id: 'master-bom-normal', title: 'BOM(레시피) 정밀 관리', categoryId: 'master', categoryName: '기준정보' },
      { id: 'master-bom-deploy', title: 'BOM 다단계 전개', categoryId: 'master', categoryName: '기준정보' },
      { id: 'master-pack-spec', title: '포장 구성 관리 (입수량)', categoryId: 'master', categoryName: '기준정보' },
      { id: 'master-product-price', title: '매입/매출 단가 관리', categoryId: 'master', categoryName: '기준정보' },
      { id: 'master-product-unit', title: '제품 단위 관리', categoryId: 'master', categoryName: '기준정보' },
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
      { id: 'admin-request-edit', title: '프로그램 수정요청', categoryId: 'admin', categoryName: '시스템·업무' },
      { id: 'admin-system-log', title: '시스템 사용로그 / 감사', categoryId: 'admin', categoryName: '시스템·업무' },
      { id: 'help-view', title: '도움말 및 매뉴얼', categoryId: 'admin', categoryName: '시스템·업무' },
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
  'admin-change-request': 'admin-request-edit',
  'admin-system-usage': 'admin-system-log',
};

// Helper to look up any menu item by id
export const ALL_MENU_ITEMS: MenuItem[] = MENU_CATEGORIES.flatMap((c) => c.items);

export const getMenuItemById = (id: string): MenuItem | undefined => {
  const resolvedId = MENU_ALIASES[id] || id;
  return ALL_MENU_ITEMS.find((item) => item.id === resolvedId);
};

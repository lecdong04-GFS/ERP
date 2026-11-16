export const GFS_SALES_ORDER_CHANGED_EVENT = 'gfs-sales-order-changed';

export interface SalesOrderChangedDetail {
  source?: string;
  orderDate?: string;
}

/**
 * 수주(1편/2편) 업로드·수정·취소·파이프라인 실행 시
 * 열려 있는 모든 생산·발주·시뮬레이션 화면에 즉시 갱신 신호를 전파합니다.
 */
export function emitSalesOrderChanged(detail?: SalesOrderChangedDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(GFS_SALES_ORDER_CHANGED_EVENT, { detail }));
}


'use client';

// [일원화 완료] 구버전 스마트발주(GFS)는 '자재발주(요일별)'로 통합 일원화되었습니다.
// 하위 호환성을 위해 MatOrderDayView를 기본 컴포넌트로 전달합니다.
export { MatOrderDayView as GfsSmartOrderView, MatOrderDayView as default } from './MatOrderDayView';

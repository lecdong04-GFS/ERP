import { pgQuery } from '@/lib/db/pg';

/** 업로드/변경 후 다음 대시보드 조회에서 스냅샷을 갱신하도록 표시 */
export async function touchDashboardSnapshot(): Promise<void> {
  try {
    await pgQuery(
      `update "DashboardSnapshot" set as_of = '1970-01-01' where key = 'dashboard'`
    );
  } catch (error: any) {
    // 스냅샷 테이블이 없거나 DB 장애여도 업로드 자체는 실패시키지 않음
    console.error('[dashboard] touch failed:', error?.message || error);
  }
}

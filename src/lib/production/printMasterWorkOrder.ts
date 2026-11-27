import type {
  AggregatedOrderItem,
  FormingScheduleRow,
  PrepScheduleRow,
  RiceWorkOrderResult,
} from './riceScheduleEngine';

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatKoreanDate(ymd: string): string {
  const parts = (ymd || '').split('-');
  if (parts.length !== 3) return ymd;
  const [y, m, d] = parts.map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const dow = isNaN(dt.getTime()) ? '' : dayNames[dt.getDay()];
  return `${y}년 ${m}월 ${d}일${dow ? ` (${dow}요일)` : ''}`;
}

function riceTagHtml(badge: string): string {
  const cls =
    badge === '빨간밥'
      ? 'rice-red'
      : badge === '흑미밥'
      ? 'rice-purple'
      : badge === '복합'
      ? 'rice-amber'
      : 'rice-white';
  return `<span class="rice-tag ${cls}">${esc(badge)}</span>`;
}

function toGram(qty: number, unit: string): number {
  const u = (unit || '').toLowerCase();
  if (u === 'kg') return qty * 1000;
  if (u === 'g' || u === 'ml') return qty;
  return 0;
}

function parseWorkerCount(workers?: string): number {
  const m = String(workers || '').match(/\d+/);
  return m ? Number(m[0]) : 0;
}

function formatDurationHm(totalMin: number): string {
  const m = Math.max(0, Math.round(totalMin));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}:${String(mm).padStart(2, '0')}`;
}

export interface MasterPrintOptions {
  scope?: 'ALL' | 'SEONGHYEONG' | 'JEONCHEORI';
}

/**
 * 작업지시서 & 취반 타임테이블(RiceWorkOrderResult)과 100% 동일한 데이터로
 * 전라인·전작업장 A4 가로 종합본 인쇄 HTML을 생성한다.
 */
export function buildMasterWorkOrderPrintHtml(
  result: RiceWorkOrderResult,
  options: MasterPrintOptions = {}
): string {
  const scope = options.scope || 'ALL';
  const dateKo = formatKoreanDate(result.workDate);
  const modeLabel =
    result.mode === 'pre10' ? '10시 이전 (선행 준비)' : '10시 이후 (본수주 확정)';

  // 품목별 BOM 매핑 (동일 품명 기준)
  const masterByKey = new Map<string, AggregatedOrderItem>();
  const masterByName = new Map<string, AggregatedOrderItem>();
  for (const m of result.tab1Master) {
    masterByKey.set(`${m.shiftType}::${m.baseProductName}`, m);
    if (!masterByName.has(m.baseProductName)) {
      masterByName.set(m.baseProductName, m);
    }
  }

  // 1) 성형장 라인별 그룹핑
  const allFormingRows: FormingScheduleRow[] = [
    ...result.tab4FormingBentoGimbap,
    ...result.tab5FormingSamgak,
  ];
  const formingOrder = [
    '도시락 1라인',
    '김밥 성형',
    '김밥 포장',
    '더큰 삼각라인',
    '삼각 1호기',
    '삼각 2호기',
    '커플 포장기',
  ];
  const formingByLine = new Map<string, FormingScheduleRow[]>();
  for (const r of allFormingRows) {
    const arr = formingByLine.get(r.lineName) || [];
    arr.push(r);
    formingByLine.set(r.lineName, arr);
  }
  const activeFormingLines = formingOrder.filter((ln) => {
    const rows = formingByLine.get(ln);
    return rows && rows.some((r) => r.rowType === '생산');
  });

  // 2) 전처리 작업장(작업실)별 그룹핑
  const allPrepRows: PrepScheduleRow[] = [
    ...result.tab2PrepRice,
    ...result.tab3PrepCook,
  ];
  const prepOrder = [
    '계량실·냉동실',
    '취반기',
    '로터리 믹서',
    '채소·커팅실',
    '조리실',
    '튀김실',
    '오븐실',
    '샐러드실',
  ];
  const prepByRoom = new Map<string, PrepScheduleRow[]>();
  for (const r of allPrepRows) {
    const arr = prepByRoom.get(r.room) || [];
    arr.push(r);
    prepByRoom.set(r.room, arr);
  }
  const activePrepRooms = [
    ...prepOrder.filter((rm) => (prepByRoom.get(rm)?.length || 0) > 0),
    ...Array.from(prepByRoom.keys()).filter((rm) => !prepOrder.includes(rm)),
  ];

  const includeForming = scope === 'ALL' || scope === 'SEONGHYEONG';
  const includePrep = scope === 'ALL' || scope === 'JEONCHEORI';

  const totalPages =
    1 +
    (includeForming ? activeFormingLines.length : 0) +
    (includePrep ? activePrepRooms.length : 0);

  let currentPageNo = 1;

  // ── Page 1 요약표 ──
  let totalFormingHeadcount = 0;
  const formingSummaryHtml = activeFormingLines
    .map((ln, i) => {
      const rows = formingByLine.get(ln) || [];
      const prodRows = rows.filter((r) => r.rowType === '생산');
      const ea = prodRows.reduce((s, r) => s + r.eaQty, 0);
      const firstT = rows[0]?.timeRange?.split('~')[0]?.trim() || '-';
      const lastT = rows[rows.length - 1]?.timeRange?.split('~')[1]?.trim() || '-';
      const lineWorkers = prodRows[0]?.workers || rows[0]?.workers || '-';
      totalFormingHeadcount += parseWorkerCount(lineWorkers);
      return `
        <tr class="${i % 2 === 1 ? 'row-alt' : ''}">
          <td class="col-center">${i + 1}</td>
          <td style="font-weight:900;">${esc(ln)}</td>
          <td class="col-center bold">${esc(lineWorkers)}</td>
          <td class="col-center">${prodRows.length}품목</td>
          <td class="col-right mono bold-blue">${ea.toLocaleString()} ea</td>
          <td class="col-center mono">${esc(firstT)} ~ ${esc(lastT)}</td>
        </tr>
      `;
    })
    .join('');

  let totalPrepHeadcount = 0;
  const prepSummaryHtml = activePrepRooms
    .map((rm, i) => {
      const rows = prepByRoom.get(rm) || [];
      const workRows = rows.filter((r) => r.rowType === '작업');
      const kg = Math.round(workRows.reduce((s, r) => s + r.requiredKg, 0) * 100) / 100;
      const firstT = rows[0]?.timeRange?.split('~')[0]?.trim() || '-';
      const lastT = rows[rows.length - 1]?.timeRange?.split('~')[1]?.trim() || '-';
      const roomWorkers = workRows[0]?.workers || rows[0]?.workers || '-';
      totalPrepHeadcount += parseWorkerCount(roomWorkers);
      return `
        <tr class="${i % 2 === 1 ? 'row-alt' : ''}">
          <td class="col-center">${i + 1}</td>
          <td style="font-weight:900;">${esc(rm)}</td>
          <td class="col-center bold">${esc(roomWorkers)}</td>
          <td class="col-center">${workRows.length}건</td>
          <td class="col-right mono bold-blue">${kg.toLocaleString()} kg</td>
          <td class="col-center mono">${esc(firstT)} ~ ${esc(lastT)}</td>
        </tr>
      `;
    })
    .join('');

  // ── 성형장 라인별 개별 페이지 ──
  const formingPagesHtml = includeForming
    ? activeFormingLines
        .map((ln) => {
          currentPageNo++;
          const rows = formingByLine.get(ln) || [];
          const prodRows = rows.filter((r) => r.rowType === '생산');
          const lineEa = prodRows.reduce((s, r) => s + r.eaQty, 0);
          const firstT = rows[0]?.timeRange?.split('~')[0]?.trim() || '-';
          const lastT = rows[rows.length - 1]?.timeRange?.split('~')[1]?.trim() || '-';
          const firstProdT = prodRows[0]?.timeRange?.split('~')[0]?.trim() || firstT;
          const lastProdT = prodRows[prodRows.length - 1]?.timeRange?.split('~')[1]?.trim() || lastT;
          const totalProdMin = prodRows.reduce((s, r) => s + r.durationMin, 0);
          const firstProdStart = prodRows[0]?.startMin ?? 0;
          const lastProdEnd = prodRows[prodRows.length - 1]?.endMin ?? firstProdStart;
          const totalLeadMin = Math.max(0, lastProdEnd - firstProdStart - totalProdMin);
          const lineWorkers = prodRows[0]?.workers || rows[0]?.workers || '-';

          // 해당 라인 소요 원물 합산
          const lineMatSum = new Map<string, { warehouse: string; kg: number }>();

          const bodyRows = rows
            .map((r) => {
              const isClean = r.rowType === '세척/전환';
              const isBreak = r.rowType === '휴게';
              const rowClass = isClean ? 'row-clean' : isBreak ? 'row-meal' : '';
              const cleanBase = r.baseProductName.replace(/\s*\((?:참치|비빔)파트\)$/, '');
              const master =
                masterByKey.get(`${r.shiftType}::${cleanBase}`) ||
                masterByName.get(cleanBase);

              let bomSummary = '-';
              if (r.rowType === '생산' && master && master.bomMaterials.length > 0) {
                const topMats: string[] = [];
                for (const mat of master.bomMaterials) {
                  const g = toGram(mat.unitQty, mat.unit);
                  const yf = 100 / Math.max(1, Number(mat.yieldRate) || 100);
                  const kg =
                    g > 0
                      ? Math.round(((r.eaQty * g * yf) / 1000) * 100) / 100
                      : 0;
                  if (kg > 0) {
                    const prev = lineMatSum.get(mat.materialName) || {
                      warehouse: mat.warehouse || '-',
                      kg: 0,
                    };
                    prev.kg = Math.round((prev.kg + kg) * 100) / 100;
                    lineMatSum.set(mat.materialName, prev);
                    if (topMats.length < 4) {
                      topMats.push(`${mat.materialName}(${kg}kg)`);
                    }
                  }
                }
                if (topMats.length > 0) {
                  bomSummary = topMats.join(', ') + (master.bomMaterials.length > 4 ? ' 외' : '');
                }
              }

              const shiftCls = r.shiftType === '2편' ? 'badge-s2' : 'badge-s1';
              const typePill =
                r.rowType === '생산'
                  ? '<span class="type-pill type-prod">생산</span>'
                  : r.rowType === '세척/전환'
                  ? '<span class="type-pill type-clean">세척/전환</span>'
                  : '<span class="type-pill type-break">휴게</span>';
              return `
                <tr class="${rowClass}">
                  <td class="col-center mono">${r.seq}</td>
                  <td class="col-center"><span class="badge ${shiftCls}">${esc(r.shiftType)}</span></td>
                  <td class="col-center mono bold">${esc(r.timeRange)}</td>
                  <td class="col-center">${r.durationMin}분</td>
                  <td class="col-center">${typePill}</td>
                  <td class="col-center">${r.rowType === '생산' ? riceTagHtml(r.riceColorBadge) : '-'}</td>
                  <td class="item-cell">${esc(r.baseProductName)}</td>
                  <td class="col-right mono qty-cell">${r.eaQty > 0 ? `${r.eaQty.toLocaleString()} ea` : '-'}</td>
                  <td class="col-center bold">${esc(r.workers || lineWorkers)}</td>
                  <td class="col-right mono">${r.uph > 0 ? r.uph.toLocaleString() : '-'}</td>
                  <td class="ellipsis-cell" style="max-width:170px;font-size:11px;color:#334155;">${esc(bomSummary)}</td>
                  <td class="col-center mono" style="min-width:54px;"></td>
                  <td class="col-center mono" style="min-width:48px;"></td>
                  <td style="min-width:72px;"></td>
                  <td class="ellipsis-cell" style="max-width:85px;font-size:11px;color:#475569;">${esc(r.note)}</td>
                  <td class="col-center"><div class="check-box"></div></td>
                </tr>
              `;
            })
            .join('');

          const matRows = Array.from(lineMatSum.entries())
            .sort((a, b) => b[1].kg - a[1].kg)
            .slice(0, 12)
            .map(
              ([matName, info], idx) => `
                <tr>
                  <td class="col-center">${idx + 1}</td>
                  <td class="col-center">${esc(info.warehouse)}</td>
                  <td style="font-weight:700;">${esc(matName)}</td>
                  <td class="col-right mono bold-blue">${info.kg.toLocaleString()} kg</td>
                  <td class="col-center"><div class="check-box"></div></td>
                </tr>
              `
            )
            .join('');

          return `
            <section class="page-section">
              <div class="banner banner-forming">
                <div>
                  <div class="banner-eyebrow">GFS 스마트 생산관제 · 성형장 라인별 지시서</div>
                  <div class="banner-title">${esc(ln)} 일일 작업지시서</div>
                  <div class="banner-meta">
                    <span class="meta-pill">📅 ${esc(dateKo)}</span>
                    <span class="meta-pill">⚙️ ${esc(modeLabel)}</span>
                    <span class="meta-pill">⏱️ ${esc(firstT)} ~ ${esc(lastT)}</span>
                    <span class="meta-pill meta-pill-strong">📦 총 ${lineEa.toLocaleString()} ea</span>
                    <span class="meta-pill">👥 투입인원 ${esc(lineWorkers)}</span>
                  </div>
                </div>
                <table class="sign-table">
                  <tr><th>작성</th><th>검토</th><th>승인</th></tr>
                  <tr><td></td><td></td><td></td></tr>
                </table>
              </div>

              <table class="tbl-forming">
                <thead>
                  <tr>
                    <th>No</th>
                    <th>편</th>
                    <th>시간대</th>
                    <th>소요</th>
                    <th>구분</th>
                    <th>밥색상</th>
                    <th>품목명 / 작업내용</th>
                    <th>수량</th>
                    <th>인원</th>
                    <th>UPH</th>
                    <th>BOM 주요 투입원물</th>
                    <th>실종료</th>
                    <th>발생차이</th>
                    <th>차이발생원인</th>
                    <th>비고</th>
                    <th>확인</th>
                  </tr>
                </thead>
                <tbody>${bodyRows}</tbody>
                <tfoot>
                  <tr style="background:#f1f5f9;font-weight:900;">
                    <td colspan="2" class="col-center">${prodRows.length} Unit</td>
                    <td class="col-center mono">${esc(firstProdT)} ~ ${esc(lastProdT)}</td>
                    <td class="col-center mono">${formatDurationHm(totalProdMin)}</td>
                    <td colspan="3" class="col-right" style="padding-right:6px;">리더타임 합계: <span class="mono">${formatDurationHm(totalLeadMin)}</span></td>
                    <td class="col-right mono bold-blue">${lineEa.toLocaleString()} ea</td>
                    <td class="col-center">${esc(lineWorkers)}</td>
                    <td colspan="7" style="font-size:11px;color:#475569;padding-left:8px;">* 실종료·발생차이·원인은 현장 반장 수기 기록용</td>
                  </tr>
                </tfoot>
              </table>

              ${
                matRows
                  ? `
                <div class="sub-title">${esc(ln)} 소요 원물 합계 (BOM 역산)</div>
                <table class="compact-table">
                  <thead>
                    <tr>
                      <th style="width:36px;">No</th>
                      <th style="width:90px;">보관창고</th>
                      <th>투입 원재료명</th>
                      <th style="width:110px;">총 필요중량</th>
                      <th style="width:66px;">불출확인</th>
                    </tr>
                  </thead>
                  <tbody>${matRows}</tbody>
                </table>
              `
                  : ''
              }

              <div class="footer-box">
                <div>* 본 지시서는 [작업지시서 & 취반 타임테이블]의 실수주·BOM 역산 데이터와 100% 동일합니다.</div>
                <div>페이지 ${currentPageNo} / ${totalPages}</div>
              </div>
            </section>
          `;
        })
        .join('')
    : '';

  // ── 전처리 작업장(작업실)별 개별 페이지 ──
  const prepPagesHtml = includePrep
    ? activePrepRooms
        .map((rm) => {
          currentPageNo++;
          const rows = [...(prepByRoom.get(rm) || [])].sort(
            (a, b) => a.startMin - b.startMin
          );
          const workRows = rows.filter((r) => r.rowType === '작업');
          const roomTotalKg =
            Math.round(workRows.reduce((s, r) => s + r.requiredKg, 0) * 100) / 100;
          const roomWorkers = workRows[0]?.workers || rows[0]?.workers || '-';

          const matTotalMap = new Map<string, number>();
          for (const r of workRows) {
            matTotalMap.set(
              r.materialName,
              Math.round(((matTotalMap.get(r.materialName) || 0) + r.requiredKg) * 100) / 100
            );
          }

          const bodyRows = rows
            .map((r, idx) => {
              const isClean = r.rowType === '세척/전환';
              const shiftCls = r.shiftType === '2편' ? 'badge-s2' : 'badge-s1';
              return `
                <tr class="${isClean ? 'row-clean' : idx % 2 === 1 ? 'row-alt' : ''}">
                  <td class="col-center">${idx + 1}</td>
                  <td class="col-center"><span class="badge ${shiftCls}">${esc(r.shiftType)}</span></td>
                  <td class="col-center mono bold">${esc(r.timeRange)}</td>
                  <td class="col-center">${esc(r.targetLine)}</td>
                  <td class="col-center">${r.rowType === '작업' ? riceTagHtml(r.riceColorBadge) : '-'}</td>
                  <td class="item-cell">${esc(r.baseProductName)}</td>
                  <td class="item-cell" style="color:#0f172a;">${esc(r.materialName)}</td>
                  <td class="col-right mono qty-cell" style="color:#0f172a;">${r.eaQty > 0 ? `${r.eaQty.toLocaleString()} ea` : '-'}</td>
                  <td class="col-right mono">${r.unitWeightG > 0 ? `${r.unitWeightG}g` : '-'}</td>
                  <td class="col-right mono qty-cell">${r.requiredKg > 0 ? `${r.requiredKg.toLocaleString()} kg` : '-'}</td>
                  <td class="col-center bold">${esc(r.workers || roomWorkers)}</td>
                  <td class="ellipsis-cell" style="max-width:100px;font-size:11.5px;color:#475569;">${esc(r.note)}</td>
                  <td class="col-center"><div class="check-box"></div></td>
                </tr>
              `;
            })
            .join('');

          const sumRows = Array.from(matTotalMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 12)
            .map(
              ([mat, kg], idx) => `
                <tr>
                  <td class="col-center">${idx + 1}</td>
                  <td style="font-weight:700;">${esc(mat)}</td>
                  <td class="col-right mono bold-blue">${kg.toLocaleString()} kg</td>
                  <td class="col-center"><div class="check-box"></div></td>
                </tr>
              `
            )
            .join('');

          return `
            <section class="page-section">
              <div class="banner banner-prep">
                <div>
                  <div class="banner-eyebrow">GFS 스마트 생산관제 · 전처리 작업장별 지시서</div>
                  <div class="banner-title">${esc(rm)} 일일 작업지시서</div>
                  <div class="banner-meta">
                    <span class="meta-pill">📅 ${esc(dateKo)}</span>
                    <span class="meta-pill">⚙️ ${esc(modeLabel)}</span>
                    <span class="meta-pill">📋 작업 ${workRows.length}건</span>
                    <span class="meta-pill meta-pill-strong">⚖️ 총 ${roomTotalKg.toLocaleString()} kg</span>
                    <span class="meta-pill">👥 투입인원 ${esc(roomWorkers)}</span>
                  </div>
                </div>
                <table class="sign-table">
                  <tr><th>작성</th><th>검토</th><th>승인</th></tr>
                  <tr><td></td><td></td><td></td></tr>
                </table>
              </div>

              <table class="tbl-prep">
                <thead>
                  <tr>
                    <th>No</th>
                    <th>편</th>
                    <th>작업시간대</th>
                    <th>대상라인</th>
                    <th>밥색상</th>
                    <th>완제품명</th>
                    <th>투입 원물명</th>
                    <th>생산수량</th>
                    <th>단위</th>
                    <th>필요중량</th>
                    <th>인원</th>
                    <th>비고</th>
                    <th>확인</th>
                  </tr>
                </thead>
                <tbody>${bodyRows}</tbody>
              </table>

              ${
                sumRows
                  ? `
                <div class="sub-title">${esc(rm)} 원물별 총 합산 중량</div>
                <table class="compact-table">
                  <thead>
                    <tr>
                      <th style="width:36px;">No</th>
                      <th>원물명</th>
                      <th style="width:120px;">합산 필요중량</th>
                      <th style="width:68px;">계량확인</th>
                    </tr>
                  </thead>
                  <tbody>${sumRows}</tbody>
                </table>
              `
                  : ''
              }

              <div class="footer-box">
                <div>* 본 지시서는 [작업지시서 & 취반 타임테이블]의 실수주·BOM 역산 데이터와 100% 동일합니다.</div>
                <div>페이지 ${currentPageNo} / ${totalPages}</div>
              </div>
            </section>
          `;
        })
        .join('')
    : '';

  return `
    <!DOCTYPE html>
    <html lang="ko">
    <head>
      <meta charset="UTF-8" />
      <title>[GFS] 전라인·작업장 통합 작업지시서 종합본_${esc(result.workDate)}</title>
      <style>
        @page { size: A4 landscape; margin: 5mm 6mm; }
        * {
          box-sizing: border-box;
          font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body { margin: 0; padding: 10px; color: #0f172a; font-size: 12.5px; line-height: 1.3; background: #fff; }
        .no-print { display: flex; justify-content: space-between; align-items: center; background: #0f172a; color: #fff; padding: 10px 16px; border-radius: 10px; margin-bottom: 10px; font-size: 13px; }
        .page-section { page-break-after: always; padding-bottom: 6px; }
        .page-section:last-of-type { page-break-after: auto; }

        /* 컬러풀 상단 배너 */
        .banner {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 9px 14px;
          border-radius: 10px;
          margin-bottom: 8px;
          color: #fff;
        }
        .banner-summary { background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 65%, #312e81 100%); }
        .banner-forming { background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); }
        .banner-prep { background: linear-gradient(135deg, #065f46 0%, #059669 100%); }
        .banner-eyebrow { font-size: 10.5px; font-weight: 800; color: rgba(255,255,255,0.82); letter-spacing: 0.4px; text-transform: uppercase; }
        .banner-title { font-size: 22px; font-weight: 900; color: #fff; letter-spacing: -0.3px; margin: 2px 0 5px; }
        .banner-meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
        .meta-pill {
          display: inline-block;
          background: rgba(255,255,255,0.16);
          border: 1px solid rgba(255,255,255,0.28);
          color: #fff;
          padding: 2px 8px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
          white-space: nowrap;
        }
        .meta-pill-strong { background: #fef08a; color: #0f172a; border-color: #fde047; font-weight: 900; }

        .sign-table { width: auto; border-collapse: collapse; margin: 0; background: #fff; border-radius: 6px; overflow: hidden; }
        .sign-table th { width: 50px; background: #f1f5f9; color: #0f172a; border: 1px solid #94a3b8; font-size: 11px; padding: 3px 4px; text-align: center; }
        .sign-table td { width: 50px; height: 26px; border: 1px solid #94a3b8; background: #fff; }

        table { width: 100%; border-collapse: collapse; margin-bottom: 8px; table-layout: auto; }
        .compact-table { width: 85%; }
        th { background: #1e293b; border: 1px solid #475569; padding: 5px 4px; font-size: 12px; font-weight: 900; text-align: center; color: #fff; white-space: nowrap; }
        .tbl-forming th { background: #1e3a8a; border-color: #1e40af; color: #fff; }
        .tbl-prep th { background: #065f46; border-color: #047857; color: #fff; }
        .compact-table th { background: #334155; border-color: #475569; color: #fff; }
        td { border: 1px solid #cbd5e1; padding: 3.5px 4px; vertical-align: middle; font-size: 12.5px; line-height: 1.25; white-space: nowrap; }
        .item-cell { font-size: 14.5px; font-weight: 900; color: #0f172a; letter-spacing: -0.4px; padding: 3.5px 5px; white-space: nowrap; }
        .qty-cell { font-size: 14px; font-weight: 900; color: #1d4ed8; background: #eff6ff; white-space: nowrap; }
        .ellipsis-cell { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .col-center { text-align: center; white-space: nowrap; }
        .col-right { text-align: right; white-space: nowrap; }
        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
        .bold { font-weight: 800; }
        .bold-blue { font-weight: 900; color: #1d4ed8; font-size: 13.5px; white-space: nowrap; }
        .row-alt { background: #f8fafc; }
        .row-clean { background: #dcfce7; color: #14532d; font-weight: 800; }
        .row-meal { background: #fef3c7; color: #78350f; font-weight: 800; }

        .badge { display: inline-block; padding: 2px 7px; border-radius: 5px; font-size: 11px; font-weight: 900; border: 1px solid transparent; }
        .badge-s2 { background: #dbeafe; color: #1e40af; border-color: #93c5fd; }
        .badge-s1 { background: #ede9fe; color: #5b21b6; border-color: #c4b5fd; }

        .type-pill { display: inline-block; padding: 2px 6px; border-radius: 5px; font-size: 11px; font-weight: 900; }
        .type-prod { background: #e0f2fe; color: #0369a1; border: 1px solid #7dd3fc; }
        .type-clean { background: #bbf7d0; color: #166534; border: 1px solid #4ade80; }
        .type-break { background: #fde68a; color: #92400e; border: 1px solid #fbbf24; }

        .rice-tag { display: inline-block; padding: 2px 7px; border-radius: 5px; font-size: 11px; font-weight: 900; border: 1px solid transparent; }
        .rice-white { background: #f1f5f9; color: #334155; border-color: #cbd5e1; }
        .rice-purple { background: #f3e8ff; color: #6b21a8; border-color: #d8b4fe; }
        .rice-amber { background: #fef3c7; color: #92400e; border-color: #fcd34d; }
        .rice-red { background: #ffe4e6; color: #be123c; border-color: #fda4af; }

        .check-box { width: 16px; height: 16px; border: 2px solid #475569; margin: 0 auto; border-radius: 3px; background: #fff; }
        .sub-title { font-size: 14px; font-weight: 900; color: #0f172a; margin: 10px 0 5px; padding-left: 8px; border-left: 4px solid #2563eb; }
        .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .footer-box { border-top: 1px solid #94a3b8; padding-top: 5px; display: flex; justify-content: space-between; font-size: 10.5px; color: #475569; margin-top: 6px; }
        @media print {
          .no-print { display: none !important; }
          body { padding: 0; }
          tr { page-break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <div class="no-print">
        <div>
          <b>🖨️ GFS 전라인 · 전작업장 통합 작업지시서 종합본 (실수주 · BOM 실시간 일치)</b>
          <span style="margin-left:10px;font-size:11px;color:#cbd5e1;">${esc(dateKo)} · ${esc(modeLabel)} · 총 ${totalPages}페이지</span>
        </div>
        <div style="display:flex;gap:8px;">
          <button onclick="window.print()" style="padding:6px 14px;border:none;border-radius:6px;background:#2563eb;color:#fff;font-weight:800;cursor:pointer;">인쇄 / PDF 저장</button>
          <button onclick="window.close()" style="padding:6px 12px;border:none;border-radius:6px;background:#475569;color:#fff;font-weight:700;cursor:pointer;">닫기</button>
        </div>
      </div>

      <section class="page-section">
        <div class="banner banner-summary">
          <div>
            <div class="banner-eyebrow">GFS 스마트 제조 생산관제 · 전사 일일 종합본</div>
            <div class="banner-title" style="font-size:24px;">전라인 · 전작업장 통합 작업지시서 종합본</div>
            <div class="banner-meta">
              <span class="meta-pill">📅 ${esc(dateKo)}</span>
              <span class="meta-pill">⚙️ ${esc(modeLabel)}</span>
              <span class="meta-pill meta-pill-strong">📦 총 ${result.summary.totalEa.toLocaleString()} ea (2편 ${result.summary.shift2Ea.toLocaleString()} / 1편 ${result.summary.shift1Ea.toLocaleString()})</span>
              <span class="meta-pill">⚖️ BOM 원물 ${result.summary.totalKg.toLocaleString()} kg</span>
              <span class="meta-pill">👥 총 인원 ${(totalFormingHeadcount + totalPrepHeadcount)}명 (성형 ${totalFormingHeadcount}명 · 전처리 ${totalPrepHeadcount}명)</span>
            </div>
          </div>
          <table class="sign-table">
            <tr><th>작성</th><th>검토</th><th>승인</th></tr>
            <tr><td></td><td></td><td></td></tr>
          </table>
        </div>

        <div class="summary-grid">
          <div>
            <div class="sub-title">① 성형장 라인별 작업 요약 (총 ${activeFormingLines.length}개 라인 · ${totalFormingHeadcount}명)</div>
            <table class="tbl-forming">
              <thead>
                <tr>
                  <th style="width:36px;">No</th>
                  <th>성형 라인명</th>
                  <th style="width:52px;">인원</th>
                  <th style="width:76px;">품목 수</th>
                  <th style="width:105px;">생산 수량</th>
                  <th style="width:115px;">가동시간</th>
                </tr>
              </thead>
              <tbody>${formingSummaryHtml || '<tr><td colspan="6" class="col-center">가동 라인 없음</td></tr>'}</tbody>
            </table>
          </div>
          <div>
            <div class="sub-title" style="border-left-color:#059669;">② 전처리 작업장(실)별 작업 요약 (총 ${activePrepRooms.length}개 작업장 · ${totalPrepHeadcount}명)</div>
            <table class="tbl-prep">
              <thead>
                <tr>
                  <th style="width:36px;">No</th>
                  <th>작업장 / 작업실</th>
                  <th style="width:52px;">인원</th>
                  <th style="width:76px;">작업 건수</th>
                  <th style="width:105px;">소요 원물</th>
                  <th style="width:115px;">작업시간</th>
                </tr>
              </thead>
              <tbody>${prepSummaryHtml || '<tr><td colspan="6" class="col-center">작업 내역 없음</td></tr>'}</tbody>
            </table>
          </div>
        </div>

        <div class="footer-box">
          <div>* 2페이지부터 각 성형 라인별 및 전처리 작업장별로 1페이지씩 분리되어 현장에서 바로 출력·배포할 수 있습니다.</div>
          <div>페이지 1 / ${totalPages}</div>
        </div>
      </section>

      ${formingPagesHtml}
      ${prepPagesHtml}

      <script>
        window.onload = function() {
          setTimeout(function() { window.print(); }, 400);
        };
      </script>
    </body>
    </html>
  `;
}

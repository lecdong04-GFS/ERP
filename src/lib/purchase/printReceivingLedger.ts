import { escapeHtml } from '@/lib/sanitize';

export interface ReceivingLedgerItem {
  orderDate: string;      // 발주일 또는 입고일 (YYYY-MM-DD)
  productName: string;    // 원재료명
  spec: string;           // 규격
  unit: string;           // 단위 (box 등)
  totalQty: number;       // 총입하량
  shortageQty?: number;   // 미입하량 (0이면 공란)
  expiryDate?: string;    // 유통기한
  carTemp?: string;       // 차량온도
  markStatus?: string;    // 표시사항 ('O' | 'X' | '')
  lookStatus?: string;    // 외관상태 ('O' | 'X' | '')
  carClean?: string;      // 차량청결 ('O' | 'X' | '')
  totalJudge?: string;    // 종합판정 ('O' | 'X' | '적' | '부' | '')
  remark?: string;        // 비고 (공급업체명)
  deviationNote?: string; // 이탈사항 (자동/수기)
}

export interface ReceivingLedgerPrintOptions {
  writtenDate: string; // 작성일자 YYYY-MM-DD
  items: ReceivingLedgerItem[];
  rowsPerPage?: number;
}

function formatKoreanDateFull(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || '').trim());
  if (!m) return ymd || '';
  return `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일`;
}

function formatMonthDay(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || '').trim());
  if (!m) return ymd || '';
  return `${Number(m[2])}월 ${Number(m[3])}일`;
}

function formatJudgeHtml(judge?: string): string {
  const v = String(judge || '').trim();
  if (v === 'O' || v === '적' || v === '합격') {
    return '<span class="judge-selected">적</span> / <span class="judge-dim">부</span>';
  }
  if (v === 'X' || v === '부' || v === '불합격') {
    return '<span class="judge-dim">적</span> / <span class="judge-fail">부</span>';
  }
  return '적 / 부';
}

function formatOx(val?: string): string {
  const v = String(val || '').trim().toUpperCase();
  if (v === 'O') return 'O';
  if (v === 'X') return '<span style="color:#dc2626;font-weight:900;">X</span>';
  return '';
}

/**
 * GFS-S-600-01 원.부자재입고관리대장 A4 가로 인쇄 HTML 생성
 */
export function buildReceivingLedgerPrintHtml(options: ReceivingLedgerPrintOptions): string {
  const rowsPerPage = options.rowsPerPage ?? 13;
  const items = options.items || [];
  const writtenDateKo = formatKoreanDateFull(options.writtenDate);

  const chunks: ReceivingLedgerItem[][] = [];
  for (let i = 0; i < items.length; i += rowsPerPage) {
    chunks.push(items.slice(i, i + rowsPerPage));
  }
  if (chunks.length === 0) {
    chunks.push([]);
  }

  const totalPages = chunks.length;

  const pagesHtml = chunks
    .map((chunk, pageIdx) => {
      const pageNo = pageIdx + 1;

      // 본문 13행 고정 (남은 행은 빈 행)
      const paddedRows: Array<ReceivingLedgerItem | null> = [...chunk];
      while (paddedRows.length < rowsPerPage) {
        paddedRows.push(null);
      }

      const bodyRowsHtml = paddedRows
        .map((r) => {
          if (!r) {
            return `
              <tr class="data-row">
                <td class="c">&nbsp;</td>
                <td></td>
                <td></td>
                <td class="c"></td>
                <td class="r"></td>
                <td class="r"></td>
                <td class="c"></td>
                <td class="c"></td>
                <td class="c"></td>
                <td class="c"></td>
                <td class="c"></td>
                <td class="c">적 / 부</td>
                <td></td>
              </tr>
            `;
          }

          const shortageText =
            typeof r.shortageQty === 'number' && r.shortageQty > 0
              ? r.shortageQty.toLocaleString()
              : '';

          return `
            <tr class="data-row">
              <td class="c">${escapeHtml(formatMonthDay(r.orderDate))}</td>
              <td class="name-cell">${escapeHtml(r.productName)}</td>
              <td class="spec-cell">${escapeHtml(r.spec || '')}</td>
              <td class="c">${escapeHtml(r.unit || 'box')}</td>
              <td class="r">${Number(r.totalQty || 0).toLocaleString()}</td>
              <td class="r">${escapeHtml(shortageText)}</td>
              <td class="c mono">${escapeHtml(r.expiryDate || '')}</td>
              <td class="c mono">${escapeHtml(r.carTemp || '')}</td>
              <td class="c">${formatOx(r.markStatus)}</td>
              <td class="c">${formatOx(r.lookStatus)}</td>
              <td class="c">${formatOx(r.carClean)}</td>
              <td class="c">${formatJudgeHtml(r.totalJudge)}</td>
              <td class="c remark-cell">${escapeHtml(r.remark || '')}</td>
            </tr>
          `;
        })
        .join('');

      // 해당 페이지의 이탈사항 자동 추출 (불량 X 또는 미입하 발생 시)
      const deviations = chunk
        .filter(
          (r) =>
            r.totalJudge === 'X' ||
            r.totalJudge === '부' ||
            r.markStatus === 'X' ||
            r.lookStatus === 'X' ||
            r.carClean === 'X' ||
            (typeof r.shortageQty === 'number' && r.shortageQty > 0) ||
            Boolean(r.deviationNote)
        )
        .slice(0, 4);

      const devRowsHtml = Array.from({ length: 4 })
        .map((_, idx) => {
          const d = deviations[idx];
          if (!d) {
            return `
              <tr class="dev-row">
                <td>&nbsp;</td>
                <td></td>
                <td></td>
                <td class="c"></td>
                <td class="c"></td>
              </tr>
            `;
          }
          const reasons: string[] = [];
          if (d.deviationNote) reasons.push(d.deviationNote);
          if (typeof d.shortageQty === 'number' && d.shortageQty > 0) {
            reasons.push(`미입하 ${d.shortageQty}${d.unit || 'box'}`);
          }
          if (d.markStatus === 'X') reasons.push('표시사항 불량');
          if (d.lookStatus === 'X') reasons.push('외관상태 불량');
          if (d.carClean === 'X') reasons.push('차량청결 불량');
          if ((d.totalJudge === 'X' || d.totalJudge === '부') && reasons.length === 0) {
            reasons.push('입고검사 부적합');
          }
          return `
            <tr class="dev-row">
              <td>${escapeHtml(d.productName)}</td>
              <td>${escapeHtml(reasons.join(', '))}</td>
              <td></td>
              <td class="c"></td>
              <td class="c"></td>
            </tr>
          `;
        })
        .join('');

      return `
        <section class="page-section">
          <!-- 상단 문서 헤더 -->
          <table class="header-table">
            <tr>
              <td class="doc-meta-cell" rowspan="2">
                <table class="doc-meta-inner">
                  <tr>
                    <th>문서 번호</th>
                    <td>GFS-S-600-01</td>
                  </tr>
                  <tr>
                    <th>제정 일자</th>
                    <td>2017년11월17일</td>
                  </tr>
                  <tr>
                    <th>개정 일자</th>
                    <td>2018년05월25일</td>
                  </tr>
                </table>
              </td>
              <td class="title-cell" rowspan="2">
                원.부자재입고관리대장
              </td>
              <td class="sign-wrap-cell" rowspan="2">
                <table class="sign-inner">
                  <tr>
                    <th rowspan="2" style="width:22px;">결<br/>재</th>
                    <th>작성</th>
                    <th>검토</th>
                    <th>승인</th>
                  </tr>
                  <tr>
                    <td style="height:36px;"></td>
                    <td style="height:36px;"></td>
                    <td style="height:36px;"></td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <!-- 메타 정보 줄 -->
          <div class="meta-bar">
            <div>▣ 작성일자 : ${escapeHtml(writtenDateKo)}</div>
            <div class="meta-right">
              <span>▣ 범례: 양호 [O], 불량 [X]</span>
              <span>▣ 점검주기: 입고시</span>
            </div>
          </div>

          <!-- 본문 13열 테이블 -->
          <table class="main-table">
            <thead>
              <tr>
                <th style="width:60px;">발주일</th>
                <th style="width:185px;">원 &nbsp; 재 &nbsp; 료 &nbsp; 명</th>
                <th style="width:88px;">규격</th>
                <th style="width:34px;">단위</th>
                <th style="width:48px;">총입하량</th>
                <th style="width:48px;">미입하량</th>
                <th style="width:68px;">유통기한</th>
                <th style="width:52px;">차량온도</th>
                <th style="width:52px;">표시사항</th>
                <th style="width:52px;">외관상태</th>
                <th style="width:52px;">차량청결</th>
                <th style="width:54px;">종합판정</th>
                <th style="width:94px;">비고</th>
              </tr>
            </thead>
            <tbody>
              ${bodyRowsHtml}
            </tbody>
          </table>

          <!-- 하단 이탈사항 표 (4행) -->
          <table class="dev-table">
            <thead>
              <tr>
                <th style="width:20%;">원재료명</th>
                <th style="width:24%;">이탈사항</th>
                <th style="width:36%;">조치내역 및 결과</th>
                <th style="width:10%;">완료일자</th>
                <th style="width:10%;">확인자</th>
              </tr>
            </thead>
            <tbody>
              ${devRowsHtml}
            </tbody>
          </table>

          <!-- 하단 점검 기준 각주 -->
          <div class="footnote">
            <div>1)농산물: 이물, 부패냉해, 표면건조, 고르기, 온동상태, 중량미달, 선도불량, 표시사항, 외관상태, 이미이취, 규격준수, 표면상태</div>
            <div>2)냉장제품: 온도상태, 중량부족, 이물혼입, 포장불량, 표시사항, 성상상태, 유통기한, 규격준수, 이미이취, 포장/제품상태, 차량온도체크(0 ~ 10˚C)</div>
            <div>3)냉동제품: 온도상태, 중량부족, 이물혼입, 포장불량, 표시사항, 성상상태, 유통기한, 규격준수, 이미이취, 포장/제품상태, 차량온도체크(-18˚C이하)</div>
            <div>4)상온제품: 온도상태, 중량부족, 이물혼입, 포장불량, 표시사항, 성상상태, 유통기한, 규격준수, 이미이취, 포장/제품상태</div>
            <div class="page-num">${pageNo} / ${totalPages}</div>
          </div>
        </section>
      `;
    })
    .join('');

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>원.부자재입고관리대장 (GFS-S-600-01)_${escapeHtml(options.writtenDate)}</title>
  <style>
    @page { size: A4 landscape; margin: 7mm 8mm; }
    * {
      box-sizing: border-box;
      font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body { margin: 0; padding: 8px; color: #111827; font-size: 10.5px; background: #fff; }
    .no-print {
      display: flex; justify-content: space-between; align-items: center;
      background: #0f172a; color: #fff; padding: 9px 14px; border-radius: 8px;
      margin-bottom: 10px; font-size: 12.5px;
    }
    .page-section { page-break-after: always; }
    .page-section:last-of-type { page-break-after: auto; }

    .header-table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
    .header-table td { padding: 0; vertical-align: middle; border: none; }
    .doc-meta-cell { width: 220px; }
    .doc-meta-inner { width: 100%; border-collapse: collapse; }
    .doc-meta-inner th, .doc-meta-inner td {
      border: 1px solid #111827; padding: 3px 6px; font-size: 10px; text-align: center;
    }
    .doc-meta-inner th { background: #f8fafc; font-weight: 700; width: 72px; }
    .title-cell {
      text-align: center !important; font-size: 20px; font-weight: 900;
      letter-spacing: 1px; border: 1px solid #111827 !important;
    }
    .sign-wrap-cell { width: 210px; }
    .sign-inner { width: 100%; border-collapse: collapse; }
    .sign-inner th, .sign-inner td {
      border: 1px solid #111827; text-align: center; font-size: 10px; padding: 2px 4px;
    }
    .sign-inner th { background: #f8fafc; font-weight: 700; width: 62px; }

    .meta-bar {
      display: flex; justify-content: space-between; align-items: center;
      font-size: 10.5px; font-weight: 700; margin: 4px 0;
    }
    .meta-right { display: flex; gap: 18px; }

    .main-table, .dev-table { width: 100%; border-collapse: collapse; }
    .main-table th, .main-table td, .dev-table th, .dev-table td {
      border: 1px solid #111827; padding: 3px 4px; font-size: 10px; vertical-align: middle;
    }
    .main-table th, .dev-table th {
      background: #f1f5f9; font-weight: 800; text-align: center; white-space: nowrap;
    }
    .data-row td { height: 22px; }
    .dev-table { margin-top: 6px; }
    .dev-row td { height: 20px; }

    .c { text-align: center; white-space: nowrap; }
    .r { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9.5px; }
    .name-cell { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 185px; }
    .spec-cell { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 88px; }
    .remark-cell { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 94px; }

    .judge-selected { font-weight: 900; color: #047857; text-decoration: underline; }
    .judge-fail { font-weight: 900; color: #dc2626; text-decoration: underline; }
    .judge-dim { color: #94a3b8; }

    .footnote { margin-top: 6px; font-size: 9px; line-height: 1.45; color: #1e293b; }
    .page-num { text-align: center; font-size: 10px; font-weight: 700; margin-top: 2px; }

    @media print {
      .no-print { display: none !important; }
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="no-print">
    <div>
      <b>📋 원·부자재 입고관리대장 (GFS-S-600-01)</b>
      <span style="margin-left:10px;font-size:11px;color:#cbd5e1;">작성일 ${escapeHtml(writtenDateKo)} · 총 ${items.length}품목 · ${totalPages}페이지</span>
    </div>
    <div style="display:flex;gap:8px;">
      <button onclick="window.print()" style="padding:6px 14px;border:none;border-radius:6px;background:#2563eb;color:#fff;font-weight:800;cursor:pointer;">인쇄 / PDF 저장</button>
      <button onclick="window.close()" style="padding:6px 12px;border:none;border-radius:6px;background:#475569;color:#fff;font-weight:700;cursor:pointer;">닫기</button>
    </div>
  </div>
  ${pagesHtml}
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 400);
    };
  </script>
</body>
</html>`;
}


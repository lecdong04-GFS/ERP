import * as XLSX from 'xlsx';
import { kstToday } from '@/lib/kst';

export interface ExcelColumnDef {
  key: string;
  label: string;
  format?: 'number' | 'currency' | 'date' | 'percent' | string;
}

export interface ExportGridOptions {
  filename: string;
  sheetName?: string;
  columns: ExcelColumnDef[];
  data: any[];
}

/**
 * 전 화면 공통 그리드 데이터 엑셀(.xlsx) 내보내기 유틸리티
 */
export function exportGridToExcel({
  filename,
  sheetName = 'Sheet1',
  columns,
  data,
}: ExportGridOptions): void {
  if (!data || data.length === 0) {
    alert('내보낼 데이터가 없습니다.');
    return;
  }

  // 1. 헤더 레이블 정제 (예: "품명" -> "품명")
  const cleanLabel = (label: string): string => {
    return label.replace(/[◇♦Y\s]+$/, '').trim();
  };

  // 2. 엑셀 행 데이터 변환
  const exportRows = data.map((row, idx) => {
    const formattedRow: Record<string, any> = {};
    columns.forEach((col) => {
      const header = cleanLabel(col.label) || col.key;
      let val = row[col.key];

      // 포맷팅 처리
      if (col.format === 'currency' || col.format === 'number') {
        formattedRow[header] = typeof val === 'number' ? val : Number(val) || 0;
      } else if (col.format === 'date' && val) {
        formattedRow[header] = String(val);
      } else {
        formattedRow[header] = val !== undefined && val !== null ? val : '';
      }
    });
    return formattedRow;
  });

  // 3. 워크북 생성
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(exportRows);

  // 4. 컬럼 너비 자동 계산
  const colWidths = columns.map((col) => {
    const header = cleanLabel(col.label);
    const maxLen = Math.max(
      header.length * 2,
      ...data.slice(0, 50).map((r) => String(r[col.key] || '').length)
    );
    return { wch: Math.min(Math.max(maxLen + 2, 10), 40) };
  });
  ws['!cols'] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  // 5. 파일 다운로드 실행
  const dateStr = kstToday().replace(/-/g, '');
  const finalFilename = filename.endsWith('.xlsx')
    ? filename
    : `${filename}_${dateStr}.xlsx`;

  XLSX.writeFile(wb, finalFilename);
}

/**
 * 엑셀 업로드용 표준 템플릿 파일 다운로드 유틸리티
 */
export function downloadExcelTemplate(
  filename: string,
  headers: string[],
  sampleRows: Record<string, any>[] = []
): void {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(sampleRows, { header: headers });

  // 컬럼 너비 설정
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length * 2 + 4, 14) }));

  XLSX.utils.book_append_sheet(wb, ws, '양식');
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}


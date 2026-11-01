'use client';

import React, { useState, useEffect } from 'react';
import { useColumnResize, ResizeHandle } from '@/components/common/useColumnResize';

export interface PurchaseGridColumnDef {
  key: string;
  label: string;
  width?: string;
  minWidth?: string;
  align?: 'left' | 'center' | 'right';
  format?: 'text' | 'number' | 'currency' | 'date' | 'checkbox';
  editable?: boolean;
  sticky?: boolean;
  leftOffset?: string;
  warehouseDropdown?: boolean;
  haccpToggle?: boolean;
  datePicker?: boolean;
  highlight?: boolean;
  dangerIfNegative?: boolean;
  badgeCondition?: (val: any) => string | null;
  render?: (val: any, row?: any, index?: number) => React.ReactNode;
}

interface PurchaseDataGridProps {
  columns: PurchaseGridColumnDef[];
  data: Record<string, any>[];
  selectedRowId?: string | number | null;
  onSelectRow?: (row: any) => void;
  onRowClick?: (row: any) => void;
  onRowChange?: (rowId: any, key: string, value: any) => void;
  onCellChange?: (rowId: any, key: string, value: any) => void;
  onRowContextMenu?: (e: React.MouseEvent, row: any, index: number) => void;
  showSummary?: boolean;
  summaryData?: Record<string, string | number>;
  summaryRowTitle?: string;
  maxHeight?: string;
  emptyText?: string;
}

const WAREHOUSE_OPTIONS = ['냉장1', '냉장2', '냉동', '상온', '부자재'];

export const PurchaseDataGrid: React.FC<PurchaseDataGridProps> = ({
  columns,
  data,
  selectedRowId,
  onSelectRow,
  onRowClick,
  onRowChange,
  onCellChange,
  onRowContextMenu,
  showSummary = true,
  summaryData,
  summaryRowTitle = '합계',
  maxHeight = '100%',
  emptyText = '조회된 내역이 없습니다.',
}) => {
  const triggerRowSelect = onRowClick || onSelectRow;
  const triggerCellChange = onCellChange || onRowChange;
  const [gridData, setGridData] = useState(data);
  const { columnWidths, startResizing, getColWidth } = useColumnResize();
  useEffect(() => {
    setGridData(data);
  }, [data]);

  const [editingCell, setEditingCell] = useState<{ rowId: string | number; colKey: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  const startEditing = (rowId: string | number, colKey: string, currentVal: any, col: PurchaseGridColumnDef) => {
    if (col.format === 'checkbox' || col.editable === false) return;
    setEditingCell({ rowId, colKey });
    setEditValue(currentVal !== undefined && currentVal !== null ? String(currentVal) : '');
  };

  const saveEdit = (rowId: string | number, colKey: string) => {
    const col = columns.find((c) => c.key === colKey);
    const parsedVal =
      col?.format === 'number' || col?.format === 'currency'
        ? editValue === '' ? 0 : Number(editValue.replace(/,/g, '')) || 0
        : editValue;

    setGridData((prev) =>
      prev.map((r: any, idx: number) => {
        const match = (r.id !== undefined && r.id === rowId) || idx === rowId;
        return match ? { ...r, [colKey]: parsedVal } : r;
      })
    );

    onCellChange?.(rowId, colKey, parsedVal);
    onRowChange?.(rowId, colKey, parsedVal);
    setEditingCell(null);
  };

  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  // Calculate auto summary for numeric/currency columns
  const computedSummary: Record<string, number> = {};
  if (showSummary && !summaryData) {
    columns.forEach((col) => {
      if (col.format === 'number' || col.format === 'currency') {
        const sum = gridData.reduce((acc, row) => {
          const val = Number(row[col.key]);
          return isNaN(val) ? acc : acc + val;
        }, 0);
        computedSummary[col.key] = sum;
      }
    });
  }

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const sortedData = React.useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];
      if (valA === valB) return 0;
      if (valA === undefined || valA === null) return 1;
      if (valB === undefined || valB === null) return -1;
      const res = valA > valB ? 1 : -1;
      return sortAsc ? res : -res;
    });
  }, [data, sortKey, sortAsc]);

  const formatCellValue = (val: any, col: PurchaseGridColumnDef, row: any) => {
    if (col.render) {
      return col.render(val, row);
    }

    if (col.format === 'checkbox') {
      return (
        <input
          type="checkbox"
          checked={!!val}
          onChange={(e) => triggerCellChange?.(row.id, col.key, e.target.checked)}
          onClick={(e) => e.stopPropagation()}
          className="cursor-pointer"
        />
      );
    }

    // HACCP Toggle (O / X)
    if (col.haccpToggle) {
      const isO = val === 'O' || !val;
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRowChange?.(row.id, col.key, isO ? 'X' : 'O');
          }}
          className={`px-2 py-0.5 font-bold text-[11.5px] border rounded transition-colors ${
            isO
              ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
              : 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100'
          }`}
          title="클릭하여 O/X 변경"
        >
          {val || 'O'}
        </button>
      );
    }

    // Warehouse Dropdown
    if (col.warehouseDropdown) {
      return (
        <select
          value={val || '상온보관고'}
          onChange={(e) => onRowChange?.(row.id, col.key, e.target.value)}
          onClick={(e) => e.stopPropagation()}
          className="w-full text-[12px] px-1.5 py-0.5 border border-blue-400 bg-white text-gray-800 focus:outline-none"
        >
          {WAREHOUSE_OPTIONS.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      );
    }

    // DatePicker Inline Edit
    if (col.datePicker) {
      return (
        <input
          type="date"
          value={val || ''}
          onChange={(e) => onRowChange?.(row.id, col.key, e.target.value)}
          onClick={(e) => e.stopPropagation()}
          className="w-full text-[10px] px-1 py-0.5 border border-blue-400 bg-white text-gray-800 focus:outline-none"
        />
      );
    }

    // Editable text or number input
    if (col.editable) {
      return (
        <input
          type={col.format === 'number' || col.format === 'currency' ? 'number' : 'text'}
          value={val ?? ''}
          onChange={(e) =>
            onRowChange?.(
              row.id,
              col.key,
              col.format === 'number' || col.format === 'currency'
                ? Number(e.target.value)
                : e.target.value
            )
          }
          onClick={(e) => e.stopPropagation()}
          className="w-full px-1 py-0.5 text-[11px] border border-blue-400 bg-blue-50/40 text-right focus:bg-white focus:outline-none"
        />
      );
    }

    if (val === undefined || val === null || val === '') return '';

    // Numeric checks (음수 붉은색 강조: text-red-600 font-semibold)
    const num = Number(val);
    const isNegative = !isNaN(num) && num < 0;

    let displayStr = val;
    if (col.format === 'currency') {
      displayStr = !isNaN(num) ? num.toLocaleString() : val;
    } else if (col.format === 'number') {
      displayStr = !isNaN(num) ? num.toLocaleString() : val;
    }

    if (isNegative || col.dangerIfNegative && isNegative) {
      return (
        <span className="text-red-600 font-semibold tracking-tight">
          {displayStr}
        </span>
      );
    }

    // Badge condition (e.g. for Expiry Status warning)
    if (col.badgeCondition) {
      const badgeStyle = col.badgeCondition(val);
      if (badgeStyle) {
        return (
          <span className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-bold ${badgeStyle}`}>
            {displayStr}
          </span>
        );
      }
    }

    return displayStr;
  };

  return (
    <div
      className="flex flex-col flex-1 min-h-0 bg-white border border-gray-400 shadow-2xs overflow-hidden select-text text-[12.5px]"
      style={{ maxHeight }}
    >
      <div className="flex-1 overflow-auto">
        <table className="w-full min-w-full border-collapse text-[12.5px] font-sans">
          {/* Table Header: 연보라/청보라 배경 #c5c9f7 */}
          <thead className="sticky top-0 z-20 bg-[#eef2f7] text-gray-900 shadow-xs border-b border-[#dbe3ee]">
            <tr className="h-[32px]">
              <th className="w-10 px-1.5 py-1.5 border-r border-[#dbe3ee] text-center font-bold text-gray-800 bg-[#e8edf4] sticky left-0 z-30 text-[11px]">
                No
              </th>
              {columns.map((col) => {
                const colWidth = getColWidth(col.key, col.width, col.minWidth);
                return (
                  <th
                    key={col.key}
                    style={{
                      width: colWidth,
                      minWidth: columnWidths[col.key] ? `${columnWidths[col.key]}px` : (col.minWidth || col.width),
                      left: col.sticky ? col.leftOffset : undefined,
                    }}
                    onClick={() => handleSort(col.key)}
                    className={`relative px-2.5 py-1.5 border-r border-[#dbe3ee] font-bold text-gray-800 whitespace-nowrap cursor-pointer hover:bg-[#b5b9ea] transition-colors select-none text-[12.5px] ${
                      col.sticky ? 'sticky z-30 bg-[#e8edf4]' : ''
                    } ${
                      col.align === 'right'
                        ? 'text-right'
                        : col.align === 'center'
                        ? 'text-center'
                        : 'text-left'
                    }`}
                  >
                    <div className="flex items-center justify-center">
                      <span className="truncate">{col.label}</span>
                    </div>
                    <ResizeHandle onMouseDown={(e) => startResizing(col.key, e)} />
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Table Body */}
          <tbody>
            {sortedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="py-10 text-center text-gray-400 text-[13px] italic bg-white"
                >
                  {emptyText}
                </td>
              </tr>
            ) : (
              sortedData.map((row, index) => {
                const isSelected = selectedRowId !== undefined && selectedRowId === row.id;

                return (
                  <tr
                    key={row.id ?? index}
                    onClick={() => triggerRowSelect?.(row)}
                    onContextMenu={(e) => onRowContextMenu?.(e, row, index)}
                    className={`h-[28px] border-b border-gray-200 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[#dbeafe] hover:bg-[#bfdbfe] text-blue-950 font-medium'
                        : index % 2 === 1
                        ? 'bg-[#f8fafc] hover:bg-[#eef2f6]'
                        : 'bg-white hover:bg-[#eef2f6]'
                    }`}
                  >
                    {/* Sticky No */}
                    <td className="px-1.5 py-1 border-r border-gray-200 text-center text-gray-500 font-mono text-[11px] bg-[#f8fafc] sticky left-0 z-10">
                      {index + 1}
                    </td>

                    {/* Data Cells */}
                    {columns.map((col) => {
                      const num = Number(row[col.key]);
                      const isNegative = !isNaN(num) && num < 0;

                      const colWidth = getColWidth(col.key, col.width, col.minWidth);

                      return (
                        <td
                          key={col.key}
                          style={{
                            width: colWidth,
                            minWidth: columnWidths[col.key] ? `${columnWidths[col.key]}px` : (col.minWidth || col.width),
                            left: col.sticky ? col.leftOffset : undefined,
                          }}
                          onClick={(e) => {
                            if (col.format !== 'checkbox' && col.editable !== false) {
                              e.stopPropagation();
                              startEditing(row.id !== undefined ? row.id : index, col.key, row[col.key], col);
                            }
                          }}
                          className={`px-2.5 py-1 border-r border-gray-200 whitespace-nowrap text-[12.5px] cursor-text hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 transition-colors ${
                            col.sticky
                              ? 'sticky z-10 ' + (isSelected ? 'bg-[#dbeafe]' : 'bg-[#f8fafc]')
                              : ''
                          } ${
                            col.highlight ? 'bg-[#f0f7ff]' : ''
                          } ${
                            col.align === 'right'
                              ? 'text-right font-mono'
                              : col.align === 'center'
                              ? 'text-center'
                              : 'text-left'
                          }`}
                        >
                          {editingCell?.rowId === (row.id !== undefined ? row.id : index) && editingCell?.colKey === col.key ? (
                          <input
                            autoFocus
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => saveEdit(row.id !== undefined ? row.id : index, col.key)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEdit(row.id !== undefined ? row.id : index, col.key);
                              else if (e.key === 'Escape') setEditingCell(null);
                            }}
                            className="w-full h-full min-h-[24px] bg-white text-gray-900 border-2 border-blue-600 rounded-none px-1.5 py-0.5 text-[12.5px] outline-none shadow-inner"
                            onClick={(e) => e.stopPropagation()}
                            onFocus={(e) => e.target.select()}
                          />
                        ) : (
                          formatCellValue(row[col.key], col, row)
                        )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>

          {/* Fixed Summary Row: 연노란색 배경 #fdfde0 */}
          {showSummary && (
            <tfoot className="sticky bottom-0 z-20 bg-[#fdfde0] border-t-2 border-[#b5b9ea] text-gray-900 font-bold shadow-xs">
              <tr className="h-[30px]">
                <td className="px-1.5 py-1.5 border-r border-gray-300 text-center font-bold text-gray-700 bg-[#f7f7ce] sticky left-0 z-30 text-[11.5px]">
                  합계
                </td>
                {columns.map((col, idx) => {
                  const sumVal = summaryData
                    ? summaryData[col.key]
                    : computedSummary[col.key];

                  const num = Number(sumVal);
                  const isNegative = !isNaN(num) && num < 0;

                  return (
                    <td
                      key={col.key}
                      style={{
                        left: col.sticky ? col.leftOffset : undefined,
                      }}
                      className={`px-2.5 py-1.5 border-r border-gray-300 whitespace-nowrap text-[12px] ${
                        col.sticky ? 'sticky z-30 bg-[#fdfde0]' : ''
                      } ${
                        col.align === 'right'
                          ? 'text-right font-mono ' +
                            (isNegative ? 'text-red-600 font-bold' : 'text-blue-900')
                          : col.align === 'center'
                          ? 'text-center'
                          : 'text-left'
                      }`}
                    >
                      {idx === 0 && !sumVal ? (
                        <span className="text-gray-500 font-normal">전체 집계</span>
                      ) : sumVal !== undefined && sumVal !== null ? (
                        typeof sumVal === 'number'
                          ? sumVal.toLocaleString()
                          : sumVal
                      ) : (
                        ''
                      )}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};


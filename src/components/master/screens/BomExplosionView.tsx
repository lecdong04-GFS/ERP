'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { MasterActionBar } from '../common/MasterActionBar';
import { MasterDataGrid, MasterGridColumnDef } from '../common/MasterDataGrid';
import { Layers } from 'lucide-react';
import { ProductLifecycleBadge } from '@/components/common/ProductLifecycleBadge';

interface BomTreeNode {
  id: string;
  name: string;
  code: string;
  count: number;
  category?: string;
  parentBomId?: string;
  status?: string;
  discontinuedDate?: string;
  isUsed?: boolean;
  children?: BomTreeNode[];
}

interface ExplosionRow {
  id: number;
  bomId: string;
  detailNodeId?: string;
  parentCategory: string;
  partId: string;
  category: string;
  partName: string;
  partSpec: string;
  partUnit: string;
  level: number;
  lv1: string;
  lv2: string;
  lv3: string;
  lv4: string;
  lv5: string;
  lv6: string;
  lv7: string;
  status?: string;
  discontinuedDate?: string;
  isUsed?: boolean;
}

export const BomExplosionView: React.FC = () => {
  const [varietyFilter, setVarietyFilter] = useState('ALL');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [treeData, setTreeData] = useState<BomTreeNode[]>([]);
  const [explosionRows, setExplosionRows] = useState<ExplosionRow[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [selectedNodeId, setSelectedNodeId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const loadBomExplosion = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/master/bom');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const newTrees: BomTreeNode[] = json.data.map((b: any, idx: number) => {
          const bomKey = `BOM-${b.id || idx}`;
          return {
            id: bomKey,
            name: b.parentProduct?.name || '제품',
            code: b.parentProduct?.productCode || '',
            category: b.parentProduct?.category || '완성품',
            parentBomId: bomKey,
            count: b.details?.length || 0,
            status: b.parentProduct?.status || '정상',
            discontinuedDate: b.parentProduct?.discontinuedDate || '',
            isUsed: b.parentProduct?.isUsed !== false,
            children: (b.details || []).map((d: any, dIdx: number) => ({
              id: `MAT-${b.id || idx}-${d.id || dIdx}`,
              name: d.childProduct?.name || '자재',
              code: d.childProduct?.productCode || '',
              category: d.childProduct?.category || '원재료',
              parentBomId: bomKey,
              count: 0,
              status: d.childProduct?.status || '정상',
              discontinuedDate: d.childProduct?.discontinuedDate || '',
              isUsed: d.childProduct?.isUsed !== false,
            })),
          };
        });
        setTreeData(newTrees);
        if (newTrees.length > 0) {
          setSelectedNodeId((prev) =>
            prev && newTrees.some((t) => t.id === prev || t.children?.some((c) => c.id === prev))
              ? prev
              : newTrees[0].id,
          );
          setExpandedNodes((prev) =>
            Object.keys(prev).length > 0 ? prev : { [newTrees[0].id]: true },
          );
        } else {
          setSelectedNodeId('');
        }

        const dynamicRows: ExplosionRow[] = [];
        let rowSeq = 1;
        json.data.forEach((b: any, idx: number) => {
          const p = b.parentProduct;
          if (!p) return;
          const bomKey = `BOM-${b.id || idx}`;
          const pCat = p.category || '완성품';
          const pCode = p.productCode || `FG-${p.id}`;
          dynamicRows.push({
            id: rowSeq++,
            bomId: bomKey,
            parentCategory: pCat,
            partId: pCode,
            category: pCat,
            partName: p.name || '',
            partSpec: p.spec || '1ea',
            partUnit: p.unit || 'ea',
            level: 0,
            lv1: pCode,
            lv2: '',
            lv3: '',
            lv4: '',
            lv5: '',
            lv6: '',
            lv7: '',
            status: p.status || '정상',
            discontinuedDate: p.discontinuedDate || '',
            isUsed: p.isUsed !== false,
          });
          (b.details || []).forEach((d: any, dIdx: number) => {
            const cp = d.childProduct;
            if (!cp) return;
            const cCode = cp.productCode || `MAT-${cp.id}`;
            const lvl = Number(d.level) || 3;
            dynamicRows.push({
              id: rowSeq++,
              bomId: bomKey,
              detailNodeId: `MAT-${b.id || idx}-${d.id || dIdx}`,
              parentCategory: pCat,
              partId: cCode,
              category: cp.category || '원재료',
              partName: cp.name || '',
              partSpec: cp.spec || `${d.unitQty}${d.unit || 'g'}`,
              partUnit: d.unit || cp.unit || 'g',
              level: lvl,
              lv1: '',
              lv2: lvl <= 2 ? cCode : '',
              lv3: lvl >= 3 ? cCode : '',
              lv4: '',
              lv5: '',
              lv6: '',
              lv7: '',
              status: cp.status || '정상',
              discontinuedDate: cp.discontinuedDate || '',
              isUsed: cp.isUsed !== false,
            });
          });
        });
        setExplosionRows(dynamicRows);
      }
    } catch (err) {
      console.error('Failed to load BOM explosion data', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBomExplosion();
  }, [loadBomExplosion]);

  const filteredTreeData = useMemo(() => {
    const q = searchKeyword.trim().toLowerCase();
    return treeData
      .filter((node) => {
        if (varietyFilter !== 'ALL' && (node.category || '완성품') !== varietyFilter) {
          return false;
        }
        if (!q) return true;
        const parentMatch =
          node.name.toLowerCase().includes(q) || node.code.toLowerCase().includes(q);
        const childMatch = (node.children || []).some(
          (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
        );
        return parentMatch || childMatch;
      })
      .map((node) => {
        if (!q) return node;
        const parentMatch =
          node.name.toLowerCase().includes(q) || node.code.toLowerCase().includes(q);
        if (parentMatch) return node;
        return {
          ...node,
          children: (node.children || []).filter(
            (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
          ),
        };
      });
  }, [treeData, varietyFilter, searchKeyword]);

  const { selectedBomKey, selectedDetailKey, selectedLabel } = useMemo(() => {
    if (!selectedNodeId) {
      return { selectedBomKey: '', selectedDetailKey: '', selectedLabel: '전체 BOM' };
    }
    const parentNode = treeData.find((t) => t.id === selectedNodeId);
    if (parentNode) {
      return {
        selectedBomKey: parentNode.id,
        selectedDetailKey: '',
        selectedLabel: parentNode.name,
      };
    }
    for (const parent of treeData) {
      const child = parent.children?.find((c) => c.id === selectedNodeId);
      if (child) {
        return {
          selectedBomKey: parent.id,
          selectedDetailKey: child.id,
          selectedLabel: `${parent.name} > ${child.name}`,
        };
      }
    }
    return { selectedBomKey: '', selectedDetailKey: '', selectedLabel: '전체 BOM' };
  }, [treeData, selectedNodeId]);

  const filteredExplosionRows = useMemo(() => {
    const q = searchKeyword.trim().toLowerCase();
    const validBomIds = new Set(filteredTreeData.map((n) => n.id));
    return explosionRows.filter((row) => {
      if (varietyFilter !== 'ALL' && row.parentCategory !== varietyFilter) {
        return false;
      }
      if (selectedBomKey) {
        if (row.bomId !== selectedBomKey) return false;
        if (selectedDetailKey && row.level > 0 && row.detailNodeId !== selectedDetailKey) {
          return false;
        }
      } else if (!validBomIds.has(row.bomId)) {
        return false;
      }
      if (q && row.level > 0 && !selectedBomKey) {
        return (
          row.partName.toLowerCase().includes(q) ||
          row.partId.toLowerCase().includes(q)
        );
      }
      if (q && selectedBomKey) {
        const parentNode = filteredTreeData.find((t) => t.id === selectedBomKey);
        const parentMatch =
          parentNode &&
          (parentNode.name.toLowerCase().includes(q) || parentNode.code.toLowerCase().includes(q));
        if (!parentMatch && row.level > 0) {
          return (
            row.partName.toLowerCase().includes(q) ||
            row.partId.toLowerCase().includes(q)
          );
        }
      }
      return true;
    });
  }, [explosionRows, filteredTreeData, varietyFilter, searchKeyword, selectedBomKey, selectedDetailKey]);

  const toggleNode = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes((prev) => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  const renderTree = (nodes: BomTreeNode[], depth = 0) => {
    return (
      <div className="flex flex-col">
        {nodes.map((node) => {
          const hasChildren = node.children && node.children.length > 0;
          const isExpanded = !!expandedNodes[node.id];
          const isSelected = selectedNodeId === node.id;

          return (
            <div key={node.id} className="flex flex-col select-none">
              <div
                onClick={() => setSelectedNodeId(node.id)}
                style={{ paddingLeft: `${depth * 14 + 6}px` }}
                className={`flex items-center justify-between py-1 px-1.5 cursor-pointer text-[11px] transition-colors ${
                  isSelected
                    ? 'bg-blue-100 text-blue-900 font-bold border-l-2 border-blue-600'
                    : 'text-gray-800 hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center gap-1 truncate">
                  {hasChildren ? (
                    <button
                      type="button"
                      onClick={(e) => toggleNode(node.id, e)}
                      className="p-0.5 text-gray-500 hover:text-black font-mono text-[9px] w-3.5 h-3.5 flex items-center justify-center border border-gray-300 rounded-2xs bg-white"
                    >
                      {isExpanded ? '⊟' : '⊞'}
                    </button>
                  ) : (
                    <span className="w-3.5 inline-block text-center text-gray-400">•</span>
                  )}
                  <span className="truncate">{node.name}</span>
                  <ProductLifecycleBadge
                    status={node.status}
                    discontinuedDate={node.discontinuedDate}
                    isUsed={node.isUsed}
                    name={node.name}
                    compact
                  />
                </div>
                {node.count > 0 && (
                  <span className="text-[10px] font-mono text-gray-500 font-semibold bg-gray-100 px-1 rounded">
                    ({node.count})
                  </span>
                )}
              </div>

              {hasChildren && isExpanded && (
                <div className="border-l border-gray-200 ml-2">
                  {renderTree(node.children!, depth + 1)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const COLUMNS: MasterGridColumnDef[] = [
    { key: 'partId', label: '파트id', width: '90px', align: 'center' },
    { key: 'category', label: '구분', width: '65px', align: 'center' },
    {
      key: 'partName',
      minWidth: '260px',
      label: '파트명',
      align: 'left',
      render: (val, row) => (
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="truncate font-medium text-gray-900">{String(val ?? '')}</span>
          <ProductLifecycleBadge
            status={row.status}
            discontinuedDate={row.discontinuedDate}
            isUsed={row.isUsed}
            name={String(val ?? '')}
            compact
          />
        </div>
      ),
    },
    { key: 'partSpec', label: '파트규격', width: '100px', align: 'center' },
    { key: 'partUnit', label: '파트단위', width: '60px', align: 'center' },
    { key: 'level', label: '레벨', width: '50px', align: 'center', format: 'number' },
    { key: 'lv1', label: 'Lv1', width: '70px', align: 'center' },
    { key: 'lv2', label: 'Lv2', width: '70px', align: 'center' },
    { key: 'lv3', label: 'Lv3', width: '70px', align: 'center' },
    { key: 'lv4', label: 'Lv4', width: '65px', align: 'center' },
    { key: 'lv5', label: 'Lv5', width: '65px', align: 'center' },
    { key: 'lv6', label: 'Lv6', width: '65px', align: 'center' },
    { key: 'lv7', label: 'Lv7', width: '65px', align: 'center' },
  ];

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px]">
      <MasterActionBar
        title="BOM(전개)"
        buttons={[
          { key: 'search', label: isLoading ? '조회중...' : '조회', icon: 'search', onClick: () => void loadBomExplosion() },
          {
            key: 'reset',
            label: '초기화',
            icon: 'reset',
            onClick: () => {
              setVarietyFilter('ALL');
              setSearchKeyword('');
              setSelectedNodeId('');
            },
          },
        ]}
        helpContent="완성품에서 시작하여 중간 반제품, 하위 원부자재까지 다단계 BOM 레벨(Lv1~Lv7)을 계층형 트리 및 매트릭스로 전개합니다."
      />

      <div className="bg-[#efefef] border-b border-[#c0c0c0] px-3 py-1 flex items-center justify-between shadow-inner">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="font-semibold text-gray-700">품종:</span>
            <select
              value={varietyFilter}
              onChange={(e) => {
                setVarietyFilter(e.target.value);
                setSelectedNodeId('');
              }}
              className="bg-white border border-gray-400 px-1.5 py-0.5 text-[12px] rounded-xs shadow-2xs focus:outline-blue-500 font-medium"
            >
              <option value="ALL">전체</option>
              <option value="완성품">완성품</option>
              <option value="반제품">반제품</option>
            </select>
          </div>

          <div className="flex items-center gap-1 pl-3 border-l border-gray-300">
            <span className="font-semibold text-gray-700">검색어:</span>
            <input
              type="text"
              placeholder="품번 또는 품명 입력"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="bg-white border border-gray-400 px-2 py-0.5 text-[12px] rounded-xs shadow-2xs w-44"
            />
          </div>
        </div>

        <span className="text-[11px] text-gray-600 bg-white px-2 py-0.5 rounded border border-gray-300 font-semibold shadow-2xs">
          전개 품목수: <span className="text-blue-700 font-bold">{filteredExplosionRows.length}</span> 건
        </span>
      </div>

      <div className="flex-1 flex min-h-0 p-2 gap-2">
        {/* Left: Hierarchical TreeView (25%) */}
        <div className="w-[300px] flex flex-col min-h-0 bg-white border border-[#94a3b8] rounded shadow-xs shrink-0">
          <div className="bg-[#dfe3ec] px-2.5 py-1 flex items-center justify-between border-b border-[#b0b8c8]">
            <span className="font-bold text-gray-800 flex items-center gap-1.5">
              <Layers size={13} className="text-blue-700" />
              제품 계층 트리 ({filteredTreeData.length})
            </span>
            <span className="text-[10px] text-gray-500 font-sans">⊞/⊟ 확장</span>
          </div>

          <div className="flex-1 min-h-0 overflow-auto p-1 bg-white">
            {renderTree(filteredTreeData)}
          </div>
        </div>

        {/* Right: Multi-Level Explosion Grid (75%) */}
        <div className="flex-1 flex flex-col min-h-0 bg-white border border-[#94a3b8] rounded shadow-xs">
          <div className="bg-[#dfe3ec] px-2.5 py-1 flex items-center justify-between border-b border-[#b0b8c8]">
            <span className="font-bold text-gray-800 truncate">
              소요원부자재 (다단계 전개 매트릭스) — {selectedLabel}
            </span>
            {selectedNodeId && (
              <button
                type="button"
                onClick={() => setSelectedNodeId('')}
                className="px-2 py-0.5 bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 font-medium rounded text-[11px] shrink-0"
              >
                전체 보기
              </button>
            )}
          </div>

          <div className="flex-1 min-h-0">
            <MasterDataGrid
              columns={COLUMNS}
              data={filteredExplosionRows}
              summaryRow={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
};


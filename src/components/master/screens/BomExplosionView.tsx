'use client';

import React, { useState, useEffect } from 'react';
import { MasterActionBar } from '../common/MasterActionBar';
import { MasterDataGrid, MasterGridColumnDef } from '../common/MasterDataGrid';
import { ChevronRight, ChevronDown, Plus, Layers } from 'lucide-react';

interface BomTreeNode {
  id: string;
  name: string;
  code: string;
  count: number;
  children?: BomTreeNode[];
}

interface ExplosionRow {
  id: number;
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
}

const BOM_TREE_DATA: BomTreeNode[] = [
  {
    id: 'TOP-1',
    name: '더큰)스팸2배계란볶음밥',
    code: '10003080',
    count: 9,
    children: [
      {
        id: 'MID-11',
        name: '스팸계란 볶음밥(반제품)',
        code: '20005010',
        count: 5,
        children: [
          { id: 'RAW-111', name: '국내산 경기미 햅쌀', code: '20000010', count: 0 },
          { id: 'RAW-112', name: '스팸 런천미트 큐브', code: '20194002', count: 0 },
          { id: 'RAW-113', name: '가공 전란액(계란)', code: '20194015', count: 0 },
          { id: 'RAW-114', name: '대파 슬라이스', code: '20194020', count: 0 },
          { id: 'RAW-115', name: '조미 볶음유지', code: '20194030', count: 0 },
        ],
      },
      {
        id: 'MID-12',
        name: '토핑용 계란후라이 포션',
        code: '20005020',
        count: 2,
        children: [
          { id: 'RAW-121', name: '계란후라이 반제', code: '20194018', count: 0 },
          { id: 'RAW-122', name: '식용유', code: '20194035', count: 0 },
        ],
      },
      { id: 'PKG-13', name: '사각 볶음밥용기 ET-25', code: '30000110', count: 0 },
      { id: 'PKG-14', name: '상단 수축 탑실링 필름', code: '30000120', count: 0 },
    ],
  },
  {
    id: 'TOP-2',
    name: '흑미밥 건강도시락',
    code: '10003090',
    count: 6,
    children: [
      {
        id: 'MID-21',
        name: '흑미밥(반제품)',
        code: '20005050',
        count: 3,
        children: [
          { id: 'RAW-211', name: '국내산 경기미 햅쌀', code: '20000010', count: 0 },
          { id: 'RAW-212', name: '찰흑미 원맥', code: '20000025', count: 0 },
          { id: 'RAW-213', name: '정제수', code: '20000099', count: 0 },
        ],
      },
      { id: 'PKG-22', name: '도시락 ET-30 용기', code: '30000101', count: 0 },
    ],
  },
];

const SAMPLE_EXPLOSION_DATA: ExplosionRow[] = [
  { id: 1, partId: '10003080', category: '완성품', partName: '더큰)스팸2배계란볶음밥', partSpec: '420g*1팩', partUnit: 'ea', level: 0, lv1: '10003080', lv2: '', lv3: '', lv4: '', lv5: '', lv6: '', lv7: '' },
  { id: 2, partId: '20005010', category: '반제품', partName: '스팸계란 볶음밥(반제품)', partSpec: '300g/포션', partUnit: 'kg', level: 1, lv1: '', lv2: '20005010', lv3: '', lv4: '', lv5: '', lv6: '', lv7: '' },
  { id: 3, partId: '20000010', category: '원재료', partName: '국내산 경기미 햅쌀', partSpec: '20kg/포', partUnit: 'kg', level: 2, lv1: '', lv2: '', lv3: '20000010', lv4: '', lv5: '', lv6: '', lv7: '' },
  { id: 4, partId: '20194002', category: '원재료', partName: '스팸 런천미트 큐브', partSpec: '2kg*5팩', partUnit: 'kg', level: 2, lv1: '', lv2: '', lv3: '20194002', lv4: '', lv5: '', lv6: '', lv7: '' },
  { id: 5, partId: '20194015', category: '원재료', partName: '가공 전란액(계란)', partSpec: '10kg/통', partUnit: 'kg', level: 2, lv1: '', lv2: '', lv3: '20194015', lv4: '', lv5: '', lv6: '', lv7: '' },
  { id: 6, partId: '20194020', category: '원재료', partName: '대파 슬라이스', partSpec: '5kg/봉', partUnit: 'kg', level: 2, lv1: '', lv2: '', lv3: '20194020', lv4: '', lv5: '', lv6: '', lv7: '' },
  { id: 7, partId: '20005020', category: '반제품', partName: '토핑용 계란후라이 포션', partSpec: '60g*1ea', partUnit: 'ea', level: 1, lv1: '', lv2: '20005020', lv3: '', lv4: '', lv5: '', lv6: '', lv7: '' },
  { id: 8, partId: '20194018', category: '원재료', partName: '계란후라이 반제', partSpec: '50ea*4줄', partUnit: 'ea', level: 2, lv1: '', lv2: '', lv3: '20194018', lv4: '', lv5: '', lv6: '', lv7: '' },
  { id: 9, partId: '30000110', category: '부재료', partName: '사각 볶음밥용기 ET-25', partSpec: '50ea*2줄', partUnit: 'box', level: 1, lv1: '', lv2: '30000110', lv3: '', lv4: '', lv5: '', lv6: '', lv7: '' },
  { id: 10, partId: '30000120', category: '부재료', partName: '상단 수축 탑실링 필름', partSpec: '1000m/롤', partUnit: '롤', level: 1, lv1: '', lv2: '30000120', lv3: '', lv4: '', lv5: '', lv6: '', lv7: '' },
];

export const BomExplosionView: React.FC = () => {
  const [varietyFilter, setVarietyFilter] = useState('완성품');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [treeData, setTreeData] = useState<BomTreeNode[]>(BOM_TREE_DATA);
  const [explosionRows, setExplosionRows] = useState<ExplosionRow[]>(SAMPLE_EXPLOSION_DATA);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    'TOP-1': true,
    'MID-11': true,
    'MID-12': true,
    'TOP-2': false,
  });
  const [selectedNodeId, setSelectedNodeId] = useState<string>('TOP-1');

  useEffect(() => {
    fetch('/api/master/bom')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data && json.data.length > 0) {
          const newTrees: BomTreeNode[] = json.data.map((b: any, idx: number) => ({
            id: `BOM-${b.id || idx}`,
            name: b.parentProduct?.name || '제품',
            code: b.parentProduct?.productCode || '',
            count: b.details?.length || 0,
            children: (b.details || []).map((d: any, dIdx: number) => ({
              id: `MAT-${d.id || dIdx}`,
              name: d.childProduct?.name || '자재',
              code: d.childProduct?.productCode || '',
              count: 0,
            })),
          }));
          if (newTrees.length > 0) {
            setTreeData(newTrees);
            setSelectedNodeId(newTrees[0].id);
            setExpandedNodes({ [newTrees[0].id]: true });
          }

          const dynamicRows: ExplosionRow[] = [];
          let rowSeq = 1;
          for (const b of json.data) {
            const p = b.parentProduct;
            if (!p) continue;
            const pCode = p.productCode || `FG-${p.id}`;
            dynamicRows.push({
              id: rowSeq++,
              partId: pCode,
              category: p.category || '완성품',
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
            });
            for (const d of b.details || []) {
              const cp = d.childProduct;
              if (!cp) continue;
              const cCode = cp.productCode || `MAT-${cp.id}`;
              const lvl = Number(d.level) || 3;
              dynamicRows.push({
                id: rowSeq++,
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
              });
            }
          }
          if (dynamicRows.length > 0) {
            setExplosionRows(dynamicRows);
          }
        }
      })
      .catch((err) => console.error('Failed to load BOM explosion data', err));
  }, []);

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
    { key: 'partName', minWidth: '260px', label: '파트명', align: 'left' },
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
          { key: 'search', label: '조회', icon: 'search', onClick: () => alert('BOM 다단계 전개 조회 완료') },
          { key: 'reset', label: '초기화', icon: 'reset', onClick: () => alert('초기화 완료') },
        ]}
        helpContent="완성품에서 시작하여 중간 반제품, 하위 원부자재까지 다단계 BOM 레벨(Lv1~Lv7)을 계층형 트리 및 매트릭스로 전개합니다."
      />

      <div className="bg-[#efefef] border-b border-[#c0c0c0] px-3 py-1 flex items-center justify-between shadow-inner">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="font-semibold text-gray-700">품종:</span>
            <select
              value={varietyFilter}
              onChange={(e) => setVarietyFilter(e.target.value)}
              className="bg-white border border-gray-400 px-1.5 py-0.5 text-[12px] rounded-xs shadow-2xs focus:outline-blue-500 font-medium"
            >
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
          전개 품목수: <span className="text-blue-700 font-bold">{explosionRows.length}</span> 건
        </span>
      </div>

      <div className="flex-1 flex min-h-0 p-2 gap-2">
        {/* Left: Hierarchical TreeView (25%) */}
        <div className="w-[300px] flex flex-col min-h-0 bg-white border border-[#94a3b8] rounded shadow-xs shrink-0">
          <div className="bg-[#dfe3ec] px-2.5 py-1 flex items-center justify-between border-b border-[#b0b8c8]">
            <span className="font-bold text-gray-800 flex items-center gap-1.5">
              <Layers size={13} className="text-blue-700" />
              제품 계층 트리
            </span>
            <span className="text-[10px] text-gray-500 font-sans">⊞/⊟ 확장</span>
          </div>

          <div className="flex-1 min-h-0 overflow-auto p-1 bg-white">
            {renderTree(treeData)}
          </div>
        </div>

        {/* Right: Multi-Level Explosion Grid (75%) */}
        <div className="flex-1 flex flex-col min-h-0 bg-white border border-[#94a3b8] rounded shadow-xs">
          <div className="bg-[#dfe3ec] px-2.5 py-1 flex items-center justify-between border-b border-[#b0b8c8]">
            <span className="font-bold text-gray-800">소요원부자재 (다단계 전개 매트릭스)</span>
            <button
              type="button"
              onClick={() => alert('소요 원자재 추가')}
              className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded text-[11px] flex items-center gap-0.5 shadow-2xs"
            >
              <Plus size={11} /> 추가
            </button>
          </div>

          <div className="flex-1 min-h-0">
            <MasterDataGrid
              columns={COLUMNS}
              data={explosionRows}
              summaryRow={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
};


'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MasterActionBar } from '../common/MasterActionBar';
import { MasterDataGrid, MasterGridColumnDef } from '../common/MasterDataGrid';
import { exportGridToExcel, downloadExcelTemplate } from '@/lib/excelExport';
import { Plus, Trash2, Copy, Save, ChevronDown, ChevronUp, Search, X, Check, Layers, AlertCircle, RefreshCw } from 'lucide-react';

interface ProductItem {
  id: number;
  used: string;
  autoVendor: boolean;
  itemCode: string;
  category: string;
  variety: string;
  itemName: string;
  spec: string;
  unit: string;
  gyeName: string;
  vendor: string;
  safetyStock: number;
  moq: number;
  connectedCount: number;
  remark: string;
  unitPrice?: number;
}

export interface BomDetailItem {
  id: number;
  childProductId: number;
  partCode: string;
  category: string;
  partName: string;
  spec: string;
  unit: string;
  unitQty: number;
  yieldRate: number;
  unitPrice: number;
  calcCost: number;
  gyeName: string;
  remark: string;
}

const SAMPLE_PRODUCTS: ProductItem[] = [
  { id: 1, used: '사용', autoVendor: true, itemCode: '10001021', category: '완성품', variety: '김밥', itemName: '참치마요김밥(밥김)', spec: '230g*1줄', unit: 'ea', gyeName: '성형장(김밥)', vendor: '지에스리테일', safetyStock: 100, moq: 50, connectedCount: 6, remark: '대표 베스트셀러' },
  { id: 2, used: '사용', autoVendor: true, itemCode: '10001022', category: '완성품', variety: '김밥', itemName: '매콤제육김밥', spec: '240g*1줄', unit: 'ea', gyeName: '성형장(김밥)', vendor: '지에스리테일', safetyStock: 80, moq: 40, connectedCount: 0, remark: '' },
  { id: 3, used: '사용', autoVendor: true, itemCode: '10002015', category: '완성품', variety: '주먹밥', itemName: '참치마요삼각김밥', spec: '110g*1개', unit: 'ea', gyeName: '성형장(삼각김밥)', vendor: '지에스리테일', safetyStock: 300, moq: 100, connectedCount: 5, remark: 'GS리테일 삼각 대표' },
  { id: 4, used: '사용', autoVendor: true, itemCode: '10002018', category: '완성품', variety: '주먹밥', itemName: '전주비빔삼각김밥', spec: '115g*1개', unit: 'ea', gyeName: '성형장(삼각김밥)', vendor: '지에스리테일', safetyStock: 250, moq: 100, connectedCount: 4, remark: '비빔 소스 투입' },
  { id: 5, used: '사용', autoVendor: true, itemCode: '10003050', category: '완성품', variety: '도시락', itemName: '11가지찬많은도시락', spec: '460g*1팩', unit: 'ea', gyeName: '성형장(도시락)', vendor: '지에스리테일', safetyStock: 150, moq: 50, connectedCount: 14, remark: '정식 도시락 1위' },
  { id: 6, used: '사용', autoVendor: true, itemCode: '10004011', category: '완성품', variety: '샌드위치', itemName: '듬뿍에그샐러드샌드', spec: '180g*1개', unit: 'ea', gyeName: '성형장(샌드위치)', vendor: '지에스리테일', safetyStock: 100, moq: 40, connectedCount: 2, remark: '빵류' },
  { id: 7, used: '사용', autoVendor: true, itemCode: '10005008', category: '완성품', variety: '조리면', itemName: '우삼겹김치볶음우동', spec: '350g*1팩', unit: 'ea', gyeName: '성형장(조리면)', vendor: '지에스리테일', safetyStock: 80, moq: 30, connectedCount: 5, remark: '면류 신제품' },
  { id: 8, used: '사용', autoVendor: true, itemCode: '10006004', category: '완성품', variety: '햄버거', itemName: '더블불고기버거', spec: '210g*1개', unit: 'ea', gyeName: '성형장(햄버거)', vendor: '지에스리테일', safetyStock: 120, moq: 50, connectedCount: 4, remark: '' },
];

export const ProductRegView: React.FC = () => {
  const [allChecked, setAllChecked] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('완성품');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [vendorFilter, setVendorFilter] = useState('ALL');
  const [audit, setAudit] = useState<any>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [products, setProducts] = useState<ProductItem[]>(SAMPLE_PRODUCTS);
  const [dirtyRowIds, setDirtyRowIds] = useState<Set<number>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  // --- BOM Master-Detail State ---
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [bomDetails, setBomDetails] = useState<BomDetailItem[]>([]);
  const [isBomOpen, setIsBomOpen] = useState(true);
  const [isBomLoading, setIsBomLoading] = useState(false);
  const [isBomSaving, setIsBomSaving] = useState(false);
  const [bomDirty, setBomDirty] = useState(false);

  // --- Modals State ---
  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [matSearch, setMatSearch] = useState('');
  const [matCatFilter, setMatCatFilter] = useState('전체');
  const [selectedMatIds, setSelectedMatIds] = useState<Set<number>>(new Set());

  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copySourceId, setCopySourceId] = useState<number | null>(null);
  const [copyPreviewDetails, setCopyPreviewDetails] = useState<any[]>([]);
  const [isCopyLoading, setIsCopyLoading] = useState(false);

  // Load Products from API
  useEffect(() => {
    fetch('/api/master/product')
      .then((res) => res.json())
      .then((res) => {
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          const mapped: ProductItem[] = res.data.map((p: any, idx: number) => ({
            id: p.id || idx + 1,
            used: '사용',
            autoVendor: true,
            itemCode: p.productCode,
            category: p.category || '완성품',
            variety: p.kind || '김밥',
            itemName: p.name,
            spec: p.spec || '230g*1줄',
            unit: p.unit || 'ea',
            gyeName: p.gyeName || '성형장(김밥)',
            vendor: p.partnerName || '지에스리테일',
            safetyStock: p.safetyStockQty || 100,
            moq: p.minOrderQty || 50,
            connectedCount: p.bomCount ?? 0,
            remark: '',
            unitPrice: p.prices?.[0]?.unitPrice || 0,
          }));
          setProducts(mapped);
          // Auto select first finished or semi product
          const firstTarget = mapped.find((m) => m.category === '완성품' || m.category === '반제품') || mapped[0];
          if (firstTarget) {
            setSelectedProduct(firstTarget);
            void loadBomForProduct(firstTarget.id, firstTarget.itemCode);
          }
        }
      })
      .catch((err) => console.error('Failed to load products from API:', err));
  }, []);

  // Fetch BOM for a given product
  const loadBomForProduct = async (productId: number, productCode?: string) => {
    setIsBomLoading(true);
    setBomDirty(false);
    try {
      const url = productId > 0 ? `/api/master/bom?productId=${productId}` : `/api/master/bom?productCode=${productCode}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        const header = json.data[0];
        const details: BomDetailItem[] = (header.details || []).map((d: any, idx: number) => {
          const child = d.childProduct;
          const price = child?.prices?.[0]?.unitPrice || 0;
          const uQty = Number(d.unitQty) || 0;
          const yRate = Number(d.yieldRate) || 100;
          const cost = Math.round(uQty * (yRate > 0 ? 100 / yRate : 1) * price * 10) / 10;
          return {
            id: d.id || -(idx + 1),
            childProductId: d.childProductId,
            partCode: child?.productCode || '',
            category: child?.category || '원재료',
            partName: child?.name || '자재',
            spec: child?.spec || '',
            unit: d.unit || child?.unit || 'g',
            unitQty: uQty,
            yieldRate: yRate,
            unitPrice: price,
            calcCost: cost,
            gyeName: d.gye?.name || child?.gye?.name || '성형장',
            remark: d.remark || '',
          };
        });
        setBomDetails(details);
      } else {
        setBomDetails([]);
      }
    } catch (err) {
      console.error('Failed to load BOM for product', err);
      setBomDetails([]);
    } finally {
      setIsBomLoading(false);
    }
  };

  // Row selection handler
  const handleSelectProduct = (product: ProductItem) => {
    if (selectedProduct?.id === product.id) return;
    if (bomDirty) {
      if (!confirm(`[${selectedProduct?.itemName}]의 변경된 BOM 레시피가 아직 저장되지 않았습니다.\n저장하지 않고 이동하시겠습니까?`)) {
        return;
      }
    }
    setSelectedProduct(product);
    void loadBomForProduct(product.id, product.itemCode);
    if (!isBomOpen) setIsBomOpen(true);
  };

  // 구분별 건수 + 이름겹침(완성품/자재 중복) 탐지
  const catCounts = useMemo(() => {
    const m: Record<string, number> = { 완성품: 0, 반제품: 0, 원재료: 0, 부자재: 0 };
    products.forEach((p) => {
      if (m[p.category] !== undefined) m[p.category] += 1;
    });
    return m;
  }, [products]);

  const dupNorms = useMemo(() => {
    const byNorm = new Map<string, Set<string>>();
    products.forEach((p) => {
      const k = p.itemName.replace(/\[.+?\]/g, '').replace(/\(.+?\)/g, '').replace(/[^가-힣a-zA-Z0-9]/g, '').toLowerCase();
      if (!k) return;
      if (!byNorm.has(k)) byNorm.set(k, new Set());
      byNorm.get(k)!.add(p.category);
    });
    const dups = new Set<string>();
    byNorm.forEach((cats, k) => {
      if (cats.size > 1) dups.add(k);
    });
    return dups;
  }, [products]);

  const normOf = (s: string) =>
    s.replace(/\[.+?\]/g, '').replace(/\(.+?\)/g, '').replace(/[^가-힣a-zA-Z0-9]/g, '').toLowerCase();

  // 품명 정본 대조 (엑셀 vs ERP)
  const handleNameAudit = async () => {
    setAuditLoading(true);
    try {
      const res = await fetch('/api/gfs/name-audit');
      const json = await res.json();
      if (json.success) {
        setAudit(json.data);
        setAuditOpen(true);
      } else {
        alert('대조 실패: ' + (json.error || '알 수 없는 오류'));
      }
    } catch (e: any) {
      alert('대조 중 오류: ' + e.message);
    } finally {
      setAuditLoading(false);
    }
  };

  const filteredProducts = products.filter((p) => {
    if (categoryFilter !== 'ALL' && p.category !== categoryFilter) return false;
    if (vendorFilter !== 'ALL' && p.vendor !== vendorFilter) return false;
    if (searchKeyword.trim() && !p.itemName.includes(searchKeyword.trim()) && !p.itemCode.includes(searchKeyword.trim())) {
      return false;
    }
    return true;
  });

  const handleCellChange = (id: any, key: string, val: any) => {
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          const numKeys = ['safetyStock', 'moq'];
          const finalVal = numKeys.includes(key) ? Number(val) || 0 : val;
          return { ...p, [key]: finalVal };
        }
        return p;
      })
    );
    setDirtyRowIds((prev) => new Set(prev).add(Number(id)));
  };

  const handleNew = () => {
    const newId = Date.now();
    const newItem: ProductItem = {
      id: newId,
      used: '사용',
      autoVendor: true,
      itemCode: String(10000000 + products.length + 1),
      category: '완성품',
      variety: '도시락',
      itemName: '신규 제품(입력)',
      spec: '규격입력',
      unit: 'ea',
      gyeName: '성형장(도시락)',
      vendor: '지에스리테일',
      safetyStock: 50,
      moq: 20,
      connectedCount: 0,
      remark: '',
    };
    setProducts((prev) => [newItem, ...prev]);
    setDirtyRowIds((prev) => new Set(prev).add(newId));
    setSelectedProduct(newItem);
    setBomDetails([]);
    setBomDirty(true);
    setIsBomOpen(true);
  };

  // Product Master Save
  const handleSave = async () => {
    if (dirtyRowIds.size === 0) {
      alert('수정된 품목 내역이 없습니다.');
      return;
    }

    setIsSaving(true);
    try {
      const targetProducts = products.filter((p) => dirtyRowIds.has(p.id));
      let bomEnsured = 0;
      for (const p of targetProducts) {
        const res = await fetch('/api/master/product', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productCode: p.itemCode,
            name: p.itemName,
            spec: p.spec,
            unit: p.unit,
            category: p.category,
            kind: p.variety,
            safetyStockQty: p.safetyStock,
            minOrderQty: p.moq,
            remark: p.remark,
          }),
        });
        const json = await res.json().catch(() => null);
        const savedId = json?.data?.id;
        if (json?.success && savedId && (p.category === '완성품' || p.category === '반제품')) {
          try {
            const chk = await fetch(`/api/master/bom?productId=${savedId}`).then((r) => r.json()).catch(() => null);
            if (chk?.success && Array.isArray(chk.data) && chk.data.length === 0) {
              await fetch('/api/master/bom', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  parentProductId: savedId,
                  version: '1.0',
                  effectiveDate: new Date().toISOString().slice(0, 10),
                  details: [],
                  remark: '신메뉴 자동생성',
                }),
              });
              bomEnsured += 1;
            }
          } catch {
            /* BOM 자동생성은 부가 기능이라 실패해도 저장 계속 */
          }
        }
      }
      setDirtyRowIds(new Set());
      alert(
        `총 ${targetProducts.length}건의 품목 마스터 정보가 데이터베이스에 성공적으로 저장되었습니다.` +
          (bomEnsured > 0 ? `\n신메뉴 BOM ${bomEnsured}건 자동생성(v1.0)` : '')
      );
    } catch (err: any) {
      alert('저장 중 오류 발생: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // --- BOM In-line Edit Handlers ---
  const handleBomCellChange = (rowId: any, columnKey: string, newValue: any) => {
    setBomDetails((prev) =>
      prev.map((d) => {
        if (d.id === rowId) {
          const updated = { ...d, [columnKey]: newValue };
          if (columnKey === 'unitQty' || columnKey === 'yieldRate') {
            const q = Number(columnKey === 'unitQty' ? newValue : updated.unitQty) || 0;
            const y = Number(columnKey === 'yieldRate' ? newValue : updated.yieldRate) || 100;
            const price = updated.unitPrice || 0;
            updated.calcCost = Math.round(q * (y > 0 ? 100 / y : 1) * price * 10) / 10;
          }
          return updated;
        }
        return d;
      })
    );
    setBomDirty(true);
  };

  const handleDeleteBomRow = (id: number) => {
    setBomDetails((prev) => prev.filter((d) => d.id !== id));
    setBomDirty(true);
  };

  // BOM Save
  const handleSaveBom = async () => {
    if (!selectedProduct) {
      alert('선택된 제품이 없습니다.');
      return;
    }
    setIsBomSaving(true);
    try {
      const res = await fetch('/api/master/bom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentProductId: selectedProduct.id,
          version: '1.0',
          effectiveDate: new Date().toISOString().slice(0, 10),
          details: bomDetails.map((d, idx) => ({
            childProductId: d.childProductId,
            childProductCode: d.partCode,
            childProductName: d.partName,
            unitQty: Number(d.unitQty) || 0,
            unit: d.unit || 'g',
            yieldRate: Number(d.yieldRate) || 100,
            sortOrder: idx + 1,
            remark: d.remark || '',
          })),
        }),
      });
      const json = await res.json();
      if (!json.success) {
        alert('BOM 저장 실패: ' + (json.error || '알 수 없는 오류'));
        return;
      }
      setBomDirty(false);
      // Update upper grid connected count
      setProducts((prev) =>
        prev.map((p) => (p.id === selectedProduct.id ? { ...p, connectedCount: bomDetails.length } : p))
      );
      setSelectedProduct((prev) => (prev ? { ...prev, connectedCount: bomDetails.length } : null));
      alert(`[${selectedProduct.itemName}] BOM 레시피 (${bomDetails.length}건)가 데이터베이스에 저장되었습니다.\n자재발주 및 제조원가 파이프라인에 즉시 반영됩니다.`);
    } catch (err: any) {
      alert('BOM 저장 중 오류: ' + err.message);
    } finally {
      setIsBomSaving(false);
    }
  };

  // Keyboard shortcut Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (bomDirty) {
          handleSaveBom();
        } else if (dirtyRowIds.size > 0) {
          handleSave();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [bomDirty, dirtyRowIds, selectedProduct, bomDetails, products]);

  // Available Materials for Picker (Raw materials, Sub materials, Semi products)
  const availableMaterials = useMemo(() => {
    return products.filter((p) => p.category === '원재료' || p.category === '부자재' || p.category === '반제품');
  }, [products]);

  const filteredMaterials = useMemo(() => {
    return availableMaterials.filter((m) => {
      if (matCatFilter !== '전체' && m.category !== matCatFilter) return false;
      if (matSearch.trim()) {
        const q = matSearch.trim().toLowerCase();
        return m.itemName.toLowerCase().includes(q) || m.itemCode.toLowerCase().includes(q);
      }
      return true;
    });
  }, [availableMaterials, matCatFilter, matSearch]);

  const handleAddSelectedMaterials = () => {
    if (selectedMatIds.size === 0) {
      alert('추가할 자재를 선택하세요.');
      return;
    }
    const toAdd = availableMaterials.filter((m) => selectedMatIds.has(m.id));
    let nextId = Date.now();
    const newItems: BomDetailItem[] = toAdd.map((m) => {
      const price = m.unitPrice || 0;
      return {
        id: nextId++,
        childProductId: m.id,
        partCode: m.itemCode,
        category: m.category,
        partName: m.itemName,
        spec: m.spec,
        unit: m.unit || 'g',
        unitQty: 1,
        yieldRate: 100,
        unitPrice: price,
        calcCost: price,
        gyeName: m.gyeName || '성형장',
        remark: '',
      };
    });
    setBomDetails((prev) => [...prev, ...newItems]);
    setBomDirty(true);
    setSelectedMatIds(new Set());
    setMaterialModalOpen(false);
  };

  // Handle Copy Recipe from another product
  const productsWithBom = useMemo(() => {
    return products.filter((p) => p.connectedCount > 0 && p.id !== selectedProduct?.id);
  }, [products, selectedProduct]);

  const handleSelectCopySource = async (srcId: number) => {
    setCopySourceId(srcId);
    setIsCopyLoading(true);
    try {
      const res = await fetch(`/api/master/bom?productId=${srcId}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        setCopyPreviewDetails(json.data[0].details || []);
      } else {
        setCopyPreviewDetails([]);
      }
    } catch {
      setCopyPreviewDetails([]);
    } finally {
      setIsCopyLoading(false);
    }
  };

  const handleApplyCopy = () => {
    if (!copySourceId || copyPreviewDetails.length === 0) {
      alert('복사할 원본 레시피가 없습니다.');
      return;
    }
    const srcProduct = products.find((p) => p.id === copySourceId);
    let nextId = Date.now();
    const copied: BomDetailItem[] = copyPreviewDetails.map((d: any) => {
      const child = d.childProduct;
      const price = child?.prices?.[0]?.unitPrice || 0;
      const uQty = Number(d.unitQty) || 0;
      const yRate = Number(d.yieldRate) || 100;
      const cost = Math.round(uQty * (yRate > 0 ? 100 / yRate : 1) * price * 10) / 10;
      return {
        id: nextId++,
        childProductId: d.childProductId,
        partCode: child?.productCode || '',
        category: child?.category || '원재료',
        partName: child?.name || '',
        spec: child?.spec || '',
        unit: d.unit || child?.unit || 'g',
        unitQty: uQty,
        yieldRate: yRate,
        unitPrice: price,
        calcCost: cost,
        gyeName: d.gye?.name || child?.gye?.name || '성형장',
        remark: `[${srcProduct?.itemName || ''}] 복사`,
      };
    });
    setBomDetails(copied);
    setBomDirty(true);
    setCopyModalOpen(false);
    alert(`[${srcProduct?.itemName}]의 레시피 (${copied.length}개 자재)가 복사되었습니다.\n필요한 투입량을 조정한 후 [BOM 저장]을 누르세요.`);
  };

  // Total calculated material cost for current BOM
  const totalBomCost = useMemo(() => {
    return bomDetails.reduce((sum, d) => sum + (d.calcCost || 0), 0);
  }, [bomDetails]);

  // Columns for Upper Grid
  const COLUMNS: MasterGridColumnDef[] = [
    { key: 'used', label: '사용', width: '55px', align: 'center', format: 'dropdown', options: ['사용', '미사용'] },
    { key: 'autoVendor', label: '자동거래처', width: '70px', align: 'center', format: 'checkbox' },
    { key: 'itemCode', label: '품번', width: '90px', align: 'center', editable: false },
    { key: 'category', label: '구분', width: '65px', align: 'center', format: 'dropdown', options: ['완성품', '반제품', '원재료', '부재료'] },
    { key: 'variety', label: '품종', width: '75px', align: 'center', format: 'dropdown', options: ['조리면', '샌드위치', '도시락', '주먹밥', '김밥', '햄버거'] },
    {
      key: 'itemName',
      minWidth: '240px',
      label: '품명',
      align: 'left',
      editable: true,
      render: (val, row) => {
        const isDup = dupNorms.has(normOf(String(row.itemName || '')));
        return (
          <span className="flex items-center gap-1.5">
            <span className="font-medium text-gray-800">{String(val ?? '')}</span>
            {isDup && (
              <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-300 whitespace-nowrap" title="같은 이름이 다른 구분에도 있음">
                중복
              </span>
            )}
          </span>
        );
      },
    },
    { key: 'spec', label: '규격', width: '90px', align: 'center', editable: true },
    { key: 'unit', label: '단위', width: '50px', align: 'center', editable: true },
    {
      key: 'connectedCount',
      label: 'BOM구성',
      width: '80px',
      align: 'center',
      editable: false,
      render: (val) => {
        const cnt = Number(val) || 0;
        return cnt > 0 ? (
          <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold border border-blue-300 text-[10.5px]">
            {cnt}개 자재
          </span>
        ) : (
          <span className="px-1.5 py-0.5 rounded text-gray-400 text-[10.5px]">
            미등록
          </span>
        );
      },
    },
    { key: 'gyeName', label: '계명칭', width: '100px', align: 'left' },
    { key: 'vendor', label: '거래처', width: '110px', align: 'left', editable: true },
    { key: 'safetyStock', label: '안전재고', width: '70px', align: 'right', format: 'number', editable: true },
    { key: 'moq', label: '최소주문', width: '70px', align: 'right', format: 'number', editable: true },
    { key: 'remark', label: '비고', width: '120px', align: 'left', editable: true },
  ];

  // Columns for Lower BOM Detail Grid
  const BOM_COLUMNS: MasterGridColumnDef[] = [
    {
      key: 'actions',
      label: '삭제',
      width: '45px',
      align: 'center',
      render: (_val, row) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleDeleteBomRow(row.id);
          }}
          className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
          title="이 자재 제거"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      ),
    },
    { key: 'category', label: '구분', width: '65px', align: 'center', editable: false },
    { key: 'partCode', label: '자재코드', width: '90px', align: 'center', editable: false },
    {
      key: 'partName',
      minWidth: '220px',
      label: '투입 자재명',
      align: 'left',
      editable: false,
      render: (val) => <span className="font-semibold text-gray-800">{String(val ?? '')}</span>,
    },
    { key: 'spec', label: '규격', width: '85px', align: 'center', editable: false },
    { key: 'unit', label: '단위', width: '50px', align: 'center', editable: true },
    { key: 'unitQty', label: '단위투입량', width: '90px', align: 'right', format: 'number', editable: true },
    { key: 'yieldRate', label: '수율(%)', width: '75px', align: 'right', format: 'number', editable: true },
    { key: 'unitPrice', label: '자재단가(원)', width: '85px', align: 'right', format: 'number', editable: false },
    {
      key: 'calcCost',
      label: '투입원가(원)',
      width: '90px',
      align: 'right',
      format: 'number',
      editable: false,
      render: (val) => <span className="font-mono font-bold text-blue-700">{Number(val || 0).toLocaleString()}원</span>,
    },
    { key: 'gyeName', label: '공정(계)', width: '95px', align: 'left', editable: true },
    { key: 'remark', label: '비고/배합메모', minWidth: '120px', align: 'left', editable: true },
  ];

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px]">
      {/* 1. Header Action Bar */}
      <MasterActionBar
        title="제품등록 (BOM 상세 통합)"
        buttons={[
          { key: 'new', label: '신규제품', icon: 'new', onClick: handleNew },
          { key: 'audit', label: auditLoading ? '대조 중...' : '정본대조', icon: 'search', onClick: handleNameAudit },
          { key: 'search', label: '새로고침', icon: 'search', onClick: () => window.location.reload() },
          {
            key: 'save',
            label: isSaving ? '저장 중...' : dirtyRowIds.size > 0 ? `제품저장 (${dirtyRowIds.size}건)` : '제품저장',
            icon: 'save',
            onClick: handleSave,
          },
          { key: 'reset', label: '초기화', icon: 'reset', onClick: () => setProducts(SAMPLE_PRODUCTS) },
          { key: 'upload', label: '엑셀업로드', icon: 'upload', onClick: () => alert('제품 엑셀 업로드 파일을 선택하세요.') },
          {
            key: 'template',
            label: '업로드양식',
            icon: 'template',
            onClick: () =>
              downloadExcelTemplate('제품_원부자재_등록양식', [
                '품목코드',
                '구분',
                '품종',
                '품목명',
                '규격',
                '단위',
                '과세구분',
                '소비기한(일)',
                '보관방법',
                '입고단가',
                '출하단가',
              ]),
          },
          {
            key: 'download',
            label: '엑셀다운로드',
            icon: 'download',
            onClick: () =>
              exportGridToExcel({
                filename: '제품_원부자재_마스터',
                sheetName: '품목마스터',
                columns: COLUMNS,
                data: filteredProducts,
              }),
          },
        ]}
        helpContent="제품 마스터와 해당 제품의 투입 원부자재 레시피(BOM)를 한 화면에서 즉시 작성하고 데이터베이스에 영구 저장합니다. 저장된 BOM은 자재발주, MRP 소요량 및 제조원가 파이프라인에 실시간 직결됩니다."
      />

      {/* 2. Filter Bar */}
      <div className="bg-[#efefef] border-b border-[#c0c0c0] px-3 py-1 flex flex-wrap items-center justify-between gap-3 shadow-inner shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1 cursor-pointer font-medium text-gray-700">
            <input
              type="checkbox"
              checked={allChecked}
              onChange={(e) => setAllChecked(e.target.checked)}
              className="rounded accent-blue-600"
            />
            전체
          </label>

          <div className="flex items-center gap-1 pl-3 border-l border-gray-300">
            <span className="font-semibold text-gray-700">구분:</span>
            <div className="flex items-center gap-0.5 bg-gray-200/70 p-0.5 rounded border border-gray-300">
              {['전체', '완성품', '반제품', '원재료', '부자재'].map((c) => {
                const key = c === '전체' ? 'ALL' : c;
                const isActive = categoryFilter === key;
                const cnt = c === '전체' ? products.length : catCounts[c] || 0;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategoryFilter(key)}
                    className={`px-2 py-0.5 text-[11px] font-bold rounded-xs whitespace-nowrap transition-colors ${
                      isActive ? 'bg-white text-blue-700 shadow-xs' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {c} <span className="font-mono">{cnt}</span>
                  </button>
                );
              })}
            </div>
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

          <div className="flex items-center gap-1 pl-3 border-l border-gray-300">
            <span className="font-semibold text-gray-700">거래처:</span>
            <select
              value={vendorFilter}
              onChange={(e) => setVendorFilter(e.target.value)}
              className="bg-white border border-gray-400 px-1.5 py-0.5 text-[12px] rounded-xs shadow-2xs focus:outline-blue-500"
            >
              <option value="ALL">ALL (전체)</option>
              <option value="지에스리테일">지에스리테일</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {dirtyRowIds.size > 0 && (
            <span className="text-[11px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded border border-amber-300 font-bold animate-pulse">
              제품수정 {dirtyRowIds.size}건
            </span>
          )}
          <span className="text-[11px] text-gray-600 bg-white px-2 py-0.5 rounded border border-gray-300 font-semibold shadow-2xs">
            조회: <span className="text-blue-700 font-bold">{filteredProducts.length}</span>건
          </span>
        </div>
      </div>

      {/* 3. Audit Alert (정본대조 결과창) */}
      {auditOpen && audit && (
        <div className="bg-amber-50 border-b border-amber-300 px-3 py-1.5 text-[12px] shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-bold text-gray-800">정본대조 (발주서 정본 기준)</span>
            <span>엑셀 자재 <strong className="text-blue-700">{audit.excelMaterials}</strong> · 메뉴 <strong className="text-blue-700">{audit.excelMenus}</strong> · ERP <strong className="text-blue-700">{audit.erpCount}</strong></span>
            <span>미등록 자재 <strong className="text-red-700">{audit.missingMaterials?.length ?? 0}</strong> · 미등록 메뉴 <strong className="text-red-700">{audit.missingMenus?.length ?? 0}</strong> · 엑셀외 ERP <strong className="text-gray-700">{audit.erpNotInExcel?.length ?? 0}</strong> · 이름겹침 <strong className="text-amber-700">{audit.dupNames?.length ?? 0}</strong></span>
            <button type="button" onClick={() => setAuditOpen(false)} className="ml-auto px-2 py-0.5 bg-white border border-gray-400 rounded text-[11px] hover:bg-gray-100">닫기</button>
          </div>
          {(audit.missingMaterials?.length > 0 || audit.missingMenus?.length > 0) && (
            <div className="mt-1 grid grid-cols-2 gap-2 max-h-[120px] overflow-auto">
              <div className="bg-white border border-gray-300 rounded p-1.5">
                <div className="font-bold text-[11px] text-red-700 mb-0.5">미등록 자재 (BOM 일괄적재로 생성 가능)</div>
                <div className="text-[11px] text-gray-700 leading-relaxed">{audit.missingMaterials.slice(0, 50).join(' / ')}{audit.missingMaterials.length > 50 ? ` 외 ${audit.missingMaterials.length - 50}건` : ''}</div>
              </div>
              <div className="bg-white border border-gray-300 rounded p-1.5">
                <div className="font-bold text-[11px] text-red-700 mb-0.5">미등록 메뉴 (BOM 일괄적재로 생성 가능)</div>
                <div className="text-[11px] text-gray-700 leading-relaxed">{audit.missingMenus.slice(0, 50).join(' / ')}{audit.missingMenus.length > 50 ? ` 외 ${audit.missingMenus.length - 50}건` : ''}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. Master-Detail Two-Pane Layout */}
      <div className="flex-1 min-h-0 p-2 flex flex-col gap-2 overflow-hidden">
        {/* Upper Pane: Product Grid */}
        <div
          className={`flex flex-col bg-white border border-[#94a3b8] rounded shadow-xs overflow-hidden transition-all duration-200 ${
            selectedProduct && isBomOpen ? 'h-[50%]' : 'h-full'
          }`}
        >
          <div className="bg-gradient-to-r from-slate-100 to-gray-100 border-b border-gray-300 px-3 py-1 flex items-center justify-between shrink-0">
            <span className="font-bold text-gray-800 text-[12px] flex items-center gap-1.5">
              <span>📋 제품 마스터 목록</span>
              <span className="text-[11px] font-normal text-gray-500">(행을 클릭하면 하단에 해당 제품의 상세 BOM 레시피가 펼쳐집니다)</span>
            </span>
            {selectedProduct && !isBomOpen && (
              <button
                type="button"
                onClick={() => setIsBomOpen(true)}
                className="px-2 py-0.5 bg-blue-600 text-white rounded text-[11px] font-bold hover:bg-blue-700 flex items-center gap-1 shadow-xs"
              >
                <ChevronDown className="w-3.5 h-3.5" />
                <span>[{selectedProduct.itemName}] BOM 열기</span>
              </button>
            )}
          </div>
          <div className="flex-1 min-h-0">
            <MasterDataGrid
              columns={COLUMNS}
              data={filteredProducts}
              selectedRowId={selectedProduct?.id}
              onRowClick={(row) => handleSelectProduct(row)}
              onCellChange={handleCellChange}
              summaryRow={false}
            />
          </div>
        </div>

        {/* Lower Pane: BOM Detail Recipe Editor */}
        {selectedProduct && (
          <div
            className={`flex flex-col bg-white border-2 border-blue-500/80 rounded shadow-md overflow-hidden transition-all duration-200 ${
              isBomOpen ? 'h-[50%]' : 'h-[36px]'
            }`}
          >
            {/* BOM Detail Toolbar */}
            <div className="bg-gradient-to-r from-blue-900 via-indigo-950 to-slate-900 text-white px-3 py-1.5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <Layers className="w-4 h-4 text-blue-300 shrink-0" />
                <span className="bg-blue-600 text-white text-[10px] font-extrabold px-1.5 py-0.2 rounded shrink-0">
                  {selectedProduct.category}
                </span>
                <span className="font-extrabold text-[13px] text-white tracking-tight truncate">
                  [{selectedProduct.itemCode}] {selectedProduct.itemName}
                </span>
                <span className="text-gray-300 text-[11px] shrink-0">
                  규격: <strong className="text-white">{selectedProduct.spec || '규격미지정'}</strong> ({selectedProduct.unit})
                </span>

                <div className="flex items-center gap-2 pl-2 border-l border-gray-600 shrink-0">
                  <span className="bg-blue-950/80 border border-blue-500/60 px-2 py-0.5 rounded text-[11px] font-bold text-blue-200">
                    투입자재: <strong className="text-white">{bomDetails.length}</strong>종
                  </span>
                  <span className="bg-emerald-950/80 border border-emerald-500/60 px-2 py-0.5 rounded text-[11px] font-bold text-emerald-300 font-mono">
                    단위투입원가: <strong>{totalBomCost.toLocaleString()}</strong>원
                  </span>
                  {bomDirty && (
                    <span className="bg-amber-500 text-black px-2 py-0.5 rounded text-[10.5px] font-black animate-pulse shadow-sm">
                      ● 미저장 변경사항
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons in BOM Toolbar */}
              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMatIds(new Set());
                    setMatSearch('');
                    setMaterialModalOpen(true);
                  }}
                  className="px-2 py-0.5 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold text-[11px] flex items-center gap-1 shadow-xs transition-colors"
                  title="원부자재 마스터에서 투입 자재를 선택하여 추가합니다"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>자재추가</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCopySourceId(null);
                    setCopyPreviewDetails([]);
                    setCopyModalOpen(true);
                  }}
                  className="px-2 py-0.5 bg-indigo-700 hover:bg-indigo-600 text-white rounded font-bold text-[11px] flex items-center gap-1 shadow-xs transition-colors"
                  title="이미 레시피가 등록된 다른 제품의 BOM을 복사하여 빠르게 입력합니다"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>타제품 BOM 복사</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveBom}
                  disabled={isBomSaving}
                  className={`px-2.5 py-0.5 rounded font-black text-[11.5px] flex items-center gap-1 shadow-sm transition-all ${
                    bomDirty
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-black ring-2 ring-emerald-300'
                      : 'bg-emerald-700 hover:bg-emerald-600 text-white'
                  }`}
                  title="BOM 상세 레시피를 데이터베이스에 즉시 저장합니다 (단축키 Ctrl+S)"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isBomSaving ? '저장중...' : 'BOM 저장 (Ctrl+S)'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsBomOpen(!isBomOpen)}
                  className="p-1 bg-white/10 hover:bg-white/20 text-white rounded transition-colors"
                  title={isBomOpen ? 'BOM 패널 접기' : 'BOM 패널 펼치기'}
                >
                  {isBomOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* BOM Table Body */}
            {isBomOpen && (
              <div className="flex-1 min-h-0 flex flex-col bg-white">
                {isBomLoading ? (
                  <div className="flex-1 flex items-center justify-center text-gray-500 gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                    <span>[{selectedProduct.itemName}] BOM 레시피 불러오는 중...</span>
                  </div>
                ) : bomDetails.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 text-gray-500 bg-gray-50">
                    <AlertCircle className="w-8 h-8 text-blue-400 mb-2" />
                    <p className="font-bold text-gray-700 text-[13px] mb-1">
                      [{selectedProduct.itemName}]에 아직 등록된 BOM 레시피가 없습니다.
                    </p>
                    <p className="text-[11.5px] text-gray-500 mb-4 text-center">
                      상단의 <strong className="text-blue-700">[+ 자재추가]</strong> 버튼을 눌러 원부자재를 직접 구성하거나,<br />
                      <strong className="text-indigo-700">[📋 타제품 BOM 복사]</strong> 버튼을 눌러 기존 유사 제품의 레시피를 그대로 가져오세요.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedMatIds(new Set());
                          setMatSearch('');
                          setMaterialModalOpen(true);
                        }}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold text-[12px] flex items-center gap-1.5 shadow-md"
                      >
                        <Plus className="w-4 h-4" />
                        <span>원부자재 직접 추가하기</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCopySourceId(null);
                          setCopyPreviewDetails([]);
                          setCopyModalOpen(true);
                        }}
                        className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 text-white rounded font-bold text-[12px] flex items-center gap-1.5 shadow-md"
                      >
                        <Copy className="w-4 h-4" />
                        <span>기존 제품 BOM 복사해오기</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 min-h-0">
                    <MasterDataGrid
                      columns={BOM_COLUMNS}
                      data={bomDetails}
                      onCellChange={handleBomCellChange}
                      summaryRow={true}
                      summaryRowTitle="레시피 합계"
                      summaryValues={{
                        calcCost: totalBomCost,
                        unitQty: bomDetails.reduce((sum, d) => sum + (Number(d.unitQty) || 0), 0),
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. Material Picker Modal (자재 선택 팝업) */}
      {materialModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl border border-gray-400 w-full max-w-4xl h-[650px] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-[#1e293b] text-white px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-400" />
                <span className="font-bold text-[14px]">
                  투입 원부자재 선택 ➔ [{selectedProduct?.itemName}]
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMaterialModalOpen(false)}
                className="text-gray-400 hover:text-white p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Filter Bar in Modal */}
            <div className="bg-gray-100 border-b border-gray-300 px-4 py-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-700">구분:</span>
                <div className="flex items-center gap-1 bg-white p-0.5 rounded border border-gray-300">
                  {['전체', '원재료', '부자재', '반제품'].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setMatCatFilter(cat)}
                      className={`px-2 py-0.5 text-[11px] font-bold rounded ${
                        matCatFilter === cat ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <div className="relative ml-2">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2" />
                  <input
                    type="text"
                    placeholder="자재명 또는 품번 검색..."
                    value={matSearch}
                    onChange={(e) => setMatSearch(e.target.value)}
                    className="pl-8 pr-3 py-1 bg-white border border-gray-300 rounded text-[12px] w-56 focus:outline-blue-500"
                    autoFocus
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11.5px] font-bold text-gray-600">
                  선택: <strong className="text-blue-700">{selectedMatIds.size}</strong>건
                </span>
                <button
                  type="button"
                  onClick={handleAddSelectedMaterials}
                  disabled={selectedMatIds.size === 0}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-300 text-white font-bold text-[12px] rounded shadow transition-all cursor-pointer disabled:cursor-not-allowed"
                >
                  선택한 {selectedMatIds.size}개 자재 추가하기
                </button>
              </div>
            </div>

            {/* Material List Table */}
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full border-collapse text-[12px]">
                <thead className="bg-[#e4e8ee] text-gray-700 sticky top-0 border-b border-gray-300 z-10 font-bold">
                  <tr>
                    <th className="w-10 py-1.5 px-2 text-center">선택</th>
                    <th className="w-24 py-1.5 px-2 text-center">자재코드</th>
                    <th className="w-16 py-1.5 px-2 text-center">구분</th>
                    <th className="py-1.5 px-3 text-left">자재명</th>
                    <th className="w-24 py-1.5 px-2 text-center">규격</th>
                    <th className="w-14 py-1.5 px-2 text-center">단위</th>
                    <th className="w-24 py-1.5 px-2 text-right">단가(원)</th>
                    <th className="w-28 py-1.5 px-2 text-left">거래처</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredMaterials.map((m) => {
                    const isChecked = selectedMatIds.has(m.id);
                    return (
                      <tr
                        key={m.id}
                        onClick={() => {
                          const next = new Set(selectedMatIds);
                          if (isChecked) next.delete(m.id);
                          else next.add(m.id);
                          setSelectedMatIds(next);
                        }}
                        className={`cursor-pointer hover:bg-blue-50 transition-colors ${
                          isChecked ? 'bg-blue-100/70 font-semibold' : ''
                        }`}
                      >
                        <td className="py-1.5 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const next = new Set(selectedMatIds);
                              if (e.target.checked) next.add(m.id);
                              else next.delete(m.id);
                              setSelectedMatIds(next);
                            }}
                            className="rounded accent-blue-600"
                          />
                        </td>
                        <td className="py-1.5 px-2 text-center text-gray-600 font-mono text-[11px]">{m.itemCode}</td>
                        <td className="py-1.5 px-2 text-center">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                              m.category === '반제품'
                                ? 'bg-purple-100 text-purple-800'
                                : m.category === '부자재'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {m.category}
                          </span>
                        </td>
                        <td className="py-1.5 px-3 text-left font-medium text-gray-800">{m.itemName}</td>
                        <td className="py-1.5 px-2 text-center text-gray-500 text-[11px]">{m.spec || '-'}</td>
                        <td className="py-1.5 px-2 text-center text-gray-600">{m.unit || 'g'}</td>
                        <td className="py-1.5 px-2 text-right font-mono text-gray-700">
                          {Number(m.unitPrice || 0).toLocaleString()}원
                        </td>
                        <td className="py-1.5 px-2 text-left text-gray-500 text-[11px] truncate">{m.vendor || '-'}</td>
                      </tr>
                    );
                  })}
                  {filteredMaterials.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-gray-400">
                        일치하는 원부자재가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-100 border-t border-gray-300 px-4 py-2 flex items-center justify-between">
              <span className="text-[11px] text-gray-500">
                원하는 자재의 행을 클릭하여 체크박스를 선택한 후 [자재 추가하기]를 누르면 일괄 추가됩니다.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMaterialModalOpen(false)}
                  className="px-3 py-1 bg-white border border-gray-400 rounded text-[12px] hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleAddSelectedMaterials}
                  disabled={selectedMatIds.size === 0}
                  className="px-4 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-300 text-white font-bold text-[12px] rounded shadow cursor-pointer disabled:cursor-not-allowed"
                >
                  선택 자재 ({selectedMatIds.size}개) 추가
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. Copy BOM Modal (타제품 레시피 복사 팝업) */}
      {copyModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl border border-gray-400 w-full max-w-2xl h-[520px] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-[#1e293b] text-white px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Copy className="w-5 h-5 text-indigo-400" />
                <span className="font-bold text-[14px]">
                  기존 제품 레시피(BOM) 복사 ➔ [{selectedProduct?.itemName}]
                </span>
              </div>
              <button
                type="button"
                onClick={() => setCopyModalOpen(false)}
                className="text-gray-400 hover:text-white p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 flex flex-col gap-3 flex-1 min-h-0 bg-gray-50">
              <div>
                <label className="block text-[12px] font-bold text-gray-700 mb-1">
                  복사해올 원본 제품 선택 (BOM 등록된 {productsWithBom.length}개 제품):
                </label>
                <select
                  value={copySourceId ?? ''}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    if (id) void handleSelectCopySource(id);
                    else {
                      setCopySourceId(null);
                      setCopyPreviewDetails([]);
                    }
                  }}
                  className="w-full bg-white border border-gray-400 rounded px-2.5 py-1.5 text-[12px] font-medium focus:outline-blue-500 shadow-sm"
                >
                  <option value="">-- 레시피를 복사해올 원본 제품을 선택하세요 --</option>
                  {productsWithBom.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.category}] {p.itemName} ({p.connectedCount}개 자재 등록됨)
                    </option>
                  ))}
                </select>
              </div>

              {/* Preview Box */}
              <div className="flex-1 min-h-0 bg-white border border-gray-300 rounded p-2 flex flex-col shadow-inner">
                <div className="font-bold text-[11.5px] text-gray-700 pb-1.5 border-b border-gray-200 flex items-center justify-between">
                  <span>미리보기: 복사될 투입 자재 목록 ({copyPreviewDetails.length}건)</span>
                  {isCopyLoading && <span className="text-blue-600 text-[11px] font-normal">조회중...</span>}
                </div>
                <div className="flex-1 min-h-0 overflow-auto pt-1">
                  {copyPreviewDetails.length > 0 ? (
                    <ul className="divide-y divide-gray-100 text-[11.5px]">
                      {copyPreviewDetails.map((d: any, idx: number) => (
                        <li key={idx} className="py-1 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-gray-400 text-[10px] w-5 text-right">{idx + 1}.</span>
                            <span className="font-medium text-gray-800">{d.childProduct?.name || '자재'}</span>
                          </div>
                          <span className="font-mono text-blue-700">
                            {d.unitQty} {d.unit || 'g'} (수율 {d.yieldRate || 100}%)
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="h-full flex items-center justify-center text-gray-400 text-[11.5px]">
                      {copySourceId ? '해당 제품에 등록된 자재가 없습니다.' : '상단에서 원본 제품을 선택하면 레시피가 미리보기됩니다.'}
                    </div>
                  )}
                </div>
              </div>

              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 p-2 rounded">
                💡 <strong>안내:</strong> 복사하여 적용한 후 투입량이나 단가, 필요한 자재만 추가/삭제하신 뒤 상단의 <strong>[BOM 저장]</strong> 버튼을 누르시면 안전하게 저장됩니다.
              </p>
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-100 border-t border-gray-300 px-4 py-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCopyModalOpen(false)}
                className="px-3 py-1 bg-white border border-gray-400 rounded text-[12px] hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleApplyCopy}
                disabled={!copySourceId || copyPreviewDetails.length === 0}
                className="px-4 py-1 bg-indigo-700 hover:bg-indigo-600 disabled:bg-gray-300 text-white font-bold text-[12px] rounded shadow cursor-pointer disabled:cursor-not-allowed"
              >
                이 레시피를 복사하여 적용
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

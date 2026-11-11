'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { MasterActionBar } from '../common/MasterActionBar';
import { MasterDataGrid, MasterGridColumnDef } from '../common/MasterDataGrid';
import { Plus, Trash2, Search, Download, Copy, RefreshCw, X, Layers, CheckCircle2, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { exportGridToExcel } from '@/lib/excelExport';
import { ProductLifecycleBadge } from '@/components/common/ProductLifecycleBadge';
import {
  calcBomEffectiveUnitPrice,
  calcBoxPrice,
  normalizePackUnit,
  pickLatestValidDeliveryPrice,
  pickLatestValidPurchasePrice,
} from '@/lib/gfs/pricing';

export interface BomParentProduct {
  id: number;
  bomHeaderId: number;
  used: boolean;
  itemCode: string;
  category: string;
  variety: string;
  itemName: string;
  spec: string;
  unit: string;
  baseProdQty: number; // 생산기준량 (기본 100)
  recipeYield: number; // 평균 레시피수율(%)
  prodCost: number; // (생산) 100개 기준 총배치 투입원가
  unitCost: number; // (단위) 1개당 제조원가
  deliveryPrice: number; // 납품/판매단가
  costRate: number; // 원가율(%)
  bomCount: number; // 소요 원부자재수
  version: string; // 현재 적용 버전
  gyeName: string; // 성형장/계
  remark: string;
  status?: string;
  discontinuedDate?: string;
  isUsed?: boolean;
}

export interface BomChildMaterial {
  id: number;
  childProductId: number;
  used: boolean;
  partId: string;
  category: string;
  partName: string;
  partSpec: string;
  partUnit: string;
  boxQty: number;
  purchasePrice: number;
  boxPrice: number;
  bomDivisor?: number;
  bomMultiplier?: number;
  recipeYield: number;
  unitInputQty: number; // (단위) 기준소요량
  unitActualQty: number; // (단위) 실투입량 = unitInputQty / (recipeYield / 100)
  unitCost: number; // (단위) 투입원가
  prodInputQty: number; // (생산) 100개 투입량
  prodActualQty: number; // (생산) 100개 실투입량
  prodCost: number; // (생산) 100개 투입원가
  costShare: number; // 원가비중(%)
  partnerName: string;
  gyeName: string;
  remark: string;
  status?: string;
  discontinuedDate?: string;
  isUsed?: boolean;
}

interface ProductSearchItem {
  id: number;
  productCode: string;
  name: string;
  spec: string;
  unit: string;
  category: string;
  kind: string;
  boxQty: number;
  purchasePrice: number;
  boxPrice: number;
  bomDivisor?: number;
  bomMultiplier?: number;
  partnerName: string;
}

// 품종 자동 판별
const detectVariety = (kind?: string | null, name?: string): string => {
  if (kind && kind.trim() && kind !== 'N/A' && kind !== '기타' && kind !== '(미분류)') {
    return kind.trim();
  }
  const n = name || '';
  if (n.includes('도시락')) return '도시락';
  if (n.includes('김밥')) return '김밥';
  if (n.includes('주먹밥') || n.includes('삼각')) return '주먹밥';
  if (n.includes('무스비')) return '무스비';
  if (n.includes('면') || n.includes('스파게티') || n.includes('우동') || n.includes('국수')) return '조리면';
  if (n.includes('샌드') || n.includes('버거') || n.includes('토스트')) return '샌드위치/버거';
  return '일반/기타';
};

const kstTodayStr = (): string =>
  new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

// 소요 원부자재 단가 및 비용 계산
const calculateChildCosts = (
  unitQty: number,
  unit: string,
  yieldRate: number,
  purchasePrice: number,
  baseProdQty: number = 100,
  bomDivisor?: number,
  bomMultiplier?: number,
) => {
  const yRate = yieldRate > 0 ? yieldRate : 100;
  const inQty = Number(unitQty) || 0;
  const actQty = Math.round((inQty / (yRate / 100)) * 1000) / 1000;
  const effectivePrice = calcBomEffectiveUnitPrice(unit, purchasePrice || 0, bomDivisor, bomMultiplier);
  const uCost = Math.round(actQty * effectivePrice * 10) / 10;
  const pInQty = Math.round(inQty * baseProdQty * 100) / 100;
  const pActQty = Math.round(actQty * baseProdQty * 100) / 100;
  const pCost = Math.round(uCost * baseProdQty);

  return {
    unitInputQty: inQty,
    unitActualQty: actQty,
    unitCost: uCost,
    prodInputQty: pInQty,
    prodActualQty: pActQty,
    prodCost: pCost,
  };
};

export const BomNormalView: React.FC = () => {
  const [varietyFilter, setVarietyFilter] = useState<string>('ALL');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [parents, setParents] = useState<BomParentProduct[]>([]);
  const [selectedParentId, setSelectedParentId] = useState<number | null>(null);
  const [childrenMap, setChildrenMap] = useState<Record<number, BomChildMaterial[]>>({});
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);
  const [bomHeaders, setBomHeaders] = useState<any[]>([]);
  const [versionsMap, setVersionsMap] = useState<Record<number, string[]>>({});
  const [version, setVersion] = useState<string>('1.0');
  const [copySourceId, setCopySourceId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // 자재 추가 모달 상태
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [modalSearchKeyword, setModalSearchKeyword] = useState<string>('');
  const [modalCategoryFilter, setModalCategoryFilter] = useState<string>('ALL');
  const [searchResults, setSearchResults] = useState<ProductSearchItem[]>([]);
  const [isSearchingProducts, setIsSearchingProducts] = useState<boolean>(false);
  const [newMaterialQty, setNewMaterialQty] = useState<number>(10);
  const [newMaterialUnit, setNewMaterialUnit] = useState<string>('g');
  const [newMaterialYield, setNewMaterialYield] = useState<number>(100);

  // DB에서 BOM 데이터 불러오기
  const loadBom = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/master/bom');
      const json = await res.json();
      if (!json.success || !json.data) {
        setParents([]);
        setChildrenMap({});
        return;
      }

      const headers = json.data as any[];
      setBomHeaders(headers);

      // 1. 버전 맵 구축
      const vMap: Record<number, string[]> = {};
      headers.forEach((h) => {
        const pId = h.parentProduct?.id;
        if (pId) {
          if (!vMap[pId]) vMap[pId] = [];
          if (h.version && !vMap[pId].includes(h.version)) {
            vMap[pId].push(h.version);
          }
        }
      });
      setVersionsMap(vMap);

      // 2. 부모 및 자식 상세 계산 구축
      const loadedChildrenMap: Record<number, BomChildMaterial[]> = {};
      const loadedParents: BomParentProduct[] = [];

      headers.forEach((h) => {
        const p = h.parentProduct;
        if (!p) return;
        const pId = p.id;
        const baseQty = 100;
        const deliveryPrice =
          Number(p.deliveryPrice) || pickLatestValidDeliveryPrice(p.prices) || 0;

        // 원부자재 가공
        const rawDetails = h.details || [];
        const mappedChildren: BomChildMaterial[] = rawDetails.map((d: any) => {
          const cp = d.childProduct || {};
          const pack = normalizePackUnit(cp.boxQty);
          const purchasePrice =
            Number(cp.bagPrice ?? cp.purchasePrice) ||
            pickLatestValidPurchasePrice(cp.prices) ||
            0;
          const boxPrice = Number(cp.boxPrice) || calcBoxPrice(purchasePrice, pack);
          const unit = d.unit || cp.unit || 'g';
          const yieldRate = d.yieldRate || 100;
          const costs = calculateChildCosts(
            d.unitQty,
            unit,
            yieldRate,
            purchasePrice,
            baseQty,
            cp.bomDivisor,
            cp.bomMultiplier
          );

          return {
            id: d.id,
            childProductId: d.childProductId || cp.id,
            used: true,
            partId: cp.productCode || '',
            category: cp.category || '원재료',
            partName: cp.name || '',
            partSpec: cp.spec || '',
            partUnit: unit,
            boxQty: pack,
            purchasePrice,
            boxPrice,
            bomDivisor: cp.bomDivisor,
            bomMultiplier: cp.bomMultiplier,
            recipeYield: yieldRate,
            unitInputQty: costs.unitInputQty,
            unitActualQty: costs.unitActualQty,
            unitCost: costs.unitCost,
            prodInputQty: costs.prodInputQty,
            prodActualQty: costs.prodActualQty,
            prodCost: costs.prodCost,
            costShare: 0, // 하단에서 재산출
            partnerName: cp.partner?.name || '',
            gyeName: d.gye?.name || cp.gye?.name || '',
            remark: d.remark || '',
            status: cp.status || '정상',
            discontinuedDate: cp.discontinuedDate || '',
            isUsed: cp.isUsed !== false,
          };
        });

        // 총 단위원가 산출
        const totalUnitCost = Math.round(
          mappedChildren.filter((c) => c.used !== false).reduce((sum, c) => sum + (c.unitCost || 0), 0) * 10
        ) / 10;
        const totalProdCost = Math.round(totalUnitCost * baseQty);

        // 원가비중 산출
        const childrenWithShare = mappedChildren.map((c) => ({
          ...c,
          costShare: totalUnitCost > 0 ? Math.round(((c.unitCost || 0) / totalUnitCost) * 1000) / 10 : 0,
        }));

        if (!loadedChildrenMap[pId]) {
          loadedChildrenMap[pId] = childrenWithShare;
        }

        const avgYield = mappedChildren.length > 0
          ? Math.round(
              (mappedChildren.reduce((sum, c) => sum + (c.recipeYield || 100), 0) / mappedChildren.length) * 10
            ) / 10
          : 100;

        const costRate = deliveryPrice > 0 ? Math.round((totalUnitCost / deliveryPrice) * 1000) / 10 : 0;
        const variety = detectVariety(p.kind, p.name);

        loadedParents.push({
          id: pId,
          bomHeaderId: h.id,
          used: p.isUsed !== false,
          itemCode: p.productCode || '',
          category: p.category || '완성품',
          variety,
          itemName: p.name || '',
          spec: p.spec || '',
          unit: p.unit || 'ea',
          baseProdQty: baseQty,
          recipeYield: avgYield,
          prodCost: totalProdCost,
          unitCost: totalUnitCost,
          deliveryPrice,
          costRate,
          bomCount: mappedChildren.length,
          version: h.version || '1.0',
          gyeName: p.gye?.name || '성형장',
          remark: h.remark || '',
          status: p.status || '정상',
          discontinuedDate: p.discontinuedDate || '',
          isUsed: p.isUsed !== false,
        });
      });

      setParents(loadedParents);
      setChildrenMap(loadedChildrenMap);

      // 첫 번째 제품 자동 선택
      if (loadedParents.length > 0) {
        setSelectedParentId(loadedParents[0].id);
        const vs = vMap[loadedParents[0].id] || ['1.0'];
        setVersion(vs[vs.length - 1] || '1.0');
      }
    } catch (err) {
      console.error('BOM 로드 실패:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBom();
  }, [loadBom]);

  // 실시간 필터링된 부모 목록
  const filteredParents = useMemo(() => {
    return parents.filter((p) => {
      // 품종 필터
      const matchVariety = varietyFilter === 'ALL' || p.variety === varietyFilter;
      // 검색어 필터 (품번, 품명, 공정계, 그리고 하위 자재명 역전개 검색 지원)
      const kw = searchKeyword.trim().toLowerCase();
      if (!kw) return matchVariety;

      const directMatch =
        p.itemCode.toLowerCase().includes(kw) ||
        p.itemName.toLowerCase().includes(kw) ||
        (p.gyeName && p.gyeName.toLowerCase().includes(kw));

      if (directMatch) return matchVariety;

      // 역전개 검색: 해당 부모의 자재 목록에 검색어가 포함되는지 확인
      const children = childrenMap[p.id] || [];
      const reverseMatch = children.some(
        (c) =>
          c.partName.toLowerCase().includes(kw) ||
          c.partId.toLowerCase().includes(kw) ||
          (c.partnerName && c.partnerName.toLowerCase().includes(kw))
      );

      return matchVariety && reverseMatch;
    });
  }, [parents, varietyFilter, searchKeyword, childrenMap]);

  // 현재 선택된 부모 객체
  const selectedParent = useMemo(() => {
    if (!selectedParentId) return filteredParents[0] || parents[0] || null;
    return parents.find((p) => p.id === selectedParentId) || filteredParents[0] || parents[0] || null;
  }, [parents, filteredParents, selectedParentId]);

  // 필터 변경 시 현재 선택이 필터에 없으면 첫 번째로 자동 이동
  useEffect(() => {
    if (filteredParents.length > 0 && selectedParentId) {
      const exists = filteredParents.some((p) => p.id === selectedParentId);
      if (!exists) {
        setSelectedParentId(filteredParents[0].id);
        const vs = versionsMap[filteredParents[0].id] || ['1.0'];
        setVersion(vs[vs.length - 1] || '1.0');
      }
    }
  }, [filteredParents, selectedParentId, versionsMap]);

  // 현재 선택된 부모의 소요 원부자재 목록
  const currentChildren = useMemo(() => {
    if (!selectedParent) return [];
    return childrenMap[selectedParent.id] || [];
  }, [selectedParent, childrenMap]);

  // 버전 변경
  const handleVersionChange = (v: string) => {
    if (!selectedParent) return;
    setVersion(v);
    const header = bomHeaders.find(
      (b: any) => b.parentProduct?.id === selectedParent.id && b.version === v
    );
    if (header?.details) {
      const mapped: BomChildMaterial[] = header.details.map((d: any) => {
        const cp = d.childProduct || {};
        const pack = normalizePackUnit(cp.boxQty);
        const purchasePrice =
          Number(cp.bagPrice ?? cp.purchasePrice) ||
          pickLatestValidPurchasePrice(cp.prices) ||
          0;
        const boxPrice = Number(cp.boxPrice) || calcBoxPrice(purchasePrice, pack);
        const unit = d.unit || cp.unit || 'g';
        const yieldRate = d.yieldRate || 100;
        const costs = calculateChildCosts(
          d.unitQty,
          unit,
          yieldRate,
          purchasePrice,
          selectedParent.baseProdQty,
          cp.bomDivisor,
          cp.bomMultiplier
        );

        return {
          id: d.id,
          childProductId: d.childProductId || cp.id,
          used: true,
          partId: cp.productCode || '',
          category: cp.category || '원재료',
          partName: cp.name || '',
          partSpec: cp.spec || '',
          partUnit: unit,
          boxQty: pack,
          purchasePrice,
          boxPrice,
          bomDivisor: cp.bomDivisor,
          bomMultiplier: cp.bomMultiplier,
          recipeYield: yieldRate,
          unitInputQty: costs.unitInputQty,
          unitActualQty: costs.unitActualQty,
          unitCost: costs.unitCost,
          prodInputQty: costs.prodInputQty,
          prodActualQty: costs.prodActualQty,
          prodCost: costs.prodCost,
          costShare: 0,
          partnerName: cp.partner?.name || '',
          gyeName: d.gye?.name || cp.gye?.name || '',
          remark: d.remark || '',
        };
      });

      const totalUnitCost = Math.round(
        mapped.filter((c) => c.used !== false).reduce((sum, c) => sum + (c.unitCost || 0), 0) * 10
      ) / 10;
      const childrenWithShare = mapped.map((c) => ({
        ...c,
        costShare: totalUnitCost > 0 ? Math.round(((c.unitCost || 0) / totalUnitCost) * 1000) / 10 : 0,
      }));

      setChildrenMap((prev) => ({ ...prev, [selectedParent.id]: childrenWithShare }));
    }
  };

  // 하단 그리드 셀 수정 이벤트 (소요량, 수율, 단위, 비고 등)
  const handleLowerCellChange = (rowId: any, columnKey: string, newValue: any) => {
    if (!selectedParent) return;
    const parentId = selectedParent.id;

    setChildrenMap((prev) => {
      const current = prev[parentId] || [];
      const updated = current.map((c) => {
        if (c.id === rowId) {
          const next = { ...c, [columnKey]: newValue };
          if (
            columnKey === 'unitInputQty' ||
            columnKey === 'recipeYield' ||
            columnKey === 'partUnit' ||
            columnKey === 'used'
          ) {
            const costs = calculateChildCosts(
              columnKey === 'unitInputQty' ? Number(newValue) || 0 : next.unitInputQty,
              columnKey === 'partUnit' ? String(newValue) : next.partUnit,
              columnKey === 'recipeYield' ? Number(newValue) || 100 : next.recipeYield,
              next.purchasePrice,
              selectedParent.baseProdQty,
              next.bomDivisor,
              next.bomMultiplier
            );
            return { ...next, ...costs };
          }
          return next;
        }
        return c;
      });

      // 전체 투입원가 재계산
      const totalUnitCost = Math.round(
        updated.filter((c) => c.used !== false).reduce((sum, c) => sum + (c.unitCost || 0), 0) * 10
      ) / 10;
      const totalProdCost = Math.round(totalUnitCost * selectedParent.baseProdQty);

      const childrenWithShare = updated.map((c) => ({
        ...c,
        costShare: totalUnitCost > 0 ? Math.round(((c.unitCost || 0) / totalUnitCost) * 1000) / 10 : 0,
      }));

      // 부모 목록 상태도 실시간 반영
      setParents((pList) =>
        pList.map((p) => {
          if (p.id === parentId) {
            const avgYield = childrenWithShare.length > 0
              ? Math.round(
                  (childrenWithShare.reduce((sum, c) => sum + (c.recipeYield || 100), 0) / childrenWithShare.length) * 10
                ) / 10
              : 100;
            const costRate = p.deliveryPrice > 0 ? Math.round((totalUnitCost / p.deliveryPrice) * 1000) / 10 : 0;
            return {
              ...p,
              unitCost: totalUnitCost,
              prodCost: totalProdCost,
              recipeYield: avgYield,
              costRate,
              bomCount: childrenWithShare.filter((c) => c.used !== false).length,
            };
          }
          return p;
        })
      );

      return { ...prev, [parentId]: childrenWithShare };
    });
  };

  // BOM 저장
  const handleSave = async () => {
    if (!selectedParent) {
      alert('선택된 제품이 없습니다.');
      return;
    }
    const children = childrenMap[selectedParent.id] || [];
    if (children.length === 0) {
      if (!window.confirm('등록된 원부자재가 없습니다. 빈 BOM으로 저장하시겠습니까?')) return;
    }

    setIsSaving(true);
    try {
      const payload = {
        parentProductId: selectedParent.id,
        version,
        effectiveDate: kstTodayStr(),
        details: children.map((c) => ({
          childProductId: c.childProductId,
          unitQty: c.unitInputQty,
          unit: c.partUnit,
          yieldRate: c.recipeYield,
          remark: c.remark,
        })),
      };

      const res = await fetch('/api/master/bom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        alert(`[${selectedParent.itemName}] BOM (v${version})이 데이터베이스에 안전하게 저장되었습니다.`);
        setVersionsMap((prev) => {
          const cur = prev[selectedParent.id] || [];
          return cur.includes(version) ? prev : { ...prev, [selectedParent.id]: [...cur, version] };
        });
      } else {
        alert('저장 실패: ' + (json.error || '알 수 없는 오류'));
      }
    } catch (err: any) {
      alert('BOM 저장 중 오류: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // 새 버전 생성
  const handleNewVersion = async () => {
    if (!selectedParent) return;
    const curVersions = versionsMap[selectedParent.id] || ['1.0'];
    const nums = curVersions.map((s) => parseFloat(s)).filter((n) => !isNaN(n));
    const nextMinor = (Math.max(...nums, 1.0) + 0.1).toFixed(1);
    const children = childrenMap[selectedParent.id] || [];

    if (children.length === 0) {
      alert('복제할 소요 원부자재가 없습니다. 먼저 원부자재를 등록하세요.');
      return;
    }

    if (!window.confirm(`현재 [${selectedParent.itemName}] 배합비를 새 버전 v${nextMinor}으로 생성하여 등록하시겠습니까?`)) {
      return;
    }

    try {
      const res = await fetch('/api/master/bom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentProductId: selectedParent.id,
          version: nextMinor,
          effectiveDate: kstTodayStr(),
          details: children.map((c) => ({
            childProductId: c.childProductId,
            unitQty: c.unitInputQty,
            unit: c.partUnit,
            yieldRate: c.recipeYield,
            remark: c.remark,
          })),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setVersionsMap((prev) => ({
          ...prev,
          [selectedParent.id]: [...(prev[selectedParent.id] || ['1.0']), nextMinor],
        }));
        setVersion(nextMinor);
        alert(`새 BOM 버전 v${nextMinor}이 성공적으로 생성되었습니다.`);
        loadBom();
      } else {
        alert('버전 생성 실패: ' + json.error);
      }
    } catch (err: any) {
      alert('버전 생성 중 오류: ' + err.message);
    }
  };

  // 유사메뉴 복사
  const handleCopyFrom = async () => {
    if (!selectedParent) return;
    const srcId = Number(copySourceId);
    if (!srcId) {
      alert('복사해올 원본 제품을 선택하세요.');
      return;
    }
    if (srcId === selectedParent.id) {
      alert('자기 자신은 복사 원본이 될 수 없습니다.');
      return;
    }

    let srcChildren = childrenMap[srcId];
    if (!srcChildren) {
      try {
        const res = await fetch(`/api/master/bom?productId=${srcId}`);
        const json = await res.json();
        if (json.success && json.data?.[0]?.details) {
          srcChildren = json.data[0].details.map((d: any) => {
            const cp = d.childProduct || {};
            const pack = normalizePackUnit(cp.boxQty);
            const purchasePrice =
              Number(cp.bagPrice ?? cp.purchasePrice) ||
              pickLatestValidPurchasePrice(cp.prices) ||
              0;
            const boxPrice = Number(cp.boxPrice) || calcBoxPrice(purchasePrice, pack);
            const unit = d.unit || cp.unit || 'g';
            const yieldRate = d.yieldRate || 100;
            const costs = calculateChildCosts(
              d.unitQty,
              unit,
              yieldRate,
              purchasePrice,
              selectedParent.baseProdQty,
              cp.bomDivisor,
              cp.bomMultiplier
            );

            return {
              id: Date.now() + Math.random(),
              childProductId: d.childProductId || cp.id,
              used: true,
              partId: cp.productCode || '',
              category: cp.category || '원재료',
              partName: cp.name || '',
              partSpec: cp.spec || '',
              partUnit: unit,
              boxQty: pack,
              purchasePrice,
              boxPrice,
              bomDivisor: cp.bomDivisor,
              bomMultiplier: cp.bomMultiplier,
              recipeYield: yieldRate,
              unitInputQty: costs.unitInputQty,
              unitActualQty: costs.unitActualQty,
              unitCost: costs.unitCost,
              prodInputQty: costs.prodInputQty,
              prodActualQty: costs.prodActualQty,
              prodCost: costs.prodCost,
              costShare: 0,
              partnerName: cp.partner?.name || '',
              gyeName: d.gye?.name || cp.gye?.name || '',
              remark: d.remark || '',
            };
          });
        }
      } catch (err: any) {
        alert('원본 BOM 조회 실패: ' + err.message);
        return;
      }
    }

    if (!srcChildren || srcChildren.length === 0) {
      alert('선택한 원본 제품에 등록된 원부자재가 없습니다.');
      return;
    }

    if (!window.confirm(`원본 제품의 소요 원부자재 ${srcChildren.length}종을 복사해오시겠습니까?\n현재 레시피 목록이 대체됩니다.`)) {
      return;
    }

    const cloned = srcChildren.map((c, i) => ({ ...c, id: Date.now() + i }));
    const totalUnitCost = Math.round(
      cloned.filter((c) => c.used !== false).reduce((sum, c) => sum + (c.unitCost || 0), 0) * 10
    ) / 10;
    const clonedWithShare = cloned.map((c) => ({
      ...c,
      costShare: totalUnitCost > 0 ? Math.round(((c.unitCost || 0) / totalUnitCost) * 1000) / 10 : 0,
    }));

    setChildrenMap((prev) => ({ ...prev, [selectedParent.id]: clonedWithShare }));

    // 부모 원가 갱신
    setParents((pList) =>
      pList.map((p) => {
        if (p.id === selectedParent.id) {
          const totalProdCost = Math.round(totalUnitCost * p.baseProdQty);
          const costRate = p.deliveryPrice > 0 ? Math.round((totalUnitCost / p.deliveryPrice) * 1000) / 10 : 0;
          return {
            ...p,
            unitCost: totalUnitCost,
            prodCost: totalProdCost,
            bomCount: clonedWithShare.length,
            costRate,
          };
        }
        return p;
      })
    );

    alert(`원본 레시피 ${srcChildren.length}종을 성공적으로 가져왔습니다.\n우측 상단 [저장] 버튼을 눌러야 영구 반영됩니다.`);
  };

  // 선택 자재 삭제
  const handleDeleteChild = () => {
    if (!selectedParent || !selectedChildId) {
      alert('삭제할 자재 행을 먼저 선택하세요.');
      return;
    }

    const targetChild = currentChildren.find((c) => c.id === selectedChildId);
    if (!targetChild) return;

    if (!window.confirm(`[${targetChild.partName}] 자재를 레시피에서 제외하시겠습니까?`)) {
      return;
    }

    const remaining = currentChildren.filter((c) => c.id !== selectedChildId);
    const totalUnitCost = Math.round(
      remaining.filter((c) => c.used !== false).reduce((sum, c) => sum + (c.unitCost || 0), 0) * 10
    ) / 10;
    const remainingWithShare = remaining.map((c) => ({
      ...c,
      costShare: totalUnitCost > 0 ? Math.round(((c.unitCost || 0) / totalUnitCost) * 1000) / 10 : 0,
    }));

    setChildrenMap((prev) => ({ ...prev, [selectedParent.id]: remainingWithShare }));
    setSelectedChildId(null);

    // 부모 원가 갱신
    setParents((pList) =>
      pList.map((p) => {
        if (p.id === selectedParent.id) {
          const totalProdCost = Math.round(totalUnitCost * p.baseProdQty);
          const costRate = p.deliveryPrice > 0 ? Math.round((totalUnitCost / p.deliveryPrice) * 1000) / 10 : 0;
          return {
            ...p,
            unitCost: totalUnitCost,
            prodCost: totalProdCost,
            bomCount: remainingWithShare.length,
            costRate,
          };
        }
        return p;
      })
    );
  };

  // 모달을 통한 원부자재 검색
  const searchProducts = async () => {
    setIsSearchingProducts(true);
    try {
      const params = new URLSearchParams();
      if (modalCategoryFilter !== 'ALL') {
        params.set('category', modalCategoryFilter);
      }
      if (modalSearchKeyword.trim()) {
        params.set('search', modalSearchKeyword.trim());
      }
      const res = await fetch(`/api/master/product?${params.toString()}`);
      const json = await res.json();
      if (json.success && json.data) {
        const items: ProductSearchItem[] = json.data.map((p: any) => {
          const pack = normalizePackUnit(p.boxQty);
          const purchasePrice =
            Number(p.bagPrice ?? p.purchasePrice) ||
            pickLatestValidPurchasePrice(p.prices) ||
            0;
          const boxPrice = Number(p.boxPrice) || calcBoxPrice(purchasePrice, pack);
          return {
            id: p.id,
            productCode: p.productCode || '',
            name: p.name || '',
            spec: p.spec || '',
            unit: p.unit || 'g',
            category: p.category || '원재료',
            kind: p.kind || '',
            boxQty: pack,
            purchasePrice,
            boxPrice,
            bomDivisor: p.bomDivisor,
            bomMultiplier: p.bomMultiplier,
            partnerName: p.partnerName || p.partner?.name || '',
          };
        });
        setSearchResults(items);
      } else {
        setSearchResults([]);
      }
    } catch (err) {
      console.error('품목 검색 실패:', err);
    } finally {
      setIsSearchingProducts(false);
    }
  };

  // 모달 열릴 때 초기 검색
  useEffect(() => {
    if (isAddModalOpen) {
      searchProducts();
    }
  }, [isAddModalOpen, modalCategoryFilter]);

  // 검색된 품목을 현재 BOM에 추가
  const handleSelectMaterial = (item: ProductSearchItem) => {
    if (!selectedParent) return;

    // 이미 존재하는지 체크
    const exists = currentChildren.some((c) => c.childProductId === item.id);
    if (exists) {
      if (!window.confirm(`[${item.name}] 자재가 이미 레시피에 등록되어 있습니다. 추가로 등록하시겠습니까?`)) {
        return;
      }
    }

    const unit = newMaterialUnit || item.unit || 'g';
    const yieldRate = newMaterialYield || 100;
    const costs = calculateChildCosts(
      newMaterialQty,
      unit,
      yieldRate,
      item.purchasePrice,
      selectedParent.baseProdQty,
      item.bomDivisor,
      item.bomMultiplier
    );

    const newChild: BomChildMaterial = {
      id: Date.now(),
      childProductId: item.id,
      used: true,
      partId: item.productCode,
      category: item.category,
      partName: item.name,
      partSpec: item.spec,
      partUnit: unit,
      boxQty: item.boxQty,
      purchasePrice: item.purchasePrice,
      boxPrice: item.boxPrice,
      bomDivisor: item.bomDivisor,
      bomMultiplier: item.bomMultiplier,
      recipeYield: yieldRate,
      unitInputQty: costs.unitInputQty,
      unitActualQty: costs.unitActualQty,
      unitCost: costs.unitCost,
      prodInputQty: costs.prodInputQty,
      prodActualQty: costs.prodActualQty,
      prodCost: costs.prodCost,
      costShare: 0,
      partnerName: item.partnerName,
      gyeName: selectedParent.gyeName,
      remark: '신규 배합 추가',
    };

    const updated = [...currentChildren, newChild];
    const totalUnitCost = Math.round(
      updated.filter((c) => c.used !== false).reduce((sum, c) => sum + (c.unitCost || 0), 0) * 10
    ) / 10;
    const updatedWithShare = updated.map((c) => ({
      ...c,
      costShare: totalUnitCost > 0 ? Math.round(((c.unitCost || 0) / totalUnitCost) * 1000) / 10 : 0,
    }));

    setChildrenMap((prev) => ({ ...prev, [selectedParent.id]: updatedWithShare }));

    // 부모 원가 갱신
    setParents((pList) =>
      pList.map((p) => {
        if (p.id === selectedParent.id) {
          const totalProdCost = Math.round(totalUnitCost * p.baseProdQty);
          const costRate = p.deliveryPrice > 0 ? Math.round((totalUnitCost / p.deliveryPrice) * 1000) / 10 : 0;
          return {
            ...p,
            unitCost: totalUnitCost,
            prodCost: totalProdCost,
            bomCount: updatedWithShare.length,
            costRate,
          };
        }
        return p;
      })
    );

    setIsAddModalOpen(false);
    setSelectedChildId(newChild.id);
  };

  // BOM 일괄적재
  const handleBulkImport = async () => {
    setIsImporting(true);
    try {
      const prevRes = await fetch('/api/master/bom-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      });
      const prevJson = await prevRes.json();
      if (!prevJson.success) {
        alert('미리보기 실패: ' + (prevJson.error || '알 수 없는 오류'));
        return;
      }
      const d = prevJson.data;
      const ok = window.confirm(
        `발주서 정본 BOM 일괄적재 미리보기\n\n` +
          `자재 ${d.materialCount}종 · 메뉴 ${d.menuCount}종 · 연결 ${d.linkCount}건\n` +
          `신규 자재 ${d.newMaterials}종 / 신규 메뉴 ${d.newMenus}종\n` +
          `제외(메모성 ${d.skippedMemo?.length ?? 0}건): ${(d.skippedMemo || []).slice(0, 5).join(', ')}${(d.skippedMemo || []).length > 5 ? ' 외' : ''}\n` +
          `신규 예시: ${(d.sampleNewMaterials || []).slice(0, 3).join(', ')}\n\n` +
          `실행하면 없는 품목·거래처를 자동생성하고 BOM v1.0을 적재(덮어쓰기)합니다.\n진행할까요?`
      );
      if (!ok) return;

      const exeRes = await fetch('/api/master/bom-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false }),
      });
      const exeJson = await exeRes.json();
      if (exeJson.success) {
        const r = exeJson.data;
        alert(
          `BOM 일괄적재 완료\n메뉴 ${r.menuCount}종 · 품목생성 ${r.createdProducts}건 · 거래처 ${r.createdPartners}건 · BOM상세 ${r.createdDetails}건` +
            (r.skippedMemo?.length ? `\n제외(메모성 ${r.skippedMemo.length}건): ${r.skippedMemo.slice(0, 5).join(', ')}` : '') +
            (r.errors?.length ? `\n실패 ${r.errors.length}건: ${r.errors.slice(0, 3).join(' / ')}` : '')
        );
        loadBom();
      } else {
        alert('적재 실패: ' + (exeJson.error || '알 수 없는 오류'));
      }
    } catch (err: any) {
      alert('일괄적재 중 오류: ' + err.message);
    } finally {
      setIsImporting(false);
    }
  };

  // 상단 부모 그리드 컬럼 정의
  const UPPER_COLUMNS: MasterGridColumnDef[] = [
    { key: 'used', label: '사용', width: '45px', align: 'center', format: 'checkbox' },
    { key: 'itemCode', label: '품번', width: '120px', align: 'center' },
    { key: 'category', label: '구분', width: '65px', align: 'center' },
    { key: 'variety', label: '품종', width: '85px', align: 'center' },
    {
      key: 'itemName',
      minWidth: '240px',
      label: '완제품 품명',
      align: 'left',
      render: (val, row) => (
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="truncate font-semibold text-gray-900">{String(val ?? '')}</span>
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
    { key: 'spec', label: '규격', width: '100px', align: 'center' },
    { key: 'unit', label: '단위', width: '50px', align: 'center' },
    { key: 'baseProdQty', label: '생산기준', width: '75px', align: 'right', format: 'number' },
    { key: 'recipeYield', label: '수율(%)', width: '75px', align: 'right' },
    { key: 'unitCost', label: '(단위)제조원가', width: '105px', align: 'right', format: 'currency' },
    { key: 'prodCost', label: '(100ea)배치원가', width: '110px', align: 'right', format: 'currency' },
    { key: 'deliveryPrice', label: '납품단가', width: '95px', align: 'right', format: 'currency' },
    {
      key: 'costRate',
      label: '원가율(%)',
      width: '80px',
      align: 'right',
      render: (val: any) => {
        const num = Number(val) || 0;
        if (num <= 0) return <span className="text-gray-400 text-[11px]">-</span>;
        const color = num < 45 ? 'text-emerald-700 font-bold' : num <= 60 ? 'text-blue-700 font-bold' : 'text-rose-600 font-extrabold';
        return <span className={color}>{num.toFixed(1)}%</span>;
      },
    },
    { key: 'bomCount', label: '자재수', width: '65px', align: 'right', format: 'number' },
    { key: 'version', label: '버전', width: '55px', align: 'center' },
    { key: 'gyeName', label: '계명칭', width: '110px', align: 'left' },
    { key: 'remark', label: '비고', width: '120px', align: 'left' },
  ];

  // 하단 소요 원부자재 그리드 컬럼 정의
  const LOWER_COLUMNS: MasterGridColumnDef[] = [
    { key: 'used', label: '사용', width: '45px', align: 'center', format: 'checkbox' },
    { key: 'partId', label: '자재코드', width: '120px', align: 'center' },
    { key: 'category', label: '구분', width: '65px', align: 'center' },
    {
      key: 'partName',
      minWidth: '220px',
      label: '원부자재명',
      align: 'left',
      render: (val, row) => (
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="truncate font-semibold text-gray-900">{String(val ?? '')}</span>
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
    { key: 'partSpec', label: '규격', width: '100px', align: 'center' },
    { key: 'partUnit', label: '배합단위', width: '70px', align: 'center', editable: true },
    { key: 'boxQty', label: '입수량', width: '60px', align: 'right', format: 'number' },
    { key: 'purchasePrice', label: '봉단가', width: '85px', align: 'right', format: 'currency' },
    { key: 'boxPrice', label: '박스단가', width: '95px', align: 'right', format: 'currency' },
    { key: 'unitInputQty', label: '(단위)소요량', width: '85px', align: 'right', editable: true },
    { key: 'recipeYield', label: '수율(%)', width: '75px', align: 'right', editable: true },
    { key: 'unitActualQty', label: '(단위)실소요', width: '85px', align: 'right' },
    { key: 'unitCost', label: '(단위)투입원가', width: '95px', align: 'right', format: 'currency' },
    { key: 'prodInputQty', label: '(100ea)투입량', width: '90px', align: 'right', format: 'number' },
    { key: 'prodActualQty', label: '(100ea)실투입', width: '90px', align: 'right', format: 'number' },
    { key: 'prodCost', label: '(100ea)배치원가', width: '105px', align: 'right', format: 'currency' },
    {
      key: 'costShare',
      label: '원가비중(%)',
      width: '85px',
      align: 'right',
      render: (val: any) => {
        const num = Number(val) || 0;
        return <span className={num > 20 ? 'text-amber-800 font-bold' : 'text-gray-700'}>{num.toFixed(1)}%</span>;
      },
    },
    { key: 'partnerName', label: '공급처', width: '110px', align: 'left' },
    { key: 'gyeName', label: '공정/계', width: '90px', align: 'left' },
    { key: 'remark', label: '배합비고', width: '120px', align: 'left', editable: true },
  ];

  return (
    <div className="flex flex-col h-full w-full bg-[#f1f5f9] select-none text-[12px]">
      {/* 1. 최상단 마스터 액션바 */}
      <MasterActionBar
        title="BOM(레시피) 정밀 관리"
        buttons={[
          { key: 'search', label: isLoading ? '조회중...' : '조회', icon: 'search', onClick: loadBom },
          { key: 'save', label: isSaving ? '저장중...' : '저장', icon: 'save', onClick: handleSave },
          {
            key: 'reset',
            label: '초기화',
            icon: 'reset',
            onClick: () => {
              setVarietyFilter('ALL');
              setSearchKeyword('');
              loadBom();
            },
          },
          {
            key: 'upload',
            label: isImporting ? '적재 진행중...' : 'BOM 일괄적재',
            icon: 'upload',
            onClick: handleBulkImport,
          },
          {
            key: 'download',
            label: 'BOM 총괄 엑셀',
            icon: 'download',
            onClick: () =>
              exportGridToExcel({
                filename: `BOM_기준정보_총괄_${new Date().toISOString().slice(0, 10)}`,
                sheetName: 'BOM목록',
                columns: UPPER_COLUMNS,
                data: filteredParents,
              }),
          },
          { key: 'copyImport', label: '유사메뉴 복사', icon: 'importCopy', onClick: handleCopyFrom },
        ]}
        helpContent="제품 생산을 위한 표준 BOM 배합비(소요 원부자재, 생산기준량 대비 투입량, 레시피 수율, 단위투입원가, 배치원가)를 등록하고 정밀 계산합니다."
      />

      {/* 2. 조건 검색 및 상단 요약 바 */}
      <div className="bg-white border-b border-[#cbd5e1] px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-gray-700 text-[12px]">품종:</span>
            <select
              value={varietyFilter}
              onChange={(e) => setVarietyFilter(e.target.value)}
              className="bg-white border border-gray-300 px-2 py-0.5 text-[12px] rounded font-medium shadow-2xs focus:border-blue-500 focus:outline-none"
            >
              <option value="ALL">ALL (전체 품종)</option>
              <option value="도시락">도시락</option>
              <option value="김밥">김밥</option>
              <option value="주먹밥">주먹밥</option>
              <option value="무스비">무스비</option>
              <option value="조리면">조리면</option>
              <option value="샌드위치/버거">샌드위치/버거</option>
              <option value="일반/기타">일반/기타</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 pl-3 border-l border-gray-300">
            <span className="font-bold text-gray-700 text-[12px]">검색어:</span>
            <div className="relative flex items-center">
              <input
                type="text"
                placeholder="품번, 완제품명, 또는 원부자재명(역전개)"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className="bg-white border border-gray-300 pl-2 pr-7 py-0.5 text-[12px] rounded shadow-2xs w-64 focus:border-blue-500 focus:outline-none"
              />
              {searchKeyword && (
                <button
                  type="button"
                  onClick={() => setSearchKeyword('')}
                  className="absolute right-1 text-gray-400 hover:text-gray-600"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11.5px] text-gray-600 bg-slate-50 px-2.5 py-0.5 rounded border border-slate-200 font-semibold shadow-2xs">
            BOM 등록 완제품: <span className="text-blue-700 font-black">{filteredParents.length}</span> / {parents.length}건
          </span>
        </div>
      </div>

      {/* 3. 메인 작업 영역: 상단 완제품 그리드 & 하단 원부자재 배합 그리드 */}
      <div className="flex-1 flex flex-col min-h-0 p-2 gap-2">
        {/* 상단: 완제품 목록 그리드 (50%) */}
        <div className="flex-[10] flex flex-col min-h-0 bg-white border border-[#94a3b8] rounded shadow-2xs">
          <div className="bg-[#e2e8f0] px-3 py-1 flex items-center justify-between border-b border-[#cbd5e1]">
            <div className="flex items-center gap-2">
              <span className="font-black text-slate-800 text-[12.5px] flex items-center gap-1">
                <Layers size={14} className="text-blue-700" /> 완제품 및 반제품 마스터
              </span>
              <span className="text-[11px] text-slate-500 font-medium">
                (원하시는 행을 클릭하면 하단에 실시간 정밀 배합비가 동기화됩니다)
              </span>
            </div>
            {selectedParent && (
              <span className="text-[11.5px] text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 font-semibold">
                선택됨: <span className="font-bold text-blue-800">{selectedParent.itemName}</span> ({selectedParent.itemCode})
              </span>
            )}
          </div>

          <div className="flex-1 min-h-0">
            <MasterDataGrid
              columns={UPPER_COLUMNS}
              data={filteredParents}
              selectedRowId={selectedParent?.id}
              onRowClick={(row) => {
                setSelectedParentId(row.id);
                const vs = versionsMap[row.id] || ['1.0'];
                setVersion(vs[vs.length - 1] || '1.0');
                setSelectedChildId(null);
              }}
              summaryRow={false}
              emptyMessage={isLoading ? 'BOM 데이터를 안전하게 불러오는 중입니다...' : '조건에 일치하는 BOM 데이터가 없습니다.'}
            />
          </div>
        </div>

        {/* 중단 KPI 요약 배너 */}
        {selectedParent && (
          <div className="bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 text-white px-3 py-1.5 rounded flex items-center justify-between shadow-xs border border-slate-700">
            <div className="flex items-center gap-3">
              <span className="bg-blue-600 text-[11px] font-bold px-2 py-0.5 rounded text-white shadow-2xs">
                {selectedParent.variety}
              </span>
              <span className="font-bold text-[13px] text-white">
                {selectedParent.itemName}
              </span>
              <span className="text-slate-300 text-[11.5px]">
                규격: {selectedParent.spec || '-'} · 단위: {selectedParent.unit} · 생산기준: {selectedParent.baseProdQty}개
              </span>
            </div>

            <div className="flex items-center gap-4 text-[12px]">
              <div className="flex items-center gap-1.5 bg-slate-700/60 px-2.5 py-0.5 rounded border border-slate-600">
                <span className="text-slate-300">배합자재:</span>
                <span className="font-bold text-yellow-300">{currentChildren.length}종</span>
              </div>
              <div className="flex items-center gap-1.5 bg-slate-700/60 px-2.5 py-0.5 rounded border border-slate-600">
                <span className="text-slate-300">단위 제조원가:</span>
                <span className="font-black text-emerald-300">{selectedParent.unitCost.toLocaleString()}원</span>
              </div>
              <div className="flex items-center gap-1.5 bg-slate-700/60 px-2.5 py-0.5 rounded border border-slate-600">
                <span className="text-slate-300">100ea 배치비용:</span>
                <span className="font-black text-cyan-300">{selectedParent.prodCost.toLocaleString()}원</span>
              </div>
              <div className="flex items-center gap-1.5 bg-slate-700/60 px-2.5 py-0.5 rounded border border-slate-600">
                <span className="text-slate-300">납품단가:</span>
                <span className="font-bold text-white">
                  {selectedParent.deliveryPrice > 0 ? `${selectedParent.deliveryPrice.toLocaleString()}원` : '미등록'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-300">원가율:</span>
                {selectedParent.costRate > 0 ? (
                  <span
                    className={`font-black px-2 py-0.5 rounded text-[11.5px] ${
                      selectedParent.costRate < 45
                        ? 'bg-emerald-600 text-white'
                        : selectedParent.costRate <= 60
                        ? 'bg-blue-600 text-white'
                        : 'bg-rose-600 text-white'
                    }`}
                  >
                    {selectedParent.costRate.toFixed(1)}%
                  </span>
                ) : (
                  <span className="text-slate-400 text-[11px]">-</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 하단: 소요 원부자재 레시피 상세 배합비 그리드 (50%) */}
        <div className="flex-[10] flex flex-col min-h-0 bg-white border border-[#94a3b8] rounded shadow-2xs">
          <div className="bg-[#e2e8f0] px-3 py-1 flex flex-wrap items-center justify-between border-b border-[#cbd5e1] gap-2">
            <div className="flex items-center gap-2">
              <span className="font-black text-slate-800 text-[12.5px] flex items-center gap-1">
                소요 원부자재 배합표 (Recipe Detail) ▶
              </span>
              <div className="flex items-center gap-1 pl-2 border-l border-slate-400">
                <span className="text-slate-600 font-semibold text-[11px]">버전:</span>
                <select
                  value={version}
                  onChange={(e) => handleVersionChange(e.target.value)}
                  className="bg-white border border-gray-300 px-1.5 py-0.5 text-[11px] rounded font-bold text-blue-800 focus:outline-none"
                  title="BOM 버전 전환"
                >
                  {(selectedParent ? versionsMap[selectedParent.id] || ['1.0'] : ['1.0']).map((v) => (
                    <option key={v} value={v}>
                      v{v}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleNewVersion}
                  className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded text-[11px] shadow-2xs transition-colors"
                  title="현재 배합비를 다음 버전(Minor)으로 복제 생성"
                >
                  새버전 생성
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {/* 유사메뉴 복사 선택 */}
              <div className="flex items-center gap-1 mr-1">
                <select
                  value={copySourceId}
                  onChange={(e) => setCopySourceId(e.target.value)}
                  className="bg-white border border-gray-300 px-1.5 py-0.5 text-[11px] rounded max-w-[180px] focus:outline-none"
                  title="복사해올 원본 제품 선택"
                >
                  <option value="">복사 원본 제품 선택...</option>
                  {parents
                    .filter((p) => p.id !== selectedParent?.id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.itemName} ({p.bomCount}종)
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  onClick={handleCopyFrom}
                  className="px-2 py-0.5 bg-slate-600 hover:bg-slate-700 text-white font-medium rounded text-[11px] shadow-2xs transition-colors"
                >
                  가져오기
                </button>
              </div>

              {/* 자재 추가 버튼 */}
              <button
                type="button"
                onClick={() => {
                  if (!selectedParent) {
                    alert('제품을 먼저 선택하세요.');
                    return;
                  }
                  setIsAddModalOpen(true);
                }}
                className="px-2.5 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded text-[11.5px] flex items-center gap-1 shadow-2xs transition-colors"
              >
                <Plus size={13} /> 자재 추가
              </button>

              {/* 자재 삭제 버튼 */}
              <button
                type="button"
                onClick={handleDeleteChild}
                disabled={!selectedChildId}
                className={`px-2 py-0.5 font-medium rounded text-[11px] flex items-center gap-1 shadow-2xs transition-colors ${
                  selectedChildId
                    ? 'bg-rose-600 hover:bg-rose-700 text-white cursor-pointer'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
                title="선택된 원부자재 행 삭제"
              >
                <Trash2 size={12} /> 삭제
              </button>

              {/* 레시피 엑셀 다운로드 */}
              <button
                type="button"
                onClick={() => {
                  if (!selectedParent) return;
                  exportGridToExcel({
                    filename: `BOM_레시피_${selectedParent.itemName}_v${version}_${new Date().toISOString().slice(0, 10)}`,
                    sheetName: '배합상세',
                    columns: LOWER_COLUMNS,
                    data: currentChildren,
                  });
                }}
                className="px-2 py-0.5 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded text-[11px] flex items-center gap-1 shadow-2xs transition-colors"
                title="현재 메뉴 레시피 배합표를 엑셀 파일로 다운로드"
              >
                <FileSpreadsheet size={12} /> 레시피 엑셀
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0">
            <MasterDataGrid
              columns={LOWER_COLUMNS}
              data={currentChildren}
              selectedRowId={selectedChildId}
              onRowClick={(row) => setSelectedChildId(row.id)}
              onCellChange={handleLowerCellChange}
              summaryRowTitle="합계"
              emptyMessage={
                selectedParent
                  ? '등록된 소요 원부자재가 없습니다. 우측 상단의 [+ 자재 추가] 버튼 또는 [유사메뉴 복사]를 이용하세요.'
                  : '상단에서 제품을 먼저 선택하세요.'
              }
            />
          </div>
        </div>
      </div>

      {/* 4. 원부자재 검색 및 추가 팝업 모달 */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-2xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-lg shadow-xl border border-gray-300 w-full max-w-2xl flex flex-col max-h-[85vh] overflow-hidden">
            {/* 모달 헤더 */}
            <div className="bg-slate-800 text-white px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plus size={16} className="text-emerald-400" />
                <span className="font-bold text-[14px]">레시피 소요 원부자재 추가</span>
                <span className="text-[12px] text-slate-300 font-normal">
                  - 대상: {selectedParent?.itemName}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-300 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* 검색 및 필터 바 */}
            <div className="p-3 bg-slate-50 border-b border-gray-200 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1">
                <span className="text-[12px] font-semibold text-gray-700">구분:</span>
                <select
                  value={modalCategoryFilter}
                  onChange={(e) => setModalCategoryFilter(e.target.value)}
                  className="bg-white border border-gray-300 px-2 py-1 text-[12px] rounded focus:outline-none"
                >
                  <option value="ALL">전체 구분</option>
                  <option value="원재료">원재료</option>
                  <option value="반제품">반제품</option>
                  <option value="부재료">부재료</option>
                  <option value="포장재">포장재</option>
                </select>
              </div>

              <div className="flex items-center gap-1 flex-1 min-w-[200px]">
                <input
                  type="text"
                  placeholder="품목코드 또는 품명 검색..."
                  value={modalSearchKeyword}
                  onChange={(e) => setModalSearchKeyword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') searchProducts();
                  }}
                  className="flex-1 bg-white border border-gray-300 px-2 py-1 text-[12px] rounded focus:border-blue-500 focus:outline-none"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={searchProducts}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-medium rounded flex items-center gap-1 transition-colors"
                >
                  <Search size={13} /> 검색
                </button>
              </div>
            </div>

            {/* 기본 투입 규격 및 수량 설정 */}
            <div className="px-4 py-2 bg-blue-50/60 border-b border-blue-100 flex items-center gap-4 text-[12px]">
              <span className="font-bold text-blue-900">기본 배합값 설정:</span>
              <div className="flex items-center gap-1">
                <span className="text-gray-600">소요량:</span>
                <input
                  type="number"
                  step="0.01"
                  value={newMaterialQty}
                  onChange={(e) => setNewMaterialQty(parseFloat(e.target.value) || 0)}
                  className="w-16 bg-white border border-gray-300 px-1.5 py-0.5 rounded text-right font-medium"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-gray-600">단위:</span>
                <input
                  type="text"
                  value={newMaterialUnit}
                  onChange={(e) => setNewMaterialUnit(e.target.value)}
                  className="w-12 bg-white border border-gray-300 px-1.5 py-0.5 rounded text-center font-medium"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-gray-600">수율(%):</span>
                <input
                  type="number"
                  value={newMaterialYield}
                  onChange={(e) => setNewMaterialYield(parseFloat(e.target.value) || 100)}
                  className="w-14 bg-white border border-gray-300 px-1.5 py-0.5 rounded text-right font-medium"
                />
              </div>
              <span className="text-[11px] text-slate-500">
                (원부자재를 선택하면 해당 기본값으로 레시피에 즉시 등록됩니다)
              </span>
            </div>

            {/* 품목 결과 리스트 */}
            <div className="flex-1 min-h-[300px] max-h-[400px] overflow-auto p-2">
              {isSearchingProducts ? (
                <div className="flex items-center justify-center h-48 text-gray-500 gap-2">
                  <RefreshCw size={16} className="animate-spin text-blue-600" />
                  원부자재 마스터를 검색 중입니다...
                </div>
              ) : searchResults.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-gray-400">
                  검색 결과가 없습니다. 검색어를 변경해보세요.
                </div>
              ) : (
                <table className="w-full border-collapse text-[12px]">
                  <thead>
                    <tr className="bg-slate-100 border-b border-gray-300 text-slate-700 font-bold sticky top-0">
                      <th className="py-1 px-2 text-center w-12">선택</th>
                      <th className="py-1 px-2 text-center w-24">품번</th>
                      <th className="py-1 px-2 text-center w-16">구분</th>
                      <th className="py-1 px-2 text-left">원부자재명</th>
                      <th className="py-1 px-2 text-center w-20">규격</th>
                      <th className="py-1 px-2 text-center w-14">단위</th>
                      <th className="py-1 px-2 text-right w-24">매입단가</th>
                      <th className="py-1 px-2 text-left w-24">공급처</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchResults.map((item) => (
                      <tr
                        key={item.id}
                        onDoubleClick={() => handleSelectMaterial(item)}
                        className="border-b border-gray-100 hover:bg-blue-50/80 transition-colors cursor-pointer"
                      >
                        <td className="py-1.5 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleSelectMaterial(item)}
                            className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-medium"
                          >
                            추가
                          </button>
                        </td>
                        <td className="py-1.5 px-2 text-center font-mono text-[11px] text-gray-600">
                          {item.productCode}
                        </td>
                        <td className="py-1.5 px-2 text-center text-gray-600">{item.category}</td>
                        <td className="py-1.5 px-2 font-bold text-gray-800">{item.name}</td>
                        <td className="py-1.5 px-2 text-center text-gray-500">{item.spec || '-'}</td>
                        <td className="py-1.5 px-2 text-center font-medium">{item.unit}</td>
                        <td className="py-1.5 px-2 text-right font-semibold text-blue-700">
                          {item.purchasePrice > 0 ? `${item.purchasePrice.toLocaleString()}원` : '-'}
                        </td>
                        <td className="py-1.5 px-2 text-gray-600 truncate max-w-[120px]">
                          {item.partnerName || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* 모달 푸터 */}
            <div className="bg-slate-100 px-4 py-2 flex items-center justify-between border-t border-gray-200">
              <span className="text-[11.5px] text-gray-600">
                총 <span className="font-bold text-blue-700">{searchResults.length}</span>개의 품목이 조회되었습니다. 행을 더블클릭해도 추가됩니다.
              </span>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-3 py-1 bg-gray-300 hover:bg-gray-400 text-gray-700 text-[12px] font-medium rounded transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

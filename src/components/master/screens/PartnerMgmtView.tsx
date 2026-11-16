'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { MasterActionBar } from '../common/MasterActionBar';
import { MasterDataGrid, MasterGridColumnDef } from '../common/MasterDataGrid';
import {
  Building2,
  Users,
  Phone,
  Mail,
  CreditCard,
  PackageCheck,
  Search,
  Plus,
  Trash2,
  Save,
  Download,
  Upload,
  RefreshCw,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  X,
  FileText,
  Clock,
  MapPin,
  Calendar,
} from 'lucide-react';
import { exportGridToExcel } from '@/lib/excelExport';
import * as XLSX from 'xlsx';

export interface SuppliedProduct {
  id: number;
  productCode: string;
  name: string;
  spec: string;
  unit: string;
  category: string;
  kind?: string;
  prices?: { purchasePrice: number }[];
}

export interface PartnerItem {
  id: string; // V001, S001 ...
  name: string;
  partnerType: 'P' | 'S' | 'O'; // P=매입처(협력사), S=매출처, O=당사
  bizNo: string;
  ceoName: string;
  bizType: string;
  bizCategory: string;
  zipCode: string;
  address: string;
  addressDetail: string;
  tel: string;
  fax: string;
  email: string;
  contactPerson: string;
  contactTel: string;
  bankName: string;
  bankAccount: string;
  bankHolder: string;
  taxType: string; // T1=과세, T2=면세, T3=영세
  leadTime: number;
  orderMethod: string;
  orderDay: string;
  closingDate: string;
  paymentTerms: string;
  remark: string;
  isUsed: boolean;
  productCount: number;
  products?: SuppliedProduct[];
}

export const PartnerMgmtView: React.FC = () => {
  const [partners, setPartners] = useState<PartnerItem[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'basic' | 'contact' | 'scm' | 'products'>('basic');
  const [typeFilter, setTypeFilter] = useState<string>('ALL'); // ALL, P, S, O
  const [usageFilter, setUsageFilter] = useState<string>('ALL'); // ALL, used, unused
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // 우측 상세 편집 폼 상태
  const [formData, setFormData] = useState<PartnerItem | null>(null);

  // 엑셀 일괄 업로드 모달 상태
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [uploadFileName, setUploadFileName] = useState<string>('');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. 거래처 데이터 DB 로드
  const loadPartners = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/master/partner');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const mapped: PartnerItem[] = json.data.map((p: any) => ({
          id: p.id,
          name: p.name || '',
          partnerType: (p.partnerType as 'P' | 'S' | 'O') || 'P',
          bizNo: p.bizNo || '',
          ceoName: p.ceoName || '',
          bizType: p.bizType || '',
          bizCategory: p.bizCategory || '',
          zipCode: p.zipCode || '',
          address: p.address || '',
          addressDetail: p.addressDetail || '',
          tel: p.tel || '',
          fax: p.fax || '',
          email: p.email || '',
          contactPerson: p.contactPerson || '',
          contactTel: p.contactTel || '',
          bankName: p.bankName || '',
          bankAccount: p.bankAccount || '',
          bankHolder: p.bankHolder || '',
          taxType: p.taxType || 'T1',
          leadTime: p.leadTime !== undefined ? Number(p.leadTime) : 1,
          orderMethod: p.orderMethod || '',
          orderDay: p.orderDay || '',
          closingDate: p.closingDate || '',
          paymentTerms: p.paymentTerms || '',
          remark: p.remark || '',
          isUsed: p.isUsed !== false,
          productCount: p._count?.products || 0,
          products: p.products || [],
        }));

        setPartners(mapped);

        // 첫 번째 거래처 자동 선택
        if (mapped.length > 0) {
          const first = mapped[0];
          setSelectedPartnerId(first.id);
          setFormData({ ...first });
        } else {
          setSelectedPartnerId(null);
          setFormData(null);
        }
      }
    } catch (err) {
      console.error('거래처 목록 로드 실패:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPartners();
  }, [loadPartners]);

  // 2. 실시간 필터링
  const filteredPartners = useMemo(() => {
    return partners.filter((p) => {
      // 구분 필터
      if (typeFilter !== 'ALL' && p.partnerType !== typeFilter) return false;

      // 사용 여부 필터
      if (usageFilter === 'used' && !p.isUsed) return false;
      if (usageFilter === 'unused' && p.isUsed) return false;

      // 검색어 필터 (코드, 거래처명, 사업자번호, 대표자, 담당자, 전화번호, 취급품목명)
      const kw = searchKeyword.trim().toLowerCase();
      if (!kw) return true;

      const directMatch =
        p.id.toLowerCase().includes(kw) ||
        p.name.toLowerCase().includes(kw) ||
        p.bizNo.replace(/-/g, '').includes(kw.replace(/-/g, '')) ||
        p.ceoName.toLowerCase().includes(kw) ||
        p.contactPerson.toLowerCase().includes(kw) ||
        p.tel.includes(kw);

      if (directMatch) return true;

      // 취급 품목 검색
      if (p.products && p.products.length > 0) {
        return p.products.some(
          (prod) =>
            prod.name.toLowerCase().includes(kw) ||
            prod.productCode.toLowerCase().includes(kw)
        );
      }

      return false;
    });
  }, [partners, typeFilter, usageFilter, searchKeyword]);

  // 필터 변경 시 선택 동기화
  useEffect(() => {
    if (filteredPartners.length > 0) {
      const exists = filteredPartners.some((p) => p.id === selectedPartnerId);
      if (!exists) {
        setSelectedPartnerId(filteredPartners[0].id);
        setFormData({ ...filteredPartners[0] });
      }
    }
  }, [filteredPartners, selectedPartnerId]);

  // 3. 통계 지표 산출
  const metrics = useMemo(() => {
    const total = partners.length;
    const purchaseCount = partners.filter((p) => p.partnerType === 'P').length;
    const salesCount = partners.filter((p) => p.partnerType === 'S').length;
    const withProducts = partners.filter((p) => p.productCount > 0).length;
    const avgLeadTime =
      total > 0
        ? Math.round(
            (partners.reduce((sum, p) => sum + (p.leadTime || 1), 0) / total) * 10
          ) / 10
        : 1.0;

    return { total, purchaseCount, salesCount, withProducts, avgLeadTime };
  }, [partners]);

  // 4. 행 클릭 시 상세 폼 동기화
  const handleSelectPartner = (row: PartnerItem) => {
    setSelectedPartnerId(row.id);
    setFormData({ ...row });
  };

  // 5. 신규 거래처 추가
  const handleNew = () => {
    // 자동 채번: V + 가장 큰 숫자 + 1
    const vNums = partners
      .filter((p) => p.id.startsWith('V'))
      .map((p) => parseInt(p.id.replace(/\D/g, ''), 10))
      .filter((n) => !isNaN(n));
    const nextNum = (vNums.length > 0 ? Math.max(...vNums) : 0) + 1;
    const nextId = `V${String(nextNum).padStart(3, '0')}`;

    const newPartner: PartnerItem = {
      id: nextId,
      name: '',
      partnerType: 'P',
      bizNo: '',
      ceoName: '',
      bizType: '제조/도소매',
      bizCategory: '식품원료',
      zipCode: '',
      address: '',
      addressDetail: '',
      tel: '',
      fax: '',
      email: '',
      contactPerson: '',
      contactTel: '',
      bankName: '',
      bankAccount: '',
      bankHolder: '',
      taxType: 'T1',
      leadTime: 1,
      orderMethod: '이메일/발주서',
      orderDay: '매일',
      closingDate: '99',
      paymentTerms: '마감후 익월말 현금',
      remark: '신규 등록 거래처',
      isUsed: true,
      productCount: 0,
      products: [],
    };

    setPartners((prev) => [newPartner, ...prev]);
    setSelectedPartnerId(newPartner.id);
    setFormData(newPartner);
    setActiveTab('basic');
  };

  // 6. 단건/상세 폼 저장
  const handleSave = async () => {
    if (!formData) return;
    if (!formData.id.trim()) {
      alert('거래처코드를 입력해주세요.');
      return;
    }
    if (!formData.name.trim()) {
      alert('거래처명을 입력해주세요.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/master/partner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const json = await res.json();
      if (json.success) {
        alert(`[${formData.name}] 거래처 정보가 안전하게 저장되었습니다.`);
        // 로컬 상태 동기화
        setPartners((prev) =>
          prev.map((p) => (p.id === formData.id ? { ...formData } : p))
        );
      } else {
        alert('저장 실패: ' + (json.error || '알 수 없는 오류'));
      }
    } catch (err: any) {
      alert('저장 중 오류: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // 7. 거래처 삭제/비활성화
  const handleDelete = async () => {
    if (!formData) return;
    if (!window.confirm(`[${formData.name}] (${formData.id}) 거래처를 삭제(또는 미사용 처리)하시겠습니까?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/master/partner?id=${encodeURIComponent(formData.id)}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (json.success) {
        alert(json.message || '거래처가 삭제되었습니다.');
        loadPartners();
      } else {
        alert('삭제 실패: ' + json.error);
      }
    } catch (err: any) {
      alert('삭제 중 오류: ' + err.message);
    }
  };

  // 8. 그리드 인라인 셀 변경 이벤트
  const handleCellChange = (id: any, colKey: string, val: any) => {
    setPartners((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          const updated = { ...p, [colKey]: val };
          if (formData && formData.id === id) {
            setFormData(updated);
          }
          return updated;
        }
        return p;
      })
    );
  };

  // 9. 엑셀 파일 선택 및 파싱
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(ws);

        if (rawJson.length === 0) {
          alert('엑셀 시트에 데이터가 없습니다.');
          return;
        }

        // 엑셀 헤더 매핑
        const normalized = rawJson.map((row, idx) => {
          const id = row['거래처코드'] || row['코드'] || row['ID'] || `V${String(idx + 1).padStart(3, '0')}`;
          const name = row['거래처명'] || row['상호'] || row['회사명'] || '';
          const typeStr = String(row['거래처구분'] || row['구분'] || '매입처').trim();
          const partnerType = typeStr.includes('매출') ? 'S' : typeStr.includes('당사') ? 'O' : 'P';
          const bizNo = row['사업자등록번호'] || row['사업자번호'] || '';
          const ceoName = row['대표자'] || row['대표자명'] || '';
          const leadTime = parseInt(row['조달기간'] || row['리드타임'] || '1', 10) || 1;
          const orderDay = row['발주요일'] || '매일';
          const orderMethod = row['주문방법'] || '이메일';
          const closingDate = String(row['마감일자'] || row['마감일'] || '99');
          const tel = row['전화번호'] || row['연락처'] || '';
          const email = row['이메일'] || row['email'] || '';
          const contactPerson = row['담당자'] || row['담당자명'] || '';
          const address = row['사업장주소'] || row['주소'] || '';

          return {
            id: String(id).trim(),
            name: String(name).trim(),
            partnerType,
            bizNo: String(bizNo).trim(),
            ceoName: String(ceoName).trim(),
            leadTime,
            orderDay: String(orderDay).trim(),
            orderMethod: String(orderMethod).trim(),
            closingDate,
            tel: String(tel).trim(),
            email: String(email).trim(),
            contactPerson: String(contactPerson).trim(),
            address: String(address).trim(),
            isUsed: true,
          };
        }).filter((r) => r.id && r.name);

        setParsedRows(normalized);
      } catch (err: any) {
        alert('엑셀 파싱 중 오류: ' + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  // 10. 엑셀 일괄 업로드 DB 실행
  const handleExecuteUpload = async () => {
    if (parsedRows.length === 0) {
      alert('업로드할 유효한 거래처 행이 없습니다.');
      return;
    }

    setIsUploading(true);
    try {
      const res = await fetch('/api/master/partner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsedRows),
      });
      const json = await res.json();
      if (json.success) {
        alert(json.message || `${parsedRows.length}건의 거래처가 성공적으로 등록/갱신되었습니다.`);
        setIsUploadModalOpen(false);
        setParsedRows([]);
        setUploadFileName('');
        loadPartners();
      } else {
        alert('업로드 실패: ' + (json.error || '알 수 없는 오류'));
      }
    } catch (err: any) {
      alert('업로드 중 오류: ' + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  // 11. 엑셀 표준 등록 양식 다운로드
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        거래처코드: 'V165',
        거래처구분: '매입처',
        거래처명: '새한식품(주)',
        사업자등록번호: '123-45-67890',
        대표자명: '홍길동',
        담당자명: '김철수',
        전화번호: '031-123-4567',
        이메일: 'vendor@saehan.co.kr',
        조달기간: 2,
        발주요일: '월,수,금',
        주문방법: '이메일',
        마감일자: '99',
        사업장주소: '경기도 광주시 곤지암읍 도척로 123',
      },
      {
        거래처코드: 'V166',
        거래처구분: '매입처',
        거래처명: '한성농산',
        사업자등록번호: '234-56-78901',
        대표자명: '이한성',
        담당자명: '박영희',
        전화번호: '02-987-6543',
        이메일: 'hansung@agri.com',
        조달기간: 1,
        발주요일: '매일',
        주문방법: '카카오톡',
        마감일자: '25',
        사업장주소: '서울특별시 가락동 농수산물시장 45동',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '거래처등록양식');
    XLSX.writeFile(wb, `거래처_일괄등록_표준양식.xlsx`);
  };

  // 12. 전체 그리드 컬럼 정의
  const COLUMNS: MasterGridColumnDef[] = [
    { key: 'isUsed', label: '사용', width: '45px', align: 'center', format: 'checkbox' },
    {
      key: 'partnerType',
      label: '구분',
      width: '70px',
      align: 'center',
      render: (val) => {
        if (val === 'S') return <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">매출처</span>;
        if (val === 'O') return <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300">당사</span>;
        return <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-300">매입처</span>;
      },
    },
    {
      key: 'id',
      label: '거래처코드',
      width: '95px',
      align: 'center',
      render: (val) => <span className="font-mono font-bold text-slate-800">{val}</span>,
    },
    {
      key: 'name',
      label: '거래처명',
      minWidth: '220px',
      align: 'left',
      render: (val, row) => (
        <span className={`font-bold ${!row.isUsed ? 'text-gray-400 line-through' : 'text-slate-900'}`}>
          {val}
        </span>
      ),
    },
    {
      key: 'productCount',
      label: '취급품목',
      width: '75px',
      align: 'right',
      render: (val) => {
        const num = Number(val) || 0;
        return num > 0 ? (
          <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 text-[11px]">
            {num}종
          </span>
        ) : (
          <span className="text-gray-400 text-[11px]">-</span>
        );
      },
    },
    { key: 'bizNo', label: '사업자번호', width: '115px', align: 'center' },
    { key: 'ceoName', label: '대표자', width: '80px', align: 'center' },
    {
      key: 'leadTime',
      label: '조달(일)',
      width: '65px',
      align: 'right',
      format: 'number',
      render: (val) => {
        const num = Number(val) || 1;
        return (
          <span className={num > 2 ? 'text-amber-700 font-bold' : 'text-slate-800'}>
            {num}일
          </span>
        );
      },
    },
    { key: 'orderDay', label: '발주요일', width: '85px', align: 'center' },
    { key: 'orderMethod', label: '주문방식', width: '85px', align: 'center' },
    {
      key: 'closingDate',
      label: '마감일자',
      width: '75px',
      align: 'center',
      render: (val) => (
        <span className={val === '99' || val === '말일' ? 'text-red-600 font-bold' : 'text-slate-700'}>
          {val === '99' ? '말일(99)' : val || '-'}
        </span>
      ),
    },
    { key: 'contactPerson', label: '담당자', width: '80px', align: 'center' },
    { key: 'tel', label: '연락처', width: '110px', align: 'center' },
    { key: 'email', label: '이메일', width: '160px', align: 'left' },
    { key: 'address', label: '사업장소재지', width: '220px', align: 'left' },
    { key: 'bankName', label: '거래은행', width: '85px', align: 'center' },
    { key: 'remark', label: '비고', width: '130px', align: 'left' },
  ];

  return (
    <div className="flex flex-col h-full w-full bg-[#f1f5f9] select-none text-[12px]">
      {/* 1. 최상단 마스터 액션바 */}
      <MasterActionBar
        title="거래처 마스터 (협력사)"
        buttons={[
          { key: 'new', label: '신규', icon: 'new', onClick: handleNew },
          { key: 'search', label: isLoading ? '조회중...' : '조회', icon: 'search', onClick: loadPartners },
          { key: 'save', label: isSaving ? '저장중...' : '저장', icon: 'save', onClick: handleSave },
          { key: 'delete', label: '삭제', icon: 'delete', onClick: handleDelete },
          {
            key: 'reset',
            label: '초기화',
            icon: 'reset',
            onClick: () => {
              setTypeFilter('ALL');
              setUsageFilter('ALL');
              setSearchKeyword('');
              loadPartners();
            },
          },
          {
            key: 'upload',
            label: '엑셀 일괄업로드',
            icon: 'upload',
            onClick: () => setIsUploadModalOpen(true),
          },
          {
            key: 'template',
            label: '양식 다운로드',
            icon: 'template',
            onClick: handleDownloadTemplate,
          },
          {
            key: 'download',
            label: '거래처 엑셀내보내기',
            icon: 'download',
            onClick: () =>
              exportGridToExcel({
                filename: `거래처_마스터_전체목록_${new Date().toISOString().slice(0, 10)}`,
                sheetName: '거래처',
                columns: COLUMNS,
                data: filteredPartners,
              }),
          },
        ]}
        helpContent="식자재 및 부재료를 공급하는 협력사(매입처), GS25 물류센터(매출처), 자사 계정의 사업자번호, 조달기간(Lead Time), 발주조건, 취급 품목 현황을 통합 관리합니다."
      />

      {/* 2. 상단 통계 KPI 요약 바 & 필터 영역 */}
      <div className="bg-white border-b border-[#cbd5e1] px-3 py-2 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        {/* 필터 그룹 */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-gray-700 text-[12px]">구분:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-white border border-gray-300 px-2 py-0.5 text-[12px] rounded font-semibold focus:border-blue-500 focus:outline-none"
            >
              <option value="ALL">ALL (전체 거래처)</option>
              <option value="P">매입처 (협력사)</option>
              <option value="S">매출처 (유통사)</option>
              <option value="O">당사 (자사계정)</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 pl-2 border-l border-gray-300">
            <span className="font-bold text-gray-700 text-[12px]">상태:</span>
            <select
              value={usageFilter}
              onChange={(e) => setUsageFilter(e.target.value)}
              className="bg-white border border-gray-300 px-2 py-0.5 text-[12px] rounded font-semibold focus:border-blue-500 focus:outline-none"
            >
              <option value="ALL">전체 상태</option>
              <option value="used">사용중 (Y)</option>
              <option value="unused">미사용 (N)</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 pl-2 border-l border-gray-300">
            <span className="font-bold text-gray-700 text-[12px]">검색:</span>
            <div className="relative flex items-center">
              <input
                type="text"
                placeholder="코드, 거래처명, 사업자번호, 대표자, 취급품목"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className="bg-white border border-gray-300 pl-2 pr-6 py-0.5 text-[12px] rounded shadow-2xs w-64 focus:border-blue-500 focus:outline-none"
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

        {/* 4대 KPI 지표 요약 카드 */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-[11.5px]">
            <span className="text-gray-600">총 거래처:</span>
            <span className="font-bold text-blue-700">{metrics.total}개사</span>
          </div>
          <div className="flex items-center gap-1 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded text-[11.5px]">
            <span className="text-blue-900">매입 협력사:</span>
            <span className="font-bold text-blue-800">{metrics.purchaseCount}개사</span>
          </div>
          <div className="flex items-center gap-1 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11.5px]">
            <span className="text-emerald-900">매출처:</span>
            <span className="font-bold text-emerald-800">{metrics.salesCount}개사</span>
          </div>
          <div className="flex items-center gap-1 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded text-[11.5px]">
            <span className="text-purple-900">품목 연결율:</span>
            <span className="font-bold text-purple-800">
              {metrics.withProducts}개사 ({metrics.total > 0 ? ((metrics.withProducts / metrics.total) * 100).toFixed(0) : 0}%)
            </span>
          </div>
        </div>
      </div>

      {/* 3. 메인 작업 화면: 좌측 목록 그리드 (63%) + 우측 정밀 상세 폼 (37%) */}
      <div className="flex-1 flex min-h-0 p-2 gap-2">
        {/* 좌측: 거래처 목록 마스터 그리드 */}
        <div className="flex-[63] flex flex-col min-h-0 bg-white border border-[#94a3b8] rounded shadow-2xs">
          <div className="bg-[#e2e8f0] px-3 py-1 flex items-center justify-between border-b border-[#cbd5e1]">
            <div className="flex items-center gap-2">
              <span className="font-black text-slate-800 text-[12.5px] flex items-center gap-1">
                <Building2 size={14} className="text-blue-700" /> 협력사 및 거래처 목록
              </span>
              <span className="text-[11px] text-slate-500 font-medium">
                (행을 클릭하면 우측 상세 패널에서 사업자/발주/취급품목을 편집할 수 있습니다)
              </span>
            </div>
            <span className="text-[11.5px] text-gray-600 bg-white px-2 py-0.5 rounded border border-gray-300 font-semibold shadow-2xs">
              조회: <span className="text-blue-700 font-bold">{filteredPartners.length}</span> / {partners.length}개사
            </span>
          </div>

          <div className="flex-1 min-h-0">
            <MasterDataGrid
              columns={COLUMNS}
              data={filteredPartners}
              selectedRowId={selectedPartnerId}
              onRowClick={handleSelectPartner}
              onCellChange={handleCellChange}
              summaryRow={false}
              emptyMessage={isLoading ? '거래처 마스터 데이터를 불러오는 중입니다...' : '검색 조건과 일치하는 거래처가 없습니다.'}
            />
          </div>
        </div>

        {/* 우측: 거래처 정밀 상세 관리 패널 */}
        <div className="flex-[37] flex flex-col min-h-0 bg-white border border-[#94a3b8] rounded shadow-2xs overflow-hidden">
          {formData ? (
            <div className="flex flex-col h-full">
              {/* 패널 헤더: 거래처 명칭 및 퀵 액션 */}
              <div className="bg-slate-800 text-white px-3 py-2 flex items-center justify-between border-b border-slate-700">
                <div className="flex items-center gap-2 overflow-hidden">
                  <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-blue-600 text-white shadow-2xs">
                    {formData.id}
                  </span>
                  <span className="font-bold text-[13px] text-white truncate max-w-[200px]" title={formData.name}>
                    {formData.name || '(거래처명 미입력)'}
                  </span>
                  <span className="text-[11px] text-slate-300">
                    [{formData.partnerType === 'S' ? '매출처' : formData.partnerType === 'O' ? '당사' : '매입처'}]
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded text-[11.5px] flex items-center gap-1 shadow-2xs transition-colors"
                  >
                    <Save size={12} /> {isSaving ? '저장중...' : '저장'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white font-medium rounded text-[11.5px] flex items-center gap-1 shadow-2xs transition-colors"
                    title="거래처 삭제"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {/* 탭 네비게이션 */}
              <div className="flex border-b border-gray-200 bg-slate-100 text-[11.5px]">
                <button
                  type="button"
                  onClick={() => setActiveTab('basic')}
                  className={`flex-1 py-1.5 px-2 font-bold text-center border-b-2 flex items-center justify-center gap-1 transition-colors ${
                    activeTab === 'basic'
                      ? 'border-blue-600 text-blue-700 bg-white'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-slate-200'
                  }`}
                >
                  <FileText size={12} /> 기본/사업자
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('contact')}
                  className={`flex-1 py-1.5 px-2 font-bold text-center border-b-2 flex items-center justify-center gap-1 transition-colors ${
                    activeTab === 'contact'
                      ? 'border-blue-600 text-blue-700 bg-white'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-slate-200'
                  }`}
                >
                  <Phone size={12} /> 연락처/주소
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('scm')}
                  className={`flex-1 py-1.5 px-2 font-bold text-center border-b-2 flex items-center justify-center gap-1 transition-colors ${
                    activeTab === 'scm'
                      ? 'border-blue-600 text-blue-700 bg-white'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-slate-200'
                  }`}
                >
                  <CreditCard size={12} /> 발주/금융
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('products')}
                  className={`flex-1 py-1.5 px-2 font-bold text-center border-b-2 flex items-center justify-center gap-1 transition-colors ${
                    activeTab === 'products'
                      ? 'border-blue-600 text-blue-700 bg-white'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-slate-200'
                  }`}
                >
                  <PackageCheck size={12} /> 취급품목 ({formData.productCount || 0})
                </button>
              </div>

              {/* 탭 콘텐츠 본문 (스크롤 지원) */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-[#fafafa]">
                {/* 탭 1: 기본 및 사업자 정보 */}
                {activeTab === 'basic' && (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-gray-600 mb-0.5">거래처코드 *</label>
                        <input
                          type="text"
                          value={formData.id}
                          onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                          className="w-full bg-white border border-gray-300 px-2 py-1 rounded font-mono font-bold text-slate-800 text-[12px] focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-gray-600 mb-0.5">거래처구분 *</label>
                        <select
                          value={formData.partnerType}
                          onChange={(e) => setFormData({ ...formData, partnerType: e.target.value as any })}
                          className="w-full bg-white border border-gray-300 px-2 py-1 rounded font-semibold text-[12px] focus:border-blue-500 focus:outline-none"
                        >
                          <option value="P">매입처 (식자재/원부자재 협력사)</option>
                          <option value="S">매출처 (완제품 납품처/GS리테일)</option>
                          <option value="O">당사 (GFS 사내 계정)</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 mb-0.5">거래처명 (상호) *</label>
                      <input
                        type="text"
                        placeholder="예: CJ제일제당(주)"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full bg-white border border-gray-300 px-2 py-1 rounded font-bold text-slate-900 text-[12px] focus:border-blue-500 focus:outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-gray-600 mb-0.5">사업자등록번호</label>
                        <input
                          type="text"
                          placeholder="000-00-00000"
                          value={formData.bizNo}
                          onChange={(e) => setFormData({ ...formData, bizNo: e.target.value })}
                          className="w-full bg-white border border-gray-300 px-2 py-1 rounded text-[12px] focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-gray-600 mb-0.5">대표자명</label>
                        <input
                          type="text"
                          placeholder="대표자 성명"
                          value={formData.ceoName}
                          onChange={(e) => setFormData({ ...formData, ceoName: e.target.value })}
                          className="w-full bg-white border border-gray-300 px-2 py-1 rounded text-[12px] focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-gray-600 mb-0.5">업태</label>
                        <input
                          type="text"
                          placeholder="예: 제조업, 도소매"
                          value={formData.bizType}
                          onChange={(e) => setFormData({ ...formData, bizType: e.target.value })}
                          className="w-full bg-white border border-gray-300 px-2 py-1 rounded text-[12px] focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-gray-600 mb-0.5">종목</label>
                        <input
                          type="text"
                          placeholder="예: 식품첨가물, 농산물"
                          value={formData.bizCategory}
                          onChange={(e) => setFormData({ ...formData, bizCategory: e.target.value })}
                          className="w-full bg-white border border-gray-300 px-2 py-1 rounded text-[12px] focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-200">
                      <div>
                        <label className="block text-[11px] font-bold text-gray-600 mb-0.5">과세구분</label>
                        <select
                          value={formData.taxType}
                          onChange={(e) => setFormData({ ...formData, taxType: e.target.value })}
                          className="w-full bg-white border border-gray-300 px-2 py-1 rounded text-[12px] focus:border-blue-500 focus:outline-none"
                        >
                          <option value="T1">과세 (세금계산서 10%)</option>
                          <option value="T2">면세 (계산서)</option>
                          <option value="T3">영세 (수출/영세율)</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-2 pt-4">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.isUsed}
                            onChange={(e) => setFormData({ ...formData, isUsed: e.target.checked })}
                            className="w-4 h-4 text-blue-600 rounded"
                          />
                          <span className="font-bold text-[12px] text-gray-700">거래처 사용 여부</span>
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 mb-0.5">비고 / 거래 특이사항</label>
                      <textarea
                        rows={2}
                        placeholder="특이사항, 단가협상 메모 등"
                        value={formData.remark}
                        onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                        className="w-full bg-white border border-gray-300 p-2 rounded text-[12px] focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* 탭 2: 연락처 및 사업장 소재지 */}
                {activeTab === 'contact' && (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-gray-600 mb-0.5">대표 전화</label>
                        <input
                          type="text"
                          placeholder="02-0000-0000"
                          value={formData.tel}
                          onChange={(e) => setFormData({ ...formData, tel: e.target.value })}
                          className="w-full bg-white border border-gray-300 px-2 py-1 rounded text-[12px] focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-gray-600 mb-0.5">대표 팩스</label>
                        <input
                          type="text"
                          placeholder="02-0000-0000"
                          value={formData.fax}
                          onChange={(e) => setFormData({ ...formData, fax: e.target.value })}
                          className="w-full bg-white border border-gray-300 px-2 py-1 rounded text-[12px] focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 mb-0.5">대표/발주 이메일</label>
                      <input
                        type="email"
                        placeholder="order@partner.com"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full bg-white border border-gray-300 px-2 py-1 rounded text-[12px] focus:border-blue-500 focus:outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-200">
                      <div>
                        <label className="block text-[11px] font-bold text-gray-600 mb-0.5">영업/담당자명</label>
                        <input
                          type="text"
                          placeholder="예: 홍길동 팀장"
                          value={formData.contactPerson}
                          onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                          className="w-full bg-white border border-gray-300 px-2 py-1 rounded text-[12px] focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-gray-600 mb-0.5">담당자 직통/휴대폰</label>
                        <input
                          type="text"
                          placeholder="010-0000-0000"
                          value={formData.contactTel}
                          onChange={(e) => setFormData({ ...formData, contactTel: e.target.value })}
                          className="w-full bg-white border border-gray-300 px-2 py-1 rounded text-[12px] focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="pt-1 border-t border-gray-200">
                      <div className="mb-2">
                        <label className="block text-[11px] font-bold text-gray-600 mb-0.5">우편번호</label>
                        <input
                          type="text"
                          placeholder="00000"
                          value={formData.zipCode}
                          onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                          className="w-28 bg-white border border-gray-300 px-2 py-1 rounded text-[12px] focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                      <div className="mb-2">
                        <label className="block text-[11px] font-bold text-gray-600 mb-0.5">사업장 기본주소</label>
                        <input
                          type="text"
                          placeholder="시/도 구/군 도로명 주소"
                          value={formData.address}
                          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                          className="w-full bg-white border border-gray-300 px-2 py-1 rounded text-[12px] focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-gray-600 mb-0.5">상세주소</label>
                        <input
                          type="text"
                          placeholder="공장명, 동/호수 등"
                          value={formData.addressDetail}
                          onChange={(e) => setFormData({ ...formData, addressDetail: e.target.value })}
                          className="w-full bg-white border border-gray-300 px-2 py-1 rounded text-[12px] focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 탭 3: 발주조건 및 금융 계좌 */}
                {activeTab === 'scm' && (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-gray-600 mb-0.5">
                          조달기간 (Lead Time, 일)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={30}
                          value={formData.leadTime}
                          onChange={(e) => setFormData({ ...formData, leadTime: Number(e.target.value) || 1 })}
                          className="w-full bg-white border border-gray-300 px-2 py-1 rounded font-bold text-slate-800 text-[12px] focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-gray-600 mb-0.5">주문방법 (수단)</label>
                        <input
                          type="text"
                          placeholder="EDI, 이메일, 카카오톡, 전화"
                          value={formData.orderMethod}
                          onChange={(e) => setFormData({ ...formData, orderMethod: e.target.value })}
                          className="w-full bg-white border border-gray-300 px-2 py-1 rounded text-[12px] focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-gray-600 mb-0.5">발주 요일</label>
                        <input
                          type="text"
                          placeholder="예: 매일, 월,수,금"
                          value={formData.orderDay}
                          onChange={(e) => setFormData({ ...formData, orderDay: e.target.value })}
                          className="w-full bg-white border border-gray-300 px-2 py-1 rounded text-[12px] focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-gray-600 mb-0.5">
                          마감일자 (말일=99)
                        </label>
                        <input
                          type="text"
                          placeholder="99 또는 25, 30"
                          value={formData.closingDate}
                          onChange={(e) => setFormData({ ...formData, closingDate: e.target.value })}
                          className="w-full bg-white border border-gray-300 px-2 py-1 rounded text-[12px] focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 mb-0.5">결제 조건</label>
                      <input
                        type="text"
                        placeholder="예: 마감후 익월말 현금결제, 세금계산서 청구후 30일"
                        value={formData.paymentTerms}
                        onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                        className="w-full bg-white border border-gray-300 px-2 py-1 rounded text-[12px] focus:border-blue-500 focus:outline-none"
                      />
                    </div>

                    <div className="pt-2 border-t border-gray-200">
                      <span className="font-bold text-[12px] text-slate-800 mb-1.5 block">정산 / 결제 은행 계좌</span>
                      <div className="grid grid-cols-3 gap-2 mb-2">
                        <div>
                          <label className="block text-[11px] font-bold text-gray-600 mb-0.5">은행명</label>
                          <input
                            type="text"
                            placeholder="국민, 기업 등"
                            value={formData.bankName}
                            onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                            className="w-full bg-white border border-gray-300 px-2 py-1 rounded text-[12px] focus:border-blue-500 focus:outline-none"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-[11px] font-bold text-gray-600 mb-0.5">계좌번호</label>
                          <input
                            type="text"
                            placeholder="000-000000-00-000"
                            value={formData.bankAccount}
                            onChange={(e) => setFormData({ ...formData, bankAccount: e.target.value })}
                            className="w-full bg-white border border-gray-300 px-2 py-1 rounded text-[12px] focus:border-blue-500 focus:outline-none"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-gray-600 mb-0.5">예금주</label>
                        <input
                          type="text"
                          placeholder="예금주 성명/상호"
                          value={formData.bankHolder}
                          onChange={(e) => setFormData({ ...formData, bankHolder: e.target.value })}
                          className="w-full bg-white border border-gray-300 px-2 py-1 rounded text-[12px] focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 탭 4: 취급 원부자재 품목 현황 */}
                {activeTab === 'products' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 text-[12px]">
                        공급 원부자재/상품 ({formData.products?.length || 0}건)
                      </span>
                      <span className="text-[11px] text-gray-500">
                        품목 마스터에서 해당 거래처로 지정된 자재 목록입니다
                      </span>
                    </div>

                    {formData.products && formData.products.length > 0 ? (
                      <div className="border border-gray-200 rounded overflow-hidden max-h-[360px] overflow-y-auto">
                        <table className="w-full border-collapse text-[11.5px]">
                          <thead>
                            <tr className="bg-slate-100 border-b border-gray-200 text-slate-700 font-bold sticky top-0">
                              <th className="py-1 px-2 text-center w-20">품번</th>
                              <th className="py-1 px-2 text-center w-14">구분</th>
                              <th className="py-1 px-2 text-left">품목명</th>
                              <th className="py-1 px-2 text-center w-16">규격</th>
                              <th className="py-1 px-2 text-center w-12">단위</th>
                              <th className="py-1 px-2 text-right w-20">매입단가</th>
                            </tr>
                          </thead>
                          <tbody>
                            {formData.products.map((p) => {
                              const price = p.prices?.[0]?.purchasePrice || 0;
                              return (
                                <tr key={p.id} className="border-b border-gray-100 hover:bg-blue-50/50">
                                  <td className="py-1 px-2 text-center font-mono text-gray-600">{p.productCode}</td>
                                  <td className="py-1 px-2 text-center text-gray-500">{p.category}</td>
                                  <td className="py-1 px-2 font-bold text-slate-800">{p.name}</td>
                                  <td className="py-1 px-2 text-center text-gray-500">{p.spec || '-'}</td>
                                  <td className="py-1 px-2 text-center font-medium">{p.unit}</td>
                                  <td className="py-1 px-2 text-right font-semibold text-blue-700">
                                    {price > 0 ? `${price.toLocaleString()}원` : '-'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="bg-white border border-dashed border-gray-300 rounded p-6 text-center text-gray-400 text-[12px]">
                        현재 이 거래처로 등록된 원부자재가 없습니다.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
              <Building2 size={32} className="text-gray-300" />
              <span>좌측 목록에서 거래처를 선택하세요.</span>
            </div>
          )}
        </div>
      </div>

      {/* 4. 엑셀 일괄 업로드 모달 */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-2xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-lg shadow-xl border border-gray-300 w-full max-w-3xl flex flex-col max-h-[85vh] overflow-hidden">
            {/* 모달 헤더 */}
            <div className="bg-slate-800 text-white px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Upload size={16} className="text-blue-400" />
                <span className="font-bold text-[14px]">거래처 마스터 엑셀 일괄 업로드</span>
              </div>
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="text-slate-300 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* 파일 선택 드롭존 */}
            <div className="p-4 bg-slate-50 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".xlsx, .xls"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded text-[12px] flex items-center gap-1.5 shadow-2xs transition-colors"
                >
                  <FileSpreadsheet size={14} /> 엑셀 파일 선택 (.xlsx)
                </button>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-medium rounded text-[12px] flex items-center gap-1.5 transition-colors"
                >
                  <Download size={14} /> 표준 등록 양식 다운로드
                </button>
                {uploadFileName && (
                  <span className="text-[12px] font-bold text-blue-800 truncate">
                    선택된 파일: {uploadFileName} ({parsedRows.length}건 인식됨)
                  </span>
                )}
              </div>
            </div>

            {/* 파싱된 행 미리보기 그리드 */}
            <div className="flex-1 min-h-[300px] max-h-[420px] overflow-auto p-3">
              {parsedRows.length > 0 ? (
                <table className="w-full border-collapse text-[11.5px]">
                  <thead>
                    <tr className="bg-slate-100 border-b border-gray-300 text-slate-700 font-bold sticky top-0">
                      <th className="py-1 px-2 text-center w-20">거래처코드</th>
                      <th className="py-1 px-2 text-center w-16">구분</th>
                      <th className="py-1 px-2 text-left">거래처명</th>
                      <th className="py-1 px-2 text-center w-24">사업자번호</th>
                      <th className="py-1 px-2 text-center w-16">대표자</th>
                      <th className="py-1 px-2 text-center w-14">조달(일)</th>
                      <th className="py-1 px-2 text-center w-20">발주요일</th>
                      <th className="py-1 px-2 text-center w-24">연락처</th>
                      <th className="py-1 px-2 text-left">이메일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((r, i) => (
                      <tr key={i} className="border-b border-gray-100 hover:bg-blue-50/50">
                        <td className="py-1 px-2 text-center font-mono font-bold text-slate-800">{r.id}</td>
                        <td className="py-1 px-2 text-center font-semibold text-blue-700">
                          {r.partnerType === 'S' ? '매출처' : r.partnerType === 'O' ? '당사' : '매입처'}
                        </td>
                        <td className="py-1 px-2 font-bold text-slate-900">{r.name}</td>
                        <td className="py-1 px-2 text-center text-gray-600">{r.bizNo || '-'}</td>
                        <td className="py-1 px-2 text-center text-gray-600">{r.ceoName || '-'}</td>
                        <td className="py-1 px-2 text-center font-bold text-slate-800">{r.leadTime}일</td>
                        <td className="py-1 px-2 text-center text-gray-600">{r.orderDay}</td>
                        <td className="py-1 px-2 text-center text-gray-600">{r.tel || '-'}</td>
                        <td className="py-1 px-2 text-gray-600 truncate max-w-[150px]">{r.email || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-2">
                  <FileSpreadsheet size={32} className="text-gray-300" />
                  <span>위의 [엑셀 파일 선택]을 눌러 업로드할 파일을 지정하세요.</span>
                  <span className="text-[11px] text-gray-400">
                    첫 번째 행이 컬럼명(거래처코드, 거래처명, 사업자번호 등)이어야 합니다.
                  </span>
                </div>
              )}
            </div>

            {/* 모달 푸터 */}
            <div className="bg-slate-100 px-4 py-2.5 flex items-center justify-between border-t border-gray-200">
              <span className="text-[12px] text-gray-600">
                총 <span className="font-bold text-blue-700">{parsedRows.length}</span>건의 거래처를 데이터베이스에 등록합니다.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="px-3 py-1 bg-gray-300 hover:bg-gray-400 text-gray-700 text-[12px] font-medium rounded transition-colors"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleExecuteUpload}
                  disabled={parsedRows.length === 0 || isUploading}
                  className={`px-4 py-1 text-white text-[12px] font-bold rounded shadow-2xs transition-colors ${
                    parsedRows.length > 0 && !isUploading
                      ? 'bg-blue-600 hover:bg-blue-700 cursor-pointer'
                      : 'bg-gray-400 cursor-not-allowed'
                  }`}
                >
                  {isUploading ? '일괄 등록 진행중...' : '일괄 등록/갱신 실행'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

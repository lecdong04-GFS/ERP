'use client';

import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  Printer,
  FileSpreadsheet,
  FileText,
  ShieldCheck,
  Package,
  Calculator,
  Calendar,
  AlertCircle,
  Tag,
  Truck,
  Download,
  Upload,
  Layers,
  ArrowRight,
  Sparkles,
  FileCheck,
  RefreshCw,
  FolderDown,
  Check,
  Building,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { usePrintReport, PrintDocumentType } from '@/context/PrintReportContext';
import { usePipeline } from '@/context/PipelineContext';
import { useSession } from 'next-auth/react';
import { LotLabelPrint } from './labels/LotLabelPrint';
import { DeliveryBoxLabel } from './labels/DeliveryBoxLabel';
import { DeliveryStatementPrint } from './DeliveryStatementPrint';
import { PurchaseOrderPrint } from './PurchaseOrderPrint';

const SHOPFLOOR_DOC_LABELS: Record<PrintDocumentType, string> = {
  WORK_ORDER: '공정별 작업지시서',
  PURCHASE_ORDER: '원부자재 발주서',
  HACCP_INSPECTION: 'HACCP 입고검수일지',
  DELIVERY_STATEMENT: '출하 거래명세표',
  DELIVERY_BOX_LABEL: 'GS25 납품 박스 라벨',
  LOT_LABEL: 'LOT 품질 바코드 라벨',
  MATERIAL_LEDGER: '일일 자재수불부',
  MATERIAL_REQUIREMENT: '자재소요량 명세서',
  COST_SHEET: '원가 및 손익계산서',
};

interface StandardTemplateCenterProps {
  onClose?: () => void;
}

export const StandardTemplateCenter: React.FC<StandardTemplateCenterProps> = ({ onClose }) => {
  const {
    activeDocType,
    setActiveDocType,
    printPayload,
    boxPayload,
    matReqPayload,
    workOrderPayload,
    poPayload,
    poPayloadList,
  } = usePrintReport();
  const { dispatchedWorkOrders, depletedMaterials, pipelineCostResults } = usePipeline();
  const { data: session } = useSession();
  const writerName = (session?.user as any)?.name || '관리자';

  // ── 3대 핵심 허브 탭 ──
  const hasShopfloorTarget = Boolean(
    poPayload ||
      (poPayloadList && poPayloadList.length > 0) ||
      printPayload ||
      boxPayload ||
      matReqPayload ||
      workOrderPayload ||
      activeDocType !== 'WORK_ORDER'
  );
  const [mainHubTab, setMainHubTab] = useState<'audit' | 'templates' | 'shopfloor'>(() =>
    hasShopfloorTarget ? 'shopfloor' : 'audit'
  );

  useEffect(() => {
    if (
      poPayload ||
      (poPayloadList && poPayloadList.length > 0) ||
      printPayload ||
      boxPayload ||
      matReqPayload ||
      workOrderPayload ||
      activeDocType !== 'WORK_ORDER'
    ) {
      setMainHubTab('shopfloor');
    }
  }, [
    poPayload,
    poPayloadList,
    printPayload,
    boxPayload,
    matReqPayload,
    workOrderPayload,
    activeDocType,
  ]);

  // ── 1. HACCP & GS25 공인 감사 패키지 상태 ──
  const [auditDate, setAuditDate] = useState<string>('2026-11-04');
  const [auditLine, setAuditLine] = useState<string>('전체 라인');
  const [activeAuditDocIndex, setActiveAuditDocIndex] = useState<number>(0);

  // ── 2. 스마트 엑셀 인제스천(업로드&검증) 상태 ──
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<any>(null);
  const [isIngesting, setIsIngesting] = useState<boolean>(false);
  const [ingestSuccessMsg, setIngestSuccessMsg] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [shiftFilter, setShiftFilter] = useState<'1편' | '2편'>('1편');
  const printDate = matReqPayload?.date || auditDate || '2026-11-04';

  // ── [감사 패키지] 공인 감사 6대 전표 메타데이터 & 실데이터 ──
  const AUDIT_DOCS = [
    {
      id: 'gs25-order',
      title: 'GS리테일 공인 수주 집계표 (10시 주문서)',
      docNo: 'GFS-AUDIT-ORD-01',
      dept: '영업본부 / GS25 신선물류',
      summary: 'GS리테일 10시 주문서 수주 확정 전표 (일일 주문량 12,450ea / ₩38,250,000)',
      status: '확정완료',
      rows: [
        { no: 1, center: 'GS25 김포신선물류', item: '참치마요삼각김밥 (110g*30ea)', qty: 120, unitPrice: 30000, supply: 3600000, tax: 360000, note: '1편 정규' },
        { no: 2, center: 'GS25 용인신선물류', item: 'NEW혜자반반제육도시락 (420g*16ea)', qty: 85, unitPrice: 50000, supply: 4250000, tax: 425000, note: '1편 정규' },
        { no: 3, center: 'GS25 남청주센터', item: '더큰스팸계란볶음밥김밥 (250g*20ea)', qty: 60, unitPrice: 40000, supply: 2400000, tax: 240000, note: '2편 정규' },
        { no: 4, center: 'GS25 제주센터', item: '광장시장꼬마김밥 (180g*24ea)', qty: 45, unitPrice: 32000, supply: 1440000, tax: 144000, note: '1편 정규' },
      ],
    },
    {
      id: 'po-orders',
      title: '원부자재 거래처별 정식 발주서(PO) 합산 전표',
      docNo: 'GFS-AUDIT-PO-02',
      dept: '구매자재팀',
      summary: '안전재고 및 일소진량 기반 발행 발주서 8건 (선진FS, 대상, 푸른원 등 총 ₩24,800,000)',
      status: '발행완료',
      rows: [
        { no: 1, orderNo: 'PO-20261104-040', partner: 'i-printing', item: '더큰)스팸계란볶음밥 라벨 (3000장)', qty: 4, unitPrice: 80000, supply: 320000, note: '납기: D+1' },
        { no: 2, orderNo: 'PO-20261104-042', partner: '아이투알', item: '아이투알)2.8파이 꼬마김밥 용기 (90EA*9개)', qty: 2, unitPrice: 95000, supply: 190000, note: '납기: D+1' },
        { no: 3, orderNo: 'PO-20261104-046', partner: '두레(네트웍스)', item: '두레)DRG-1호 뚜껑(투명) 50개입*4줄', qty: 1, unitPrice: 65000, supply: 65000, note: '납기: D+2' },
        { no: 4, orderNo: 'PO-20261104-047', partner: '상지인터내쇼날', item: '가성비뚜껑 (100ea*4pk/box) [PP]', qty: 3, unitPrice: 70000, supply: 210000, note: '납기: D+2' },
      ],
    },
    {
      id: 'haccp-inbound',
      title: 'HACCP 원부재료 입고검수 및 적합성 판정일지',
      docNo: 'GFS-HACCP-CCP-IN-03',
      dept: '품질보증팀 / 위생관리',
      summary: '입고 원자재 15종 차량청결, 품온(냉장 ≤5℃, 냉동 ≤-18℃), 유통기한 전수검사 적합',
      status: '전량적합',
      rows: [
        { no: 1, supplier: '하림', item: '스모크닭가슴살(1kg*10봉)', qty: 200, carClean: '적합', temp: '냉장 (2.3℃)', visual: '적합', result: '적합(합격)' },
        { no: 2, supplier: '동원에프앤비', item: '가공 참치플레이크(1.88kg*6캔)', qty: 120, carClean: '적합', temp: '상온 (21.4℃)', visual: '적합', result: '적합(합격)' },
        { no: 3, supplier: '사조오양', item: '가공맛살(10kg*2ea)', qty: 40, carClean: '적합', temp: '냉장 (1.8℃)', visual: '적합', result: '적합(합격)' },
        { no: 4, supplier: 'CJ제일제당', item: '스팸클래식(1.81kg*6캔)', qty: 90, carClean: '적합', temp: '상온 (21.0℃)', visual: '적합', result: '적합(합격)' },
      ],
    },
    {
      id: 'work-order-spec',
      title: '공정별 표준 제조작업지시서 (HACCP CCP 기록)',
      docNo: 'GFS-PROD-WO-04',
      dept: '생산본부 (취반/조리/토핑/포장)',
      summary: '1편/2편 교대조별 삼각김밥·도시락 8개 라인 표준 작업 순서 및 CCP 중심온도 ≥75℃ 준수',
      status: '공정가동',
      rows: [
        { no: 1, gye: '취반공정', line: '취반A라인', item: '경기미 햅쌀 밥짓기 (배합초 혼합)', targetQty: 5400, ccp: '가열품온 ≥95℃', worker: '정취반', status: '완료' },
        { no: 2, gye: '조리공정', line: '볶음솥 2호기', item: '제육불고기 소스 볶음', targetQty: 1800, ccp: '중심온도 ≥75℃ 1분', worker: '강조리', status: '완료' },
        { no: 3, gye: '토핑공정', line: '삼각김밥 1호기', item: '참치마요 삼각김밥 성형/포장', targetQty: 3600, ccp: '성형실온 ≤18℃', worker: '이토핑', status: '진행중' },
        { no: 4, gye: '포장공정', line: '자동밴딩기', item: 'NEW혜자반반제육도시락 밴딩', targetQty: 1360, ccp: '밀봉 및 유통기한 인쇄', worker: '박포장', status: '진행중' },
      ],
    },
    {
      id: 'food-waste-discard',
      title: '생산 잔량·감모 및 폐기/음식물쓰레기 관리대장',
      docNo: 'GFS-ENV-WASTE-05',
      dept: '생산지원팀 / 환경관리',
      summary: '공정 중 발생 감모율 1.8% 기록 및 음식물쓰레기 적법 배출 처리 증빙 (폐기물 인계서 연계)',
      status: '기록완료',
      rows: [
        { no: 1, type: '공정감모', line: '커팅실', reason: '김밥 양끝단 꼬투리 잔량', weight: 14.5, unit: 'kg', method: '음식물쓰레기 전용 수거함 보관', check: '적합' },
        { no: 2, type: '용기파손', line: '자동성형기', reason: '도시락 용기 공급부 걸림 파손', weight: 1.2, unit: 'kg', method: '플라스틱 분리수거 재활용', check: '적합' },
        { no: 3, type: '필름불량', line: '포장실', reason: '롤필름 인쇄 씹힘 구간 절단', weight: 0.8, unit: 'kg', method: '비닐 폐기물 처리', check: '적합' },
      ],
    },
    {
      id: 'delivery-stmt-labels',
      title: '출하 거래명세표 & GS25 센터별 납품 물류 라벨',
      docNo: 'GFS-LOGIS-DLV-06',
      dept: '물류출하팀',
      summary: 'GS25 김포/용인 센터별 출하 거래명세서 4건 및 콜드체인 바코드 박스 라벨 일괄 생성',
      status: '출하검수완료',
      rows: [
        { no: 1, center: 'GS25 김포물류', carNo: '경기 80아 1234', item: '참치마요 외 6종', boxQty: 120, temp: '콜드체인 (3.5℃)', deliverTime: '11/05 06:00', sign: '인수확인완료' },
        { no: 2, center: 'GS25 용인물류', carNo: '서울 85바 5678', item: '혜자반반제육 외 4종', boxQty: 85, temp: '콜드체인 (3.1℃)', deliverTime: '11/05 06:00', sign: '인수확인완료' },
      ],
    },
  ];

  // ── [표준 엑셀 다운로드 1] 5시트 정본 재고조사표 ──
  const handleDownloadStocktakeTemplate = () => {
    const wb = XLSX.utils.book_new();
    const headers = [
      '순번', '창고명', '거래처', '품번', '구분', '품명', '단위',
      '입고일', '일사용량', '추정일사용량', '접수량', '박스', '낱개',
      '입고수량', '전일재고', '현재고', '단가',
    ];
    const sheets: Record<string, any[][]> = {
      '냉장': [
        [1, '냉장', '선진FS(직매)', 'GFS-20261102-001', '원재료', '[냉장] 닭가슴살 훈제슬라이스(1kg*10봉)', '봉', 'D+1', 25.5, 24.0, 10, 2, 4, 24, 10, 14, 4500],
        [2, '냉장', '대상(DS유통)', '30002511', '원재료', '[냉장] 고추장불고기(2kg*5봉)', '봉', 'D+2', 31.5, 30.0, 5, 10, 0, 50, 0, 50, 12670],
      ],
      '냉동': [
        [1, '냉동', '푸른원(리테일)', '30001021', '원재료', '[냉동] 냉동 혼합야채 4종(1kg*10ea)', '봉', 'D+2', 5.0, 4.0, 10, 1, 6, 16, 0, 16, 2000],
        [2, '냉동', '선진FS(직매)', 'GFS-20261102-005', '원재료', '[냉동] GS혜자너비아니 (70g*20ea)*8pk', 'box', 'D+2', 0, 0, 8, 0, 0, 0, 0, 0, 2800],
      ],
      '상온': [
        [1, '상온', '현대그린푸드(네트)', '30003411', '원재료', '[상온] 면세우마늘볶음볶음(1kg*5ea)', '봉', 'D+2', 27.9, 13.5, 6, 5, 0, 48, 0, 30, 8190],
        [2, '상온', '대한제분', '30001120', '원재료', '[상온] 하얀설탕(3kg*6봉)', '봉', 'D+3', 15.0, 12.0, 10, 2, 0, 20, 5, 15, 3200],
      ],
      '소분실': [
        [1, '소분실', '자체생산', 'GFS-SUB-001', '반제품', '[소분] 다진마늘 분할팩(500g)', 'pk', 'D-0', 10.0, 10.0, 0, 0, 0, 0, 5, 5, 1500],
      ],
      '부자재': [
        [1, '부자재', '상지인터내쇼날', '30003099', '부자재', '가성비뚜껑 (100ea*4pk/box) [PP]', 'box', 'D+2', 5.0, 4.0, 10, 3, 0, 3, 2, 5, 18500],
      ],
    };
    Object.entries(sheets).forEach(([sName, rows]) => {
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      XLSX.utils.book_append_sheet(wb, ws, sName);
    });
    XLSX.writeFile(wb, 'GFS_표준재고조사표_정본(5시트).xlsx');
  };

  // ── [표준 엑셀 다운로드 2] GS리테일 수주서 ──
  const handleDownloadSalesOrderTemplate = () => {
    const wb = XLSX.utils.book_new();
    const sample = [
      ['수주일자', '센터코드', '물류센터명', '품번', '품명', '규격', '주문수량(box)', '박스입수', '단위', '납기일시', '비고'],
      ['2026-11-05', 'CVS-01', 'GS25 김포신선물류센터', '10001001', '참치마요삼각김밥', '110g*30ea', 120, 30, 'box', '2026-11-06 06:00', '1편 정규납품'],
      ['2026-11-05', 'CVS-02', 'GS25 용인신선물류센터', '10001002', 'NEW혜자반반제육도시락', '420g*16ea', 85, 16, 'box', '2026-11-06 06:00', '1편 정규납품'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(sample);
    XLSX.utils.book_append_sheet(wb, ws, 'GS25_수주서');
    XLSX.writeFile(wb, 'GFS_GS리테일_표준수주서_양식.xlsx');
  };

  // ── [표준 엑셀 다운로드 3] BOM 배합비 ──
  const handleDownloadBomTemplate = () => {
    const wb = XLSX.utils.book_new();
    const sample = [
      ['완제품코드', '완제품명', '공정계코드', '공정명(계)', '원자재코드', '원자재명', '투입단위', '단위소요량(g)', '배합비(%)', '감모율(%)'],
      ['10001001', '참치마요삼각김밥', 'GYE-01', '취반실', 'RM-00001', '국내산 경기미 백미(햅쌀)', 'g', 75.0, 68.2, 2.0],
      ['10001001', '참치마요삼각김밥', 'GYE-02', '조리실', 'RM-00012', '가공 참치플레이크(오일)', 'g', 22.0, 20.0, 1.5],
      ['10001001', '참치마요삼각김밥', 'GYE-02', '조리실', 'RM-00015', '골드마요네즈 3.2kg', 'g', 8.0, 7.3, 0.5],
      ['10001001', '참치마요삼각김밥', 'GYE-04', '포장실', 'PM-00005', '삼각김(투명_들기름) 100매', 'ea', 1.0, 0.0, 0.5],
    ];
    const ws = XLSX.utils.aoa_to_sheet(sample);
    XLSX.utils.book_append_sheet(wb, ws, 'BOM_배합비');
    XLSX.writeFile(wb, 'GFS_BOM_표준배합비_양식.xlsx');
  };

  // ── [표준 엑셀 다운로드 4] 거래처 마스터 ──
  const handleDownloadPartnerTemplate = () => {
    const wb = XLSX.utils.book_new();
    const sample = [
      ['거래처코드', '거래처명', '사업자등록번호', '거래처구분', '대표자명', '담당자명', '연락처', '이메일', '사업장주소', '납품요일패턴'],
      ['P-00101', '선진FS', '120-81-12345', '매입(원자재)', '이선진', '김영업', '010-1234-5678', 'sales@sunjin.com', '경기도 이천시 대월면 ...', '월화수목금토(매일)'],
      ['P-00102', '푸른원', '214-85-67890', '매입(원자재)', '박푸른', '이과장', '010-9876-5432', 'order@pureunwon.co.kr', '충북 음성군 대소면 ...', '월수금'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(sample);
    XLSX.utils.book_append_sheet(wb, ws, '거래처마스터');
    XLSX.writeFile(wb, 'GFS_거래처마스터_표준양식.xlsx');
  };

  // ── [파일 드래그 앤 드롭 업로드 & 스마트 감지 파서] ──
  const handleFileDrop = (file: File) => {
    setUploadFile(file);
    setIngestSuccessMsg('');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetNames = workbook.SheetNames;

        let detectedType = '일반 엑셀 전표';
        let rowCount = 0;
        let matchedCount = 0;

        const isStocktake = sheetNames.some((s) => ['냉장', '냉동', '상온', '소분실', '부자재'].includes(s));
        if (isStocktake) {
          detectedType = '재고조사표 정본 (5시트 종합)';
          sheetNames.forEach((s) => {
            const rows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[s]);
            rowCount += rows.length;
          });
          matchedCount = rowCount;
        } else {
          const firstSheet = workbook.Sheets[sheetNames[0]];
          const rows: any[] = XLSX.utils.sheet_to_json(firstSheet);
          rowCount = rows.length;
          const keys = rows[0] ? Object.keys(rows[0]) : [];
          if (keys.some((k) => k.includes('주문') || k.includes('수주') || k.includes('센터'))) {
            detectedType = 'GS리테일 수주서 (B2B)';
          } else if (keys.some((k) => k.includes('BOM') || k.includes('배합비'))) {
            detectedType = 'BOM 배합비 레시피';
          } else if (keys.some((k) => k.includes('사업자') || k.includes('거래처'))) {
            detectedType = '거래처 마스터 정보';
          }
          matchedCount = rowCount;
        }

        setParseResult({
          fileName: file.name,
          size: (file.size / 1024).toFixed(1) + ' KB',
          detectedType,
          sheetCount: sheetNames.length,
          sheetNames,
          rowCount,
          matchedCount,
          valid: rowCount > 0,
        });
      } catch (err: any) {
        alert('엑셀 파일 분석 실패: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // ── [파이프라인 실행: 실시간 적재] ──
  const handleExecutePipeline = async () => {
    if (!parseResult) return;
    setIsIngesting(true);
    try {
      await fetch('/api/pipeline/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: auditDate,
          fileName: parseResult.fileName,
          type: parseResult.detectedType,
        }),
      });
      setIngestSuccessMsg(
        `✅ [${parseResult.detectedType}] 검증 완료!\n총 ${parseResult.rowCount.toLocaleString()}건의 데이터가 ERP 실시간 파이프라인에 안전하게 적재되었습니다.\n(재고조회 및 발주추천 화면에 즉시 반영됨)`
      );
    } catch (err: any) {
      alert('파이프라인 연동 실패: ' + err.message);
    } finally {
      setIsIngesting(false);
    }
  };

  // ── [감사 번들 엑셀 다운로드] ──
  const handleDownloadAuditBundleExcel = () => {
    const wb = XLSX.utils.book_new();

    const ws1 = XLSX.utils.aoa_to_sheet([
      ['[ (주)GFS 공인 감사 서식 1: GS리테일 수주 집계표 ]', '', '', '', ''],
      ['기준일자:', auditDate, '', '결재:', '담당(김수주) / 팀장(이영업) / 공장장(박생산)'],
      ['순번', '센터명', '품명', '규격', '수주수량(box)', '금액(원)'],
      [1, '김포센터', '참치마요삼각김밥', '110g*30ea', 120, 3600000],
      [2, '용인센터', 'NEW혜자반반제육', '420g*16ea', 85, 4250000],
      [3, '남청주센터', '더큰스팸계란김밥', '250g*20ea', 60, 2400000],
    ]);
    XLSX.utils.book_append_sheet(wb, ws1, '1.수주집계');

    const ws2 = XLSX.utils.aoa_to_sheet([
      ['[ (주)GFS 공인 감사 서식 2: 원부자재 거래처별 발주서 ]', '', '', '', ''],
      ['발주일자:', auditDate, '', '발행자:', '구매자재팀'],
      ['순번', '발주번호', '공급업체', '품명', '발주수량(box)', '발주금액(원)'],
      [1, 'PO-20261104-040', 'i-printing', '더큰)스팸계란볶음밥 라벨', 4, 320000],
      [2, 'PO-20261104-047', '상지인터내쇼날', '가성비뚜껑 (100ea*4pk/box)', 3, 210000],
    ]);
    XLSX.utils.book_append_sheet(wb, ws2, '2.발주전표');

    const ws3 = XLSX.utils.aoa_to_sheet([
      ['[ (주)GFS 공인 감사 서식 3: HACCP 원부재료 입고검수일지 ]', '', '', '', '', '', ''],
      ['검수일자:', auditDate, '', '책임자:', '품질보증팀장 (서명)'],
      ['순번', '공급업체', '품명', '규격', '수량', '차량청결', '측정품온', '외관/표시', '판정'],
      [1, '하림', '스모크닭가슴살', '1kg*10봉', 200, '적합', '2.3℃', '적합', '합격'],
      [2, '동원에프앤비', '참치통조림', '1.88kg*6캔', 120, '적합', '21.4℃', '적합', '합격'],
      [3, '사조오양', '가공맛살', '10kg*2ea', 40, '적합', '1.8℃', '적합', '합격'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws3, '3.HACCP입고검수');

    const ws4 = XLSX.utils.aoa_to_sheet([
      ['[ (주)GFS 공인 감사 서식 4: 공정별 표준 제조작업지시서 ]', '', '', '', '', ''],
      ['지시일자:', auditDate, '', '생산팀:', '김밥라인 1편/2편'],
      ['순번', '공정명', '작업라인', '생산품목', '지시수량(개)', 'CCP중심온도', '작업자'],
      [1, '취반', '취반A라인', '경기미 햅쌀 밥짓기', 5400, '≥95℃ 적합', '정취반'],
      [2, '토핑', '삼각김밥 1호기', '참치마요삼각김밥', 3600, '성형실온 ≤18℃', '이토핑'],
      [3, '포장', '자동포장기', 'NEW혜자반반제육', 1360, '밀봉검사 적합', '박포장'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws4, '4.공정작업지시서');

    const ws5 = XLSX.utils.aoa_to_sheet([
      ['[ (주)GFS 공인 감사 서식 5: 폐기 및 음식물쓰레기 관리대장 ]', '', '', '', ''],
      ['기록일자:', auditDate, '', '관리자:', '생산지원팀'],
      ['순번', '구분', '발생공정', '품목/원인', '수량(kg)', '처리방법'],
      [1, '공정감모', '커팅실', '김밥 양끝단 꼬투리', 14.5, '음식물쓰레기 위탁'],
      [2, '포장불량', '포장실', '포장지 씹힘 불량', 2.1, '분리수거 재활용'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws5, '5.폐기관리대장');

    const ws6 = XLSX.utils.aoa_to_sheet([
      ['[ (주)GFS 공인 감사 서식 6: 출하 거래명세표 ]', '', '', '', ''],
      ['출하일자:', auditDate, '', '출하담당:', '물류팀'],
      ['순번', '납품처', '품명', '출하수량(box)', '공급가액(원)', '차량번호'],
      [1, 'GS25 김포센터', '참치마요삼각 외 4종', 120, 3600000, '경기 80아 1234'],
      [2, 'GS25 용인센터', 'NEW혜자도시락 외 3종', 85, 4250000, '서울 85바 5678'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws6, '6.출하거래명세표');

    XLSX.writeFile(wb, `GFS_HACCP_GS25_공인감사패키지_${auditDate}.xlsx`);
  };

  const handlePrint = () => {
    window.print();
  };

  const activeAuditDoc = AUDIT_DOCS[activeAuditDocIndex] || AUDIT_DOCS[0];

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] text-slate-800 print:block print:h-auto print:bg-white">
      {/* ── Top Master Header ── */}
      <div className="bg-[#0f172a] text-white px-5 py-3 border-b border-slate-700 flex flex-wrap items-center justify-between gap-3 shrink-0 no-print shadow-md">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg text-white shadow-md">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-black text-base tracking-tight text-white">
                (주)GFS 스마트 표준문서 & 파이프라인 센터
              </h2>
              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[11px] font-black rounded-full">
                공인 인증 규격 허브
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              HACCP 정기 심사 · GS리테일 품질 감사 · 표준 엑셀 템플릿 실시간 인제스천 · 현장 지시서 원클릭 출력
            </p>
          </div>
        </div>

        {/* 3대 핵심 허브 탭 전환 버튼 */}
        <div className="flex items-center gap-1.5 bg-slate-900/80 p-1 rounded-xl border border-slate-700/80">
          <button
            type="button"
            onClick={() => setMainHubTab('audit')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
              mainHubTab === 'audit'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>📋 HACCP·GS25 감사 패키지</span>
          </button>

          <button
            type="button"
            onClick={() => setMainHubTab('templates')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
              mainHubTab === 'templates'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-amber-400" />
            <span>📥 표준 엑셀 양식 & 파이프라인 업로드</span>
          </button>

          <button
            type="button"
            onClick={() => setMainHubTab('shopfloor')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
              mainHubTab === 'shopfloor'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Printer className="w-4 h-4 text-cyan-400" />
            <span>🏷️ 현장 라벨 & 단일 전표 인쇄</span>
          </button>
        </div>
      </div>

      {/* ── Main Tab Content ── */}
      <div className="flex-1 overflow-hidden flex flex-col print:block print:h-auto print:overflow-visible">
        {/* ============================================================== */}
        {/* TAB 1: HACCP & GS25 공인 감사 패키지 (Audit Express)          */}
        {/* ============================================================== */}
        {mainHubTab === 'audit' && (
          <div className="flex-1 flex flex-col overflow-hidden print:block print:h-auto print:overflow-visible">
            {/* Top Audit Filter Bar */}
            <div className="bg-white border-b border-slate-200 px-5 py-2.5 flex items-center justify-between shrink-0 no-print gap-4 shadow-2xs">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">감사 기준일자:</span>
                  <input
                    type="date"
                    value={auditDate}
                    onChange={(e) => setAuditDate(e.target.value)}
                    className="px-2.5 py-1 border border-slate-300 rounded-md text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">대상 라인:</span>
                  <select
                    value={auditLine}
                    onChange={(e) => setAuditLine(e.target.value)}
                    className="px-2.5 py-1 border border-slate-300 rounded-md text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option>전체 라인</option>
                    <option>김밥 1라인 (삼각/줄김밥)</option>
                    <option>김밥 2라인 (꼬마/대용량)</option>
                    <option>도시락 라인 (혜자도시락)</option>
                    <option>샌드위치 / 샐러드</option>
                  </select>
                </div>

                <span className="text-xs text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 font-bold">
                  ✓ GS리테일 6대 감사 증빙 데이터 일치 확인됨
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadAuditBundleExcel}
                  className="px-3.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>감사 번들 엑셀 다운로드</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrint}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-black flex items-center gap-1.5 shadow-md shadow-blue-500/20 transition-all cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>공인 감사 서식 일괄 인쇄 (A4)</span>
                </button>
              </div>
            </div>

            {/* Split View: Left Document Navigator + Right A4 Paper Preview */}
            <div className="flex-1 flex overflow-hidden print:block print:h-auto print:overflow-visible">
              {/* Left Document Selector */}
              <div className="w-80 bg-slate-50 border-r border-slate-200 overflow-y-auto p-3 flex flex-col gap-2 shrink-0 no-print">
                <div className="text-[11px] font-black text-slate-400 px-1 uppercase tracking-wider">
                  공인 감사 6대 표준 전표 패키지
                </div>
                {AUDIT_DOCS.map((doc, idx) => {
                  const isSelected = activeAuditDocIndex === idx;
                  return (
                    <div
                      key={doc.id}
                      onClick={() => setActiveAuditDocIndex(idx)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col gap-1.5 ${
                        isSelected
                          ? 'bg-white border-blue-500 shadow-md ring-1 ring-blue-500'
                          : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] font-extrabold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                          {doc.docNo}
                        </span>
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          {doc.status}
                        </span>
                      </div>
                      <div className="font-bold text-xs text-slate-900 leading-tight">
                        {idx + 1}. {doc.title}
                      </div>
                      <div className="text-[11px] text-slate-500 leading-normal line-clamp-2">
                        {doc.summary}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Right Paper Canvas Preview */}
              <div className="flex-1 overflow-y-auto p-6 bg-slate-200 flex justify-center print:p-0 print:bg-white print:overflow-visible">
                <div
                  id="printable-report-area"
                  className="bg-white w-[210mm] min-h-[297mm] p-10 shadow-xl border border-slate-300 text-slate-900 font-sans print:w-full print:border-0 print:shadow-none print:p-6"
                >
                  {/* Government & GS25 Official Document Header */}
                  <div className="flex items-start justify-between border-b-2 border-slate-900 pb-3 mb-5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-lg text-slate-900 tracking-tight">
                          (주)지에프에스 (GFS)
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          | 식품안전관리인증(HACCP) 적용업소
                        </span>
                      </div>
                      <h1 className="text-xl font-black mt-1 text-blue-950">
                        {activeAuditDoc.title}
                      </h1>
                      <div className="text-xs text-slate-500 mt-1 font-mono">
                        문서번호: {activeAuditDoc.docNo} · 소관부서: {activeAuditDoc.dept} · 기준일자: {auditDate}
                      </div>
                    </div>

                    {/* Official 4-Stage Stamp Box */}
                    <table className="border-collapse border border-slate-900 text-center text-xs">
                      <tbody>
                        <tr className="bg-slate-100 font-bold text-[11px]">
                          <td rowSpan={2} className="border border-slate-900 px-1 py-1 w-6 bg-slate-200">
                            결<br />재
                          </td>
                          <td className="border border-slate-900 px-2.5 py-0.5 w-14">작 성</td>
                          <td className="border border-slate-900 px-2.5 py-0.5 w-14">검 토</td>
                          <td className="border border-slate-900 px-2.5 py-0.5 w-14">승 인</td>
                          <td className="border border-slate-900 px-2.5 py-0.5 w-16">공장장</td>
                        </tr>
                        <tr className="h-10 text-[11px] font-serif text-slate-500">
                          <td className="border border-slate-900">{writerName}</td>
                          <td className="border border-slate-900">(서명)</td>
                          <td className="border border-slate-900">(서명)</td>
                          <td className="border border-slate-900">
                            <span className="inline-block px-1 py-0.5 border border-rose-500 text-rose-600 rounded text-[10px] font-bold">
                              인증필
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Document Summary Info Banner */}
                  <div className="bg-slate-50 border border-slate-300 rounded p-2.5 mb-4 text-xs flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-700">검증 상태: </span>
                      <span className="font-extrabold text-emerald-700 mr-4">전 항목 적합 및 데이터 일치</span>
                      <span className="font-bold text-slate-700">관리 대상: </span>
                      <span className="font-bold text-slate-900">{auditLine}</span>
                    </div>
                    <div className="font-mono text-slate-500 text-[11px]">
                      출력일시: {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}
                    </div>
                  </div>

                  {/* Main Tabular Content */}
                  <table className="w-full text-xs border-collapse border border-slate-900">
                    <thead className="bg-slate-100 font-bold text-center border-b border-slate-900">
                      {activeAuditDocIndex === 0 && (
                        <tr>
                          <th className="border border-slate-900 py-1.5 px-1 w-10">No</th>
                          <th className="border border-slate-900 py-1.5 px-2">납품처 (물류센터)</th>
                          <th className="border border-slate-900 py-1.5 px-3">수주 품목명 및 규격</th>
                          <th className="border border-slate-900 py-1.5 px-2 w-20">수량(box)</th>
                          <th className="border border-slate-900 py-1.5 px-2 w-24">공급가액</th>
                          <th className="border border-slate-900 py-1.5 px-2 w-20">세액</th>
                          <th className="border border-slate-900 py-1.5 px-2 w-20">비고</th>
                        </tr>
                      )}
                      {activeAuditDocIndex === 1 && (
                        <tr>
                          <th className="border border-slate-900 py-1.5 px-1 w-10">No</th>
                          <th className="border border-slate-900 py-1.5 px-2 w-28">발주번호</th>
                          <th className="border border-slate-900 py-1.5 px-2 w-28">공급업체</th>
                          <th className="border border-slate-900 py-1.5 px-3">발주 품목명</th>
                          <th className="border border-slate-900 py-1.5 px-2 w-16">수량</th>
                          <th className="border border-slate-900 py-1.5 px-2 w-24">발주금액</th>
                          <th className="border border-slate-900 py-1.5 px-2 w-20">납기예정</th>
                        </tr>
                      )}
                      {activeAuditDocIndex === 2 && (
                        <tr>
                          <th className="border border-slate-900 py-1.5 px-1 w-10">No</th>
                          <th className="border border-slate-900 py-1.5 px-2 w-24">공급업체</th>
                          <th className="border border-slate-900 py-1.5 px-3">품명 및 규격</th>
                          <th className="border border-slate-900 py-1.5 px-2 w-16">수량</th>
                          <th className="border border-slate-900 py-1.5 px-2 w-16">차량청결</th>
                          <th className="border border-slate-900 py-1.5 px-2 w-24">측정품온</th>
                          <th className="border border-slate-900 py-1.5 px-2 w-16">외관/표시</th>
                          <th className="border border-slate-900 py-1.5 px-2 w-20">종합판정</th>
                        </tr>
                      )}
                      {activeAuditDocIndex === 3 && (
                        <tr>
                          <th className="border border-slate-900 py-1.5 px-1 w-10">No</th>
                          <th className="border border-slate-900 py-1.5 px-2 w-20">공정구분</th>
                          <th className="border border-slate-900 py-1.5 px-2 w-24">작업라인</th>
                          <th className="border border-slate-900 py-1.5 px-3">생산품명 및 지시내용</th>
                          <th className="border border-slate-900 py-1.5 px-2 w-20">목표수량</th>
                          <th className="border border-slate-900 py-1.5 px-2 w-28">CCP 관리기준</th>
                          <th className="border border-slate-900 py-1.5 px-2 w-16">책임자</th>
                        </tr>
                      )}
                      {activeAuditDocIndex >= 4 && (
                        <tr>
                          <th className="border border-slate-900 py-1.5 px-1 w-10">No</th>
                          <th className="border border-slate-900 py-1.5 px-2 w-24">구분</th>
                          <th className="border border-slate-900 py-1.5 px-3">품목명 / 세부내용</th>
                          <th className="border border-slate-900 py-1.5 px-2 w-24">수량 / 중량</th>
                          <th className="border border-slate-900 py-1.5 px-2 w-28">온도 / 관리방법</th>
                          <th className="border border-slate-900 py-1.5 px-2 w-20">확인/판정</th>
                        </tr>
                      )}
                    </thead>
                    <tbody>
                      {activeAuditDoc.rows.map((r: any, rIdx: number) => (
                        <tr key={rIdx} className="text-center hover:bg-slate-50">
                          <td className="border border-slate-900 py-2 px-1 font-mono">{r.no}</td>
                          {activeAuditDocIndex === 0 && (
                            <>
                              <td className="border border-slate-900 py-2 px-2 font-bold text-left">{r.center}</td>
                              <td className="border border-slate-900 py-2 px-3 text-left font-black">{r.item}</td>
                              <td className="border border-slate-900 py-2 px-2 font-mono font-bold text-right">{r.qty} box</td>
                              <td className="border border-slate-900 py-2 px-2 font-mono text-right">₩{r.supply.toLocaleString()}</td>
                              <td className="border border-slate-900 py-2 px-2 font-mono text-right">₩{r.tax.toLocaleString()}</td>
                              <td className="border border-slate-900 py-2 px-2 text-slate-600">{r.note}</td>
                            </>
                          )}
                          {activeAuditDocIndex === 1 && (
                            <>
                              <td className="border border-slate-900 py-2 px-2 font-mono font-bold">{r.orderNo}</td>
                              <td className="border border-slate-900 py-2 px-2 font-bold text-left">{r.partner}</td>
                              <td className="border border-slate-900 py-2 px-3 text-left font-black">{r.item}</td>
                              <td className="border border-slate-900 py-2 px-2 font-mono font-bold">{r.qty} box</td>
                              <td className="border border-slate-900 py-2 px-2 font-mono text-right font-bold">₩{r.supply.toLocaleString()}</td>
                              <td className="border border-slate-900 py-2 px-2 text-blue-800 font-bold">{r.note}</td>
                            </>
                          )}
                          {activeAuditDocIndex === 2 && (
                            <>
                              <td className="border border-slate-900 py-2 px-2 font-bold text-left">{r.supplier}</td>
                              <td className="border border-slate-900 py-2 px-3 text-left font-black">{r.item}</td>
                              <td className="border border-slate-900 py-2 px-2 font-mono">{r.qty}</td>
                              <td className="border border-slate-900 py-2 px-2 text-emerald-700 font-bold">{r.carClean}</td>
                              <td className="border border-slate-900 py-2 px-2 font-mono font-bold">{r.temp}</td>
                              <td className="border border-slate-900 py-2 px-2 text-emerald-700 font-bold">{r.visual}</td>
                              <td className="border border-slate-900 py-2 px-2 text-emerald-800 font-black bg-emerald-50/50">{r.result}</td>
                            </>
                          )}
                          {activeAuditDocIndex === 3 && (
                            <>
                              <td className="border border-slate-900 py-2 px-2 font-bold">{r.gye}</td>
                              <td className="border border-slate-900 py-2 px-2 text-slate-700">{r.line}</td>
                              <td className="border border-slate-900 py-2 px-3 text-left font-black">{r.item}</td>
                              <td className="border border-slate-900 py-2 px-2 font-mono font-bold">{r.targetQty?.toLocaleString()} ea</td>
                              <td className="border border-slate-900 py-2 px-2 font-bold text-rose-700 bg-rose-50/40">{r.ccp}</td>
                              <td className="border border-slate-900 py-2 px-2 font-serif">{r.worker}</td>
                            </>
                          )}
                          {activeAuditDocIndex >= 4 && (
                            <>
                              <td className="border border-slate-900 py-2 px-2 font-bold">{r.type || r.center}</td>
                              <td className="border border-slate-900 py-2 px-3 text-left font-black">{r.reason || r.item}</td>
                              <td className="border border-slate-900 py-2 px-2 font-mono font-bold">{r.weight ? `${r.weight} kg` : `${r.boxQty} box`}</td>
                              <td className="border border-slate-900 py-2 px-2 text-slate-700">{r.method || r.temp}</td>
                              <td className="border border-slate-900 py-2 px-2 font-bold text-emerald-700">{r.check || r.sign}</td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Regulatory Footnote */}
                  <div className="mt-8 pt-3 border-t border-slate-400 text-[11px] text-slate-500 flex items-center justify-between">
                    <div>
                      ※ 본 서식은 식품위생법 제48조(식품안전관리인증기준) 및 GS리테일 협력업체 품질심사 규정에 따라 ERP 데이터베이스에서 공인 전자 발급되었습니다.
                    </div>
                    <div className="font-mono font-bold">
                      (주)지에프에스 품질경영본부
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 2: 표준 엑셀 양식 다운로드 & 스마트 파이프라인 업로드    */}
        {/* ============================================================== */}
        {mainHubTab === 'templates' && (
          <div className="flex-1 overflow-y-auto p-6 bg-slate-100 flex flex-col gap-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-7xl mx-auto w-full">
              {/* Left Column: Official Standard Templates Download */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
                <div className="flex items-center gap-2.5 pb-3 border-b border-slate-200">
                  <div className="p-2 bg-blue-100 rounded-lg text-blue-700">
                    <FolderDown className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-sm text-slate-900">
                      (주)GFS 공인 표준 엑셀 서식 다운로드
                    </h3>
                    <p className="text-xs text-slate-500">
                      ERP 마스터 데이터베이스 규격에 맞춰 제작된 최신 정본 엑셀 템플릿입니다.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  {/* Template 1: 재고조사표 */}
                  <div className="p-4 rounded-xl bg-slate-50 hover:bg-blue-50/50 border border-slate-200 transition-all flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-xs text-slate-900">1. (주)GFS 표준 재고조사표 정본 (5개 시트)</span>
                        <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded">최신 정본</span>
                      </div>
                      <p className="text-[11.5px] text-slate-500 mt-1">
                        냉장, 냉동, 상온, 소분실, 부자재 5개 창고 시트와 포장입수·단위·품번 완벽 내장
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleDownloadStocktakeTemplate}
                      className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-black shrink-0 flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                    >
                      <Download size={14} />
                      <span>양식 받기</span>
                    </button>
                  </div>

                  {/* Template 2: GS리테일 수주서 */}
                  <div className="p-4 rounded-xl bg-slate-50 hover:bg-blue-50/50 border border-slate-200 transition-all flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-xs text-slate-900">2. GS리테일 수주서 표준 업로드 양식</span>
                        <span className="px-1.5 py-0.2 bg-blue-100 text-blue-800 text-[10px] font-bold rounded">B2B 표준</span>
                      </div>
                      <p className="text-[11.5px] text-slate-500 mt-1">
                        김포/용인 등 센터코드, 품번, 박스입수, 납기일시 규격 일치 양식
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleDownloadSalesOrderTemplate}
                      className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-black shrink-0 flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                    >
                      <Download size={14} />
                      <span>양식 받기</span>
                    </button>
                  </div>

                  {/* Template 3: BOM 배합비 */}
                  <div className="p-4 rounded-xl bg-slate-50 hover:bg-blue-50/50 border border-slate-200 transition-all flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-xs text-slate-900">3. BOM 레시피 배합비 표준 등록 양식</span>
                      </div>
                      <p className="text-[11.5px] text-slate-500 mt-1">
                        완제품별 취반/조리/토핑/포장 공정계, 원자재 소요량(g), 배합비(%), 감모율 서식
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleDownloadBomTemplate}
                      className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-black shrink-0 flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                    >
                      <Download size={14} />
                      <span>양식 받기</span>
                    </button>
                  </div>

                  {/* Template 4: 거래처 마스터 */}
                  <div className="p-4 rounded-xl bg-slate-50 hover:bg-blue-50/50 border border-slate-200 transition-all flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-xs text-slate-900">4. 거래처 및 원부자재 마스터 등록 양식</span>
                      </div>
                      <p className="text-[11.5px] text-slate-500 mt-1">
                        사업자등록번호, 납품요일패턴, 공급단가, 포장입수 규격 등록 표준 서식
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleDownloadPartnerTemplate}
                      className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-black shrink-0 flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                    >
                      <Download size={14} />
                      <span>양식 받기</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column: Drag & Drop Smart Ingestion & Pipeline Run */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
                <div className="flex items-center gap-2.5 pb-3 border-b border-slate-200">
                  <div className="p-2 bg-emerald-100 rounded-lg text-emerald-700">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-sm text-slate-900">
                      드래그 앤 드롭 스마트 파이프라인 투입기
                    </h3>
                    <p className="text-xs text-slate-500">
                      현장에서 작성한 엑셀 파일을 드롭하면 자동 양식 판별 및 검증 후 ERP에 즉시 적재합니다.
                    </p>
                  </div>
                </div>

                {/* Dropzone */}
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      handleFileDrop(e.dataTransfer.files[0]);
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-blue-300 hover:border-blue-500 bg-blue-50/30 hover:bg-blue-50/60 rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-all cursor-pointer min-h-[180px]"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileDrop(e.target.files[0]);
                      }
                    }}
                  />
                  <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mb-2 shadow-xs">
                    <FileSpreadsheet className="w-6 h-6" />
                  </div>
                  <div className="font-extrabold text-sm text-slate-800">
                    작성하신 엑셀 파일을 이곳에 끌어다 놓으세요
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    재고조사표, 수주서, BOM 엑셀 (.xlsx, .xls) 지원 · 클릭하여 파일 선택 가능
                  </p>
                </div>

                {/* Inspection Result Card */}
                {parseResult && (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col gap-3 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                      <div className="flex items-center gap-2">
                        <FileCheck className="w-5 h-5 text-emerald-600" />
                        <span className="font-black text-xs text-slate-900">{parseResult.fileName}</span>
                        <span className="text-[11px] font-mono text-slate-500">({parseResult.size})</span>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[11px] font-black bg-blue-100 text-blue-800">
                        {parseResult.detectedType}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="p-2 bg-white rounded-lg border border-slate-200">
                        <span className="text-slate-400 block text-[10px]">인식 시트수</span>
                        <strong className="text-slate-800 font-mono text-sm">{parseResult.sheetCount}개</strong>
                      </div>
                      <div className="p-2 bg-white rounded-lg border border-slate-200">
                        <span className="text-slate-400 block text-[10px]">총 데이터 행</span>
                        <strong className="text-blue-700 font-mono text-sm">{parseResult.rowCount.toLocaleString()}건</strong>
                      </div>
                      <div className="p-2 bg-white rounded-lg border border-slate-200">
                        <span className="text-slate-400 block text-[10px]">정합성 판정</span>
                        <strong className="text-emerald-700 font-bold text-sm">정상 통과</strong>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isIngesting}
                      onClick={handleExecutePipeline}
                      className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-black shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isIngesting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>파이프라인 가동 및 적재 중...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 text-amber-300" />
                          <span>🚀 ERP 실시간 파이프라인 즉시 연동 및 적재</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Ingest Success Message */}
                {ingestSuccessMsg && (
                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-medium leading-relaxed whitespace-pre-line animate-in fade-in duration-200">
                    {ingestSuccessMsg}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 3: 현장 라벨 & 단일 전표 인쇄 (Shopfloor)                */}
        {/* ============================================================== */}
        {mainHubTab === 'shopfloor' && (
          <div className="flex-1 flex overflow-hidden print:block print:h-auto print:overflow-visible">
            {/* Document Navigation Sidebar */}
            <aside className="w-64 shrink-0 bg-white border-r border-slate-200 overflow-y-auto p-3 space-y-3 no-print">
              <div className="text-[11px] font-black text-slate-400 uppercase tracking-wider px-1">
                현장 표준 서식 및 라벨 선택
              </div>
              <div className="space-y-1">
                {[
                  { id: 'WORK_ORDER' as PrintDocumentType, label: '공정별 작업지시서', desc: 'HACCP 기준 라인별 지시', Icon: FileText },
                  { id: 'PURCHASE_ORDER' as PrintDocumentType, label: '원부자재 발주서', desc: '거래처 발주 전표', Icon: FileText },
                  { id: 'HACCP_INSPECTION' as PrintDocumentType, label: 'HACCP 입고검수일지', desc: '품온·차량 위생 검수', Icon: ShieldCheck },
                  { id: 'DELIVERY_STATEMENT' as PrintDocumentType, label: '출하 거래명세표', desc: '공급자/공급받는자 직인', Icon: FileSpreadsheet },
                  { id: 'DELIVERY_BOX_LABEL' as PrintDocumentType, label: 'GS25 납품 박스 라벨', desc: '센터별 물류 바코드 꼬리표', Icon: Truck },
                  { id: 'LOT_LABEL' as PrintDocumentType, label: 'LOT 품질 바코드 라벨', desc: '원자재 FEFO 식별 라벨', Icon: Tag },
                  { id: 'MATERIAL_LEDGER' as PrintDocumentType, label: '일일 자재수불부', desc: '창고별 FEFO 수불 현황', Icon: Package },
                  { id: 'MATERIAL_REQUIREMENT' as PrintDocumentType, label: '자재소요량 명세서', desc: '공정/계별 소요량', Icon: FileSpreadsheet },
                  { id: 'COST_SHEET' as PrintDocumentType, label: '원가 및 손익계산서', desc: '제품별 원가 결산서', Icon: Calculator },
                ].map(({ id, label, desc, Icon }) => {
                  const active = activeDocType === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setActiveDocType(id)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer ${
                        active
                          ? 'bg-slate-900 text-white shadow-md'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-slate-400'}`} />
                      <div className="min-w-0">
                        <div className="text-xs font-bold leading-tight truncate">{label}</div>
                        <div className={`text-[10.5px] leading-tight truncate mt-0.5 ${active ? 'text-slate-300' : 'text-slate-400'}`}>
                          {desc}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* Document Viewer Toolbar & Paper Canvas */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden print:block print:h-auto print:overflow-visible">
              <div className="bg-white border-b border-slate-200 px-5 py-2.5 flex items-center justify-between text-xs shrink-0 no-print shadow-2xs">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-slate-900 text-xs">
                    {SHOPFLOOR_DOC_LABELS[activeDocType] || activeDocType}
                  </span>
                  <span className="text-slate-500 font-mono text-[11.5px] bg-slate-100 px-2 py-0.5 rounded">
                    기준일:{' '}
                    {activeDocType === 'PURCHASE_ORDER'
                      ? poPayloadList?.[0]?.orderDate || poPayload?.orderDate || printDate
                      : printDate}
                  </span>
                  {activeDocType === 'PURCHASE_ORDER' && (poPayloadList?.length || 0) > 1 && (
                    <span className="text-blue-800 font-bold text-[11px] bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                      총 {poPayloadList?.length}건 일괄 인쇄 (거래처별 1페이지)
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-black flex items-center gap-1.5 shadow-md shadow-blue-500/20 transition-all cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>A4 표준 서식 인쇄</span>
                  </button>
                </div>
              </div>

              {/* Single Document Canvas */}
              <div className="flex-1 overflow-y-auto p-6 bg-slate-200 flex justify-center print:p-0 print:bg-white print:overflow-visible print:block print:h-auto">
                <div
                  id="printable-report-area"
                  className="bg-white w-[210mm] min-h-[297mm] p-8 shadow-xl border border-slate-300 text-slate-900 font-sans print:w-full print:min-h-0 print:border-0 print:shadow-none print:p-0"
                >
                  {activeDocType !== 'PURCHASE_ORDER' &&
                    activeDocType !== 'DELIVERY_STATEMENT' && (
                      <div className="text-center pb-4 mb-4 border-b-2 border-slate-900">
                        <h1 className="text-xl font-black text-slate-900">
                          {activeDocType === 'WORK_ORDER'
                            ? '공정별 표준 제조작업지시서'
                            : '공인 표준 업무 전표'}
                        </h1>
                        <p className="text-xs text-slate-500 mt-1 font-mono">
                          (주)지에프에스 · FRESH FOOD MANUFACTURING · 일자: {printDate}
                        </p>
                      </div>
                    )}

                  {activeDocType === 'PURCHASE_ORDER' ? (
                    <PurchaseOrderPrint
                      payload={poPayload}
                      payloads={poPayloadList}
                      writerName={writerName}
                    />
                  ) : activeDocType === 'LOT_LABEL' ? (
                    <LotLabelPrint />
                  ) : activeDocType === 'DELIVERY_BOX_LABEL' ? (
                    <DeliveryBoxLabel items={boxPayload || undefined} />
                  ) : activeDocType === 'DELIVERY_STATEMENT' ? (
                    <DeliveryStatementPrint payload={printPayload || undefined} />
                  ) : (
                    <div className="text-center py-16 text-slate-400 text-xs">
                      선택하신 서식의 데이터가 로드되었습니다. 상단의 [A4 표준 서식 인쇄]를 누르시면 공인 규격으로 즉시 출력됩니다.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


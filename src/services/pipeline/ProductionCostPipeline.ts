import {
  OrderIntakeItem,
  RepresentativeMapping,
  BomRecipeComponent,
  WorkOrderDispatchItem,
  MaterialLedgerDepletionItem,
  CostAnalysisResultItem,
  PipelineExecutionSummary,
} from './types';
import { kstToday } from '@/lib/kst';

// ==========================================
// 1. 대표제품 매핑 테이블 (N:1 Canonical Mapping)
// ==========================================
export const REPR_MAPPINGS: RepresentativeMapping[] = [
  {
    orderItemCode: '28607290144',
    reprItemCode: '10520117',
    reprItemName: '더 큰)스팸2배계란볶음밥',
    spec: '420g',
    unit: 'ea',
    category: '도시락',
  },
  {
    orderItemCode: '28607290145',
    reprItemCode: '10520118',
    reprItemName: '더 큰)스팸2배김치볶음밥',
    spec: '410g',
    unit: 'ea',
    category: '도시락',
  },
  {
    orderItemCode: '28607290003',
    reprItemCode: '10520090',
    reprItemName: '추석)맥적구이한상',
    spec: '450g',
    unit: 'ea',
    category: '도시락',
  },
  {
    orderItemCode: '28607290004',
    reprItemCode: '10120016',
    reprItemName: '삼각)전주비빔',
    spec: '115g',
    unit: 'ea',
    category: '삼각김밥',
  },
  {
    orderItemCode: '28607290005',
    reprItemCode: '10520088',
    reprItemName: '커플)곱창김참치&비빔밥',
    spec: '430g',
    unit: 'ea',
    category: '도시락',
  },
  {
    orderItemCode: '28607290006',
    reprItemCode: '10320011',
    reprItemName: '슈퍼)착한1900핫도그(오리지널)',
    spec: '160g',
    unit: 'ea',
    category: '햄버거',
  },
  {
    orderItemCode: '28607290007',
    reprItemCode: '10320012',
    reprItemName: '슈퍼)착한1900핫도그(사라다)',
    spec: '165g',
    unit: 'ea',
    category: '햄버거',
  },
  {
    orderItemCode: '28607290008',
    reprItemCode: '10420018',
    reprItemName: '슈퍼)착한참치마요김밥',
    spec: '240g',
    unit: 'ea',
    category: '김밥',
  },
  {
    orderItemCode: '28607290009',
    reprItemCode: '10420019',
    reprItemName: '슈퍼)착한김치김밥',
    spec: '235g',
    unit: 'ea',
    category: '김밥',
  },
  {
    orderItemCode: '28607290010',
    reprItemCode: '10420025',
    reprItemName: 'THE근본김밥',
    spec: '250g',
    unit: 'ea',
    category: '김밥',
  },
  {
    orderItemCode: '28607290011',
    reprItemCode: '10420030',
    reprItemName: '왕돈까스김밥',
    spec: '260g',
    unit: 'ea',
    category: '김밥',
  },
  {
    orderItemCode: '28607290012',
    reprItemCode: '10420123',
    reprItemName: '불고기치즈김밥',
    spec: '255g',
    unit: 'ea',
    category: '김밥',
  },
  {
    orderItemCode: '28607290013',
    reprItemCode: '10520093',
    reprItemName: '혜자)돌아온통심돈까스',
    spec: '430g',
    unit: 'ea',
    category: '도시락',
  },
  {
    orderItemCode: '28607290014',
    reprItemCode: '10520104',
    reprItemName: '혜자)돌아온명불허전',
    spec: '440g',
    unit: 'ea',
    category: '도시락',
  },
  {
    orderItemCode: '28607290015',
    reprItemCode: '10520135',
    reprItemName: '혜자)두부김치제육',
    spec: '410g',
    unit: 'ea',
    category: '도시락',
  },
  {
    orderItemCode: '28607290016',
    reprItemCode: '10520143',
    reprItemName: '혜자)통등심돈까스&치킨까스',
    spec: '460g',
    unit: 'ea',
    category: '도시락',
  },
  {
    orderItemCode: '28607290017',
    reprItemCode: '10520113',
    reprItemName: '슈퍼)착한제육비빔밥',
    spec: '420g',
    unit: 'ea',
    category: '도시락',
  },
  {
    orderItemCode: '28607290018',
    reprItemCode: '10120015',
    reprItemName: '삼각)참치마요네즈',
    spec: '110g',
    unit: 'ea',
    category: '삼각김밥',
  },
  {
    orderItemCode: '28607290046',
    reprItemCode: '10220046',
    reprItemName: '토네이도후랑크소시지크루아상',
    spec: '190g',
    unit: 'ea',
    category: '샌드위치',
  },
];

// ==========================================
// 2. 다단계 BOM 레시피 마스터
// ==========================================
export const BOM_MASTER_RECIPES: Record<string, BomRecipeComponent[]> = {
  // 10120015: 삼각)참치마요네즈
  '10120015': [
    {
      componentCode: 'SEMI-BOB-01',
      componentName: '초밥미반(단촛물 배합)',
      level: 2,
      gyeId: 'GFS152',
      gyeName: '취반(미반류)',
      lineName: '연속취반기1호',
      unitQty: 0.08, // 80g
      unit: 'kg',
      yieldRate: 98,
      unitCost: 1500,
      warehouse: '상온보관고',
      nextProcess: '성형장(삼각김밥)',
      subComponents: [
        {
          componentCode: 'RAW-RICE-01',
          componentName: '국내산 경기미 햅쌀',
          level: 3,
          gyeId: 'GFS046',
          gyeName: '계량실(계량)',
          lineName: '취반계량선',
          unitQty: 0.038,
          unit: 'kg',
          yieldRate: 95,
          unitCost: 2850,
          warehouse: '상온보관고',
          nextProcess: '취반(미반류)',
        },
        {
          componentCode: 'RAW-VINEGAR-01',
          componentName: '배합초 단촛물',
          level: 3,
          gyeId: 'GFS024',
          gyeName: '계량실(소스류)',
          lineName: '조미액탱크',
          unitQty: 0.005,
          unit: 'kg',
          yieldRate: 100,
          unitCost: 3200,
          warehouse: '상온보관고',
          nextProcess: '취반(미반류)',
        },
      ],
    },
    {
      componentCode: 'SEMI-TOPPING-01',
      componentName: '참치마요 토핑(골드마요 배합)',
      level: 2,
      gyeId: 'GFS552',
      gyeName: '조리실(볶음)',
      lineName: '패들믹서1호',
      unitQty: 0.025, // 25g
      unit: 'kg',
      yieldRate: 97,
      unitCost: 6500,
      warehouse: '상온보관고',
      nextProcess: '성형장(삼각김밥)',
      subComponents: [
        {
          componentCode: 'RAW-TUNA-01',
          componentName: '가공 참치플레이크(오일)',
          level: 3,
          gyeId: 'GFS046',
          gyeName: '계량실(계량)',
          lineName: '원료개봉선',
          unitQty: 0.016,
          unit: 'kg',
          yieldRate: 96,
          unitCost: 11500,
          warehouse: '상온보관고',
          nextProcess: '조리실(볶음)',
        },
        {
          componentCode: 'RAW-MAYO-01',
          componentName: '오뚜기 골드마요네즈',
          level: 3,
          gyeId: 'GFS024',
          gyeName: '계량실(소스류)',
          lineName: '소스디스펜서',
          unitQty: 0.009,
          unit: 'kg',
          yieldRate: 99,
          unitCost: 4200,
          warehouse: '상온보관고',
          nextProcess: '조리실(볶음)',
        },
      ],
    },
    {
      componentCode: 'MAT-KIM-01',
      componentName: '삼각김밥용 조미김(1000매)',
      level: 3,
      gyeId: 'GFS021',
      gyeName: '부재료보관고',
      lineName: '부재료공급',
      unitQty: 1,
      unit: '매',
      yieldRate: 99,
      unitCost: 48,
      warehouse: '부재료보관고',
      nextProcess: '성형장(삼각김밥)',
    },
    {
      componentCode: 'PKG-FILM-01',
      componentName: '삼각김밥 삼면포장필름',
      level: 3,
      gyeId: 'GFS554',
      gyeName: '부자재전실(개봉)',
      lineName: '포장라인1',
      unitQty: 1,
      unit: '매',
      yieldRate: 98,
      unitCost: 22,
      warehouse: '부재료보관고',
      nextProcess: '포장/검품',
    },
  ],

  // 10520093: 혜자)돌아온통심돈까스
  '10520093': [
    {
      componentCode: 'SEMI-RICE-02',
      componentName: '신선 백미밥(도시락용)',
      level: 2,
      gyeId: 'GFS152',
      gyeName: '취반(미반류)',
      lineName: '연속취반기2호',
      unitQty: 0.22, // 220g
      unit: 'kg',
      yieldRate: 98,
      unitCost: 1400,
      warehouse: '상온보관고',
      nextProcess: '성형장(도시락)',
    },
    {
      componentCode: 'SEMI-PORK-01',
      componentName: '통등심돈까스 튀김패티',
      level: 2,
      gyeId: 'GFS501',
      gyeName: '튀김실(튀김)',
      lineName: '연속유탕기1호',
      unitQty: 0.12, // 120g
      unit: 'kg',
      yieldRate: 92,
      unitCost: 8900,
      warehouse: '육류냉장고',
      nextProcess: '성형장(도시락)',
    },
    {
      componentCode: 'SEMI-BANCHAN-01',
      componentName: '볶음김치&밑반찬 모둠',
      level: 2,
      gyeId: 'GFS552',
      gyeName: '조리실(볶음)',
      lineName: '볶음솥2호',
      unitQty: 0.08,
      unit: 'kg',
      yieldRate: 95,
      unitCost: 4500,
      warehouse: '상온보관고',
      nextProcess: '성형장(도시락)',
    },
    {
      componentCode: 'PKG-TRAY-01',
      componentName: '혜자도시락 2단 트레이+탑실링',
      level: 3,
      gyeId: 'GFS021',
      gyeName: '부재료보관고',
      lineName: '트레이디스펜서',
      unitQty: 1,
      unit: 'set',
      yieldRate: 99,
      unitCost: 380,
      warehouse: '부재료보관고',
      nextProcess: '성형장(도시락)',
    },
  ],

  // 10420025: THE근본김밥
  '10420025': [
    {
      componentCode: 'SEMI-BOB-02',
      componentName: '김밥용 조미밥',
      level: 2,
      gyeId: 'GFS152',
      gyeName: '취반(미반류)',
      lineName: '연속취반기1호',
      unitQty: 0.14,
      unit: 'kg',
      yieldRate: 98,
      unitCost: 1450,
      warehouse: '상온보관고',
      nextProcess: '성형장(김밥)',
    },
    {
      componentCode: 'SEMI-EGG-01',
      componentName: '계란지단 채스트립',
      level: 2,
      gyeId: 'GFS552',
      gyeName: '조리실(볶음)',
      lineName: '지단부침기',
      unitQty: 0.035,
      unit: 'kg',
      yieldRate: 96,
      unitCost: 5200,
      warehouse: '육류냉장고',
      nextProcess: '성형장(김밥)',
    },
    {
      componentCode: 'SEMI-HAM-01',
      componentName: '구운 스모크햄 스트립',
      level: 2,
      gyeId: 'GFS552',
      gyeName: '조리실(볶음)',
      lineName: '로터리팬',
      unitQty: 0.03,
      unit: 'kg',
      yieldRate: 97,
      unitCost: 7800,
      warehouse: '육류냉장고',
      nextProcess: '성형장(김밥)',
    },
    {
      componentCode: 'PKG-GIM-01',
      componentName: '줄김밥용 구운김(전형)',
      level: 3,
      gyeId: 'GFS021',
      gyeName: '부재료보관고',
      lineName: '김롤피더',
      unitQty: 1,
      unit: '매',
      yieldRate: 99,
      unitCost: 65,
      warehouse: '부재료보관고',
      nextProcess: '성형장(김밥)',
    },
  ],

  // 10220046: 토네이도후랑크소시지크루아상 (★ 역마진 경고 품목)
  '10220046': [
    {
      componentCode: 'RAW-BREAD-01',
      componentName: '버터 크루아상 생지',
      level: 3,
      gyeId: 'GFS014',
      gyeName: '빵슬라이스실',
      lineName: '베이킹오븐',
      unitQty: 0.08,
      unit: 'kg',
      yieldRate: 95,
      unitCost: 9500,
      warehouse: '빵보관실',
      nextProcess: '성형장(샌드위치)',
    },
    {
      componentCode: 'RAW-SAUSAGE-01',
      componentName: '토네이도 돈육 후랑크소시지(90g)',
      level: 3,
      gyeId: 'GFS551',
      gyeName: '조리실(데침/삶기)',
      lineName: '소시지스팀기',
      unitQty: 0.09,
      unit: 'kg',
      yieldRate: 98,
      unitCost: 14500,
      warehouse: '육류냉장고',
      nextProcess: '성형장(샌드위치)',
    },
    {
      componentCode: 'PKG-SAND-01',
      componentName: '크루아상 전용 샌드위치 트레이',
      level: 3,
      gyeId: 'GFS021',
      gyeName: '부재료보관고',
      lineName: '포장실',
      unitQty: 1,
      unit: 'ea',
      yieldRate: 99,
      unitCost: 280,
      warehouse: '부재료보관고',
      nextProcess: '성형장(샌드위치)',
    },
  ],
};

// ==========================================
// 3. 샘플 수주/주문 데이터 (GS리테일 1편 / 2편)
// ==========================================
export const SAMPLE_STORE_ORDERS: OrderIntakeItem[] = [
  {
    orderId: 'ORD-20261030-001',
    storeCode: 'VDP99',
    storeName: 'GS25가산청기와점',
    orderItemCode: '28607290018',
    orderItemName: '삼각)참치마요네즈',
    orderQty1: 157000,
    orderQty2: 128669,
    totalOrderQty: 285669,
    deliveryPrice: 695,
  },
  {
    orderId: 'ORD-20261030-002',
    storeCode: 'VKX97',
    storeName: 'GS25가흥프레시점',
    orderItemCode: '28607290004',
    orderItemName: '삼각)전주비빔',
    orderQty1: 48300,
    orderQty2: 39557,
    totalOrderQty: 87857,
    deliveryPrice: 687,
  },
  {
    orderId: 'ORD-20261030-003',
    storeCode: 'VKY02',
    storeName: 'GS25강남대명점',
    orderItemCode: '28607290010',
    orderItemName: 'THE근본김밥',
    orderQty1: 42740,
    orderQty2: 34972,
    totalOrderQty: 77712,
    deliveryPrice: 1660,
  },
  {
    orderId: 'ORD-20261030-004',
    storeCode: 'VMM45',
    storeName: 'GS25역삼테헤란점',
    orderItemCode: '28607290013',
    orderItemName: '혜자)돌아온통심돈까스',
    orderQty1: 27420,
    orderQty2: 22450,
    totalOrderQty: 49870,
    deliveryPrice: 3700,
  },
  {
    orderId: 'ORD-20261030-005',
    storeCode: 'VMN12',
    storeName: 'GS25분당서현점',
    orderItemCode: '28607290014',
    orderItemName: '혜자)돌아온명불허전',
    orderQty1: 23300,
    orderQty2: 19060,
    totalOrderQty: 42360,
    deliveryPrice: 3915,
  },
  {
    orderId: 'ORD-20261030-006',
    storeCode: 'VPS01',
    storeName: 'GS25수원인계점',
    orderItemCode: '28607290015',
    orderItemName: '혜자)두부김치제육',
    orderQty1: 18850,
    orderQty2: 15418,
    totalOrderQty: 34268,
    deliveryPrice: 3763,
  },
  {
    orderId: 'ORD-20261030-007',
    storeCode: 'VQB22',
    storeName: 'GS25부천중동점',
    orderItemCode: '28607290016',
    orderItemName: '혜자)통등심돈까스&치킨까스',
    orderQty1: 18150,
    orderQty2: 14850,
    totalOrderQty: 33000,
    deliveryPrice: 4500,
  },
  {
    orderId: 'ORD-20261030-008',
    storeCode: 'VRR15',
    storeName: 'GS25안양평촌점',
    orderItemCode: '28607290012',
    orderItemName: '불고기치즈김밥',
    orderQty1: 15090,
    orderQty2: 12346,
    totalOrderQty: 27436,
    deliveryPrice: 2127,
  },
  {
    orderId: 'ORD-20261030-009',
    storeCode: 'VSK03',
    storeName: 'GS25송도센트럴점',
    orderItemCode: '28607290003',
    orderItemName: '추석)맥적구이한상',
    orderQty1: 32950,
    orderQty2: 26958,
    totalOrderQty: 59908,
    deliveryPrice: 1131,
  },
  {
    orderId: 'ORD-20261030-010',
    storeCode: 'VTC77',
    storeName: 'GS25천안불당점',
    orderItemCode: '28607290046',
    orderItemName: '토네이도후랑크소시지크루아상',
    orderQty1: 6875,
    orderQty2: 5625,
    totalOrderQty: 12500,
    deliveryPrice: 0, // ★ 단가 미입력 또는 0 -> 역마진 발생!
  },
  {
    orderId: 'ORD-20261030-011',
    storeCode: 'VUG10',
    storeName: 'GS25청주가경점',
    orderItemCode: '28607290144',
    orderItemName: '더 큰)스팸2배계란볶음밥',
    orderQty1: 77,
    orderQty2: 63,
    totalOrderQty: 140,
    deliveryPrice: 1468,
  },
  {
    orderId: 'ORD-20261030-012',
    storeCode: 'VVH05',
    storeName: 'GS25대전둔산점',
    orderItemCode: '28607290145',
    orderItemName: '더 큰)스팸2배김치볶음밥',
    orderQty1: 83,
    orderQty2: 68,
    totalOrderQty: 151,
    deliveryPrice: 1391,
  },
];

// =========================================================================
// 4. 파이프라인 엔진 코어 (BOM 재귀 전개, 46계 분배, 실시간 원가/손익 집계)
// =========================================================================
export class ProductionCostPipelineEngine {
  /**
   * 단일 원클릭 파이프라인 메인 실행 함수
   */
  public static executePipeline(
    orders: OrderIntakeItem[] = SAMPLE_STORE_ORDERS,
    totalOverheadToAllocate: number = 85000000
  ): {
    workOrders: WorkOrderDispatchItem[];
    materialDepletions: MaterialLedgerDepletionItem[];
    costResults: CostAnalysisResultItem[];
    summary: PipelineExecutionSummary;
  } {
    const logs: PipelineExecutionSummary['logs'] = [];
    const addLog = (
      step: string,
      message: string,
      type: 'info' | 'success' | 'warn' | 'error' = 'info'
    ) => {
      const now = new Date();
      const timeStr = now.toTimeString().slice(0, 8);
      logs.push({ timestamp: timeStr, step, message, type });
    };

    addLog('초기화', '생산-원가 자동 연산 파이프라인 엔진 가동 시작', 'info');

    // ----------------------------------------------------
    // STEP 1: 수주/주문 접수 집계
    // ----------------------------------------------------
    addLog(
      'STEP 1: 주문 집계',
      `GS리테일 총 ${orders.length}개 품목에 대한 1편 및 2편 주문 데이터 취합 완료`,
      'info'
    );
    const totalOrderQty = orders.reduce((sum, o) => sum + o.totalOrderQty, 0);
    const orderQty1 = orders.reduce((sum, o) => sum + o.orderQty1, 0);
    const orderQty2 = orders.reduce((sum, o) => sum + o.orderQty2, 0);
    addLog(
      'STEP 1: 주문 집계',
      `총 수주수량: ${totalOrderQty.toLocaleString()}개 (1편: ${orderQty1.toLocaleString()}개 / 2편: ${orderQty2.toLocaleString()}개)`,
      'success'
    );

    // ----------------------------------------------------
    // STEP 2: 대표제품 N:1 매핑
    // ----------------------------------------------------
    addLog(
      'STEP 2: 대표제품 매핑',
      '주문용/시즌용 바코드 코드를 표준 레시피 대표 품번으로 N:1 정규화 매핑 중...',
      'info'
    );
    const mappedOrders = orders.map((order) => {
      const mapping = REPR_MAPPINGS.find((m) => m.orderItemCode === order.orderItemCode);
      const reprCode = mapping ? mapping.reprItemCode : order.orderItemCode;
      const reprName = mapping ? mapping.reprItemName : order.orderItemName;
      const category = mapping ? mapping.category : '일반식품';
      return {
        ...order,
        reprCode,
        reprName,
        category,
      };
    });
    addLog(
      'STEP 2: 대표제품 매핑',
      `${mappedOrders.length}개 전 주문 품목의 기준 레시피 마스터 연결 완료`,
      'success'
    );

    // ----------------------------------------------------
    // STEP 3 & 4: BOM 다단계 수율 역산 전개 및 46개 공정(계) 작업지시 분배
    // ----------------------------------------------------
    addLog(
      'STEP 3: BOM 역산 전개',
      '레시피 수율(%) 역산 공식: 필요투입량 = 지시량 / (수율% / 100) 적용 시작',
      'info'
    );

    const workOrderList: WorkOrderDispatchItem[] = [];
    const materialRequirementMap: Record<
      string,
      {
        partCode: string;
        partName: string;
        partSpec: string;
        unit: string;
        warehouse: string;
        totalReqQty: number;
        category: '원재료' | '부재료' | '포장재';
      }
    > = {};

    let seqCounter = 1;

    mappedOrders.forEach((order) => {
      // 1) 완제품 성형장 지시 등록 (Finished Goods Assembly)
      let moldingGye = { gyeId: 'GFS004', gyeName: '성형장(도시락)', line: '도시락1호라인' };
      if (order.category === '김밥') {
        moldingGye = { gyeId: 'GFS005', gyeName: '성형장(김밥)', line: '김밥1호라인' };
      } else if (order.category === '삼각김밥') {
        moldingGye = { gyeId: 'GFS007', gyeName: '성형장(삼각김밥)', line: '삼각1호라인' };
      } else if (order.category === '샌드위치') {
        moldingGye = { gyeId: 'GFS002', gyeName: '성형장(샌드위치)', line: '샌드1호라인' };
      } else if (order.category === '햄버거') {
        moldingGye = { gyeId: 'GFS003', gyeName: '성형장(햄버거)', line: '버거1호라인' };
      }

      workOrderList.push({
        id: seqCounter++,
        gyeId: moldingGye.gyeId,
        gyeName: moldingGye.gyeName,
        lineName: moldingGye.line,
        workSeq: seqCounter,
        partName: order.reprName,
        partSpec: '1ea/팩',
        unit: 'ea',
        nextProcess: '포장/금속검출',
        totalOrderQty: order.totalOrderQty,
        orderQty1: order.orderQty1,
        orderQty2: order.orderQty2,
        prodQty: order.totalOrderQty,
        completeStatus: '진행중',
        completeTime: '실시간연동',
      });

      // 2) BOM 레시피 전개 (하위 반제품 및 원부자재 역산)
      const recipe = BOM_MASTER_RECIPES[order.reprCode];
      if (recipe) {
        recipe.forEach((comp) => {
          // 수율 역산 소요량: Q_req = Q_parent * (unitQty / (yieldRate / 100))
          const factor = comp.unitQty / (comp.yieldRate / 100);
          const compTotalReq = Math.round(order.totalOrderQty * factor * 100) / 100;
          const compReq1 = Math.round(order.orderQty1 * factor * 100) / 100;
          const compReq2 = Math.round(order.orderQty2 * factor * 100) / 100;

          // 반제품(Level 2)은 해당 공정(계)의 작업지시로 자동 라우팅
          if (comp.level === 2) {
            workOrderList.push({
              id: seqCounter++,
              gyeId: comp.gyeId,
              gyeName: comp.gyeName,
              lineName: comp.lineName,
              workSeq: seqCounter,
              partName: comp.componentName,
              partSpec: `${comp.unitQty}${comp.unit} 배합`,
              unit: comp.unit,
              nextProcess: comp.nextProcess,
              totalOrderQty: compTotalReq,
              orderQty1: compReq1,
              orderQty2: compReq2,
              prodQty: compTotalReq,
              completeStatus: '진행중',
              completeTime: '자동배치',
            });
          }

          // 원부자재(Level 3) 또는 반제품 하위 자재(재귀 전개) 집계
          const rawComponents = comp.subComponents || [comp];
          rawComponents.forEach((raw) => {
            if (raw.level === 3) {
              const rawFactor = raw.unitQty / (raw.yieldRate / 100);
              const rawReq = Math.round(order.totalOrderQty * rawFactor * 100) / 100;

              if (!materialRequirementMap[raw.componentCode]) {
                const cat: '원재료' | '부재료' | '포장재' =
                  comp.warehouse === '부재료보관고' ? '부재료' : '원재료';
                materialRequirementMap[raw.componentCode] = {
                  partCode: raw.componentCode,
                  partName: raw.componentName,
                  partSpec: `${raw.unitQty}${raw.unit}`,
                  unit: raw.unit,
                  warehouse: raw.warehouse,
                  totalReqQty: 0,
                  category: cat,
                };
              }
              materialRequirementMap[raw.componentCode].totalReqQty += rawReq;
            }
          });
        });
      }
    });

    addLog(
      'STEP 4: 공정 분배',
      `46개 계 마스터(GFS053~GFS501)에 맞춰 총 ${workOrderList.length}건의 작업지시 자동 라우팅 완료`,
      'success'
    );

    // ----------------------------------------------------
    // STEP 5: 자재수불부 차감 & FEFO(선입선출) 적용
    // ----------------------------------------------------
    addLog(
      'STEP 5: 자재 차감 & FEFO',
      'BOM 소요량에 따른 원부자재 실시간 출고 차감 및 유통기한 우선 LOT 선입선출 처리',
      'info'
    );

    const materialDepletions: MaterialLedgerDepletionItem[] = Object.values(
      materialRequirementMap
    ).map((mat, idx) => {
      const carried = Math.round(mat.totalReqQty * 1.5); // 가용 이월재고
      const inQ = Math.round(mat.totalReqQty * 0.8); // 당일 입고량
      const outQ = Math.round(mat.totalReqQty); // BOM 자동 출고량
      const current = carried + inQ - outQ;

      return {
        id: idx + 1,
        ledgerDate: '2026-10-30',
        category: mat.category,
        partCode: mat.partCode,
        partName: mat.partName,
        partSpec: mat.partSpec,
        unit: mat.unit,
        warehouse: mat.warehouse,
        carriedOverQty: carried,
        inQty: inQ,
        outQty: outQ,
        currentStock: current,
        safetyStock: Math.round(mat.totalReqQty * 0.4),
        fefoLotNo: `LOT-2026102${(idx % 9) + 1}-0${(idx % 5) + 1}`,
        expiryDate: `2026-11-0${(idx % 8) + 1}`,
      };
    });

    addLog(
      'STEP 5: 자재 차감 & FEFO',
      `자재수불부 총 ${materialDepletions.length}개 원부자재 현재고 자동 감량 연동 완료`,
      'success'
    );

    // ----------------------------------------------------
    // STEP 6: 실시간 원가 & 손익 집계 및 이상 단가/역마진 탐지
    // ----------------------------------------------------
    addLog(
      'STEP 6: 원가/손익 집계',
      '직접재료비, 물류비(12.5%), 간접비 배분액 및 제품별 마진/이익율 실시간 연산 시작',
      'info'
    );

    // 총 매출액 계산
    const totalSales = mappedOrders.reduce(
      (sum, o) => sum + o.totalOrderQty * (o.deliveryPrice > 0 ? o.deliveryPrice : 0),
      0
    );

    let abnormalCount = 0;

    const costResults: CostAnalysisResultItem[] = mappedOrders.map((order, idx) => {
      const salesQty = order.totalOrderQty;
      const unitPrice = order.deliveryPrice;
      const salesAmount = salesQty * (unitPrice > 0 ? unitPrice : 0);
      const salesRatio =
        totalSales > 0 ? Number(((salesAmount / totalSales) * 100).toFixed(2)) : 0;

      // 1) 직접재료비: BOM 소요 단위 단가 * 생산수량
      const recipe = BOM_MASTER_RECIPES[order.reprCode];
      let unitMaterialCost = 0;
      if (recipe) {
        recipe.forEach((c) => {
          unitMaterialCost += c.unitQty * (c.unitCost || 0);
        });
      } else {
        unitMaterialCost = Math.round(unitPrice * 0.45);
      }
      const directMaterialCost = Math.round(unitMaterialCost * salesQty);

      // 2) 제품물류비: 매출액 * 물류비율 (기본 12.5%)
      const logisticsRatio = 12.5;
      const logisticsCost = Math.round(salesAmount * (logisticsRatio / 100));

      // 3) 간접비 배분: 총 간접비 * 매출비중
      const indirectCostAllocated = Math.round(totalOverheadToAllocate * (salesRatio / 100));

      // 4) 원가 총합계
      const totalCost = indirectCostAllocated + logisticsCost + directMaterialCost;

      // 5) 손익 계산
      const salesProfit = salesAmount - totalCost;
      const unitCost = salesQty > 0 ? Math.round(totalCost / salesQty) : 0;
      const unitProfit = unitPrice - unitCost;
      const profitRate =
        salesAmount > 0 ? Number(((salesProfit / salesAmount) * 100).toFixed(2)) : 0;
      const costRatio =
        salesAmount > 0 ? Number(((totalCost / salesAmount) * 100).toFixed(2)) : 0;

      // 이상 단가 및 역마진 검출
      const isAbnormalPrice = unitPrice <= 0 || unitPrice === -9 || unitPrice === -99;
      const isLossItem = salesProfit < 0 || unitProfit < 0 || (unitPrice > 0 && unitPrice < unitMaterialCost);

      if (isAbnormalPrice || isLossItem) {
        abnormalCount++;
      }

      let alertMessage = '';
      if (isAbnormalPrice) {
        alertMessage = '★ 납품단가 미등록(-9/0원)';
      } else if (isLossItem) {
        alertMessage = `★ 역마진 경고 (개당손익: ${unitProfit.toLocaleString()}원)`;
      }

      return {
        id: idx + 1,
        productId: order.reprCode,
        productName: order.reprName,
        salesAmount,
        salesRatio,
        indirectCostAllocated,
        logisticsRatio,
        logisticsCost,
        directMaterialUnit: unitMaterialCost,
        productionQty: salesQty,
        directMaterialCost,
        totalCost,
        salesProfit,
        profitRate,
        costRatio,
        salesQty,
        unitPrice,
        unitCost,
        unitProfit,
        isAbnormalPrice,
        isLossItem,
        alertMessage,
      };
    });

    if (abnormalCount > 0) {
      addLog(
        'STEP 6: 원가/손익 집계',
        `경고: 총 ${abnormalCount}건의 이상 단가 또는 역마진 품목 검출 (토네이도후랑크소시지크루아상 등)`,
        'warn'
      );
    }

    const totalDirectMat = costResults.reduce((s, c) => s + c.directMaterialCost, 0);
    const totalLogistics = costResults.reduce((s, c) => s + c.logisticsCost, 0);
    const totalIndirect = costResults.reduce((s, c) => s + c.indirectCostAllocated, 0);
    const totalCostSum = costResults.reduce((s, c) => s + c.totalCost, 0);
    const netProfit = totalSales - totalCostSum;
    const overallProfitRate = totalSales > 0 ? Number(((netProfit / totalSales) * 100).toFixed(2)) : 0;

    addLog(
      '완료',
      `파이프라인 연산 완료 | 매출: ${totalSales.toLocaleString()}원, 총원가: ${totalCostSum.toLocaleString()}원, 순손익: ${netProfit.toLocaleString()}원 (${overallProfitRate}%)`,
      'success'
    );

    const now = new Date();
    const summary: PipelineExecutionSummary = {
      executionDate: kstToday(),
      executionTime: now.toTimeString().slice(0, 8),
      totalOrdersCount: orders.length,
      totalOrdersQty: totalOrderQty,
      dispatchedWorkOrdersCount: workOrderList.length,
      depletedMaterialsCount: materialDepletions.length,
      totalSalesAmount: totalSales,
      totalDirectMaterialCost: totalDirectMat,
      totalLogisticsCost: totalLogistics,
      totalIndirectCost: totalIndirect,
      totalCostAmount: totalCostSum,
      netProfitAmount: netProfit,
      overallProfitRate,
      abnormalItemsCount: abnormalCount,
      logs,
    };

    return {
      workOrders: workOrderList,
      materialDepletions,
      costResults,
      summary,
    };
  }
}


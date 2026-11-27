/**
 * GFS 실별·시간대별 작업지시서 자동 생성 엔진
 * - 공정 순서: 흰밥(1) → 흑미밥(2) → 복합(3) → 주황(4-1) → 적색(4-2) → 진한적색(4-3)
 * - 성형장 Forward Scheduling (09:30 동시 개시, 버퍼 자동 삽입)
 * - 전처리실 Backward Scheduling (-150 / -90 / -60 / -40분 역산, kg 환산, 공통 토핑 Batching)
 * - 10시 이전(선행) / 10시 이후(본수주 확정) 2종 모드 및 증감 비교 지원
 */

export type ShiftType = '2편' | '1편';
export type WorkOrderWindowMode = 'pre10' | 'post10';

export type RiceColorCode = '1' | '2' | '3' | '4-1' | '4-2' | '4-3';
export type RiceColorBadge = '흰밥' | '흑미밥' | '복합' | '빨간밥' | '세척/전환';

export type FormingLineName =
  | '도시락 1라인'
  | '김밥 성형'
  | '김밥 포장'
  | '더큰 삼각라인'
  | '삼각 1호기'
  | '삼각 2호기'
  | '커플 포장기';

export interface RawOrderInput {
  supplier?: string;
  productName: string;
  shiftType?: ShiftType;
  eaQty: number;
}

export interface BomMaterialInput {
  materialName: string;
  unitQty: number; // 원물 단위 투입량
  unit: string; // g, kg, ea, 매 등
  yieldRate?: number; // 수율(%) 기본 100
  warehouse?: string;
  nextProcess?: string;
}

export interface AggregatedOrderItem {
  shiftType: ShiftType;
  baseProductName: string;
  eaQty: number;
  pre10EaQty?: number;
  diffEa?: number;
  riceColorCode: RiceColorCode;
  riceColorLabel: string;
  riceColorBadge: RiceColorBadge;
  primaryLine: FormingLineName;
  bomMaterials: BomMaterialInput[];
  scheduledTimeRange?: string;
  durationMin?: number;
  totalMaterialKg?: number;
  sharePct?: number;
}

export interface FormingScheduleRow {
  id: string;
  lineName: FormingLineName;
  shiftType: ShiftType | '공통';
  seq: number;
  startMin: number;
  endMin: number;
  timeRange: string;
  durationMin: number;
  rowType: '생산' | '세척/전환' | '휴게';
  baseProductName: string;
  eaQty: number;
  diffEa?: number;
  uph: number;
  riceColorCode?: RiceColorCode;
  riceColorLabel: string;
  riceColorBadge: RiceColorBadge;
  workers?: string;
  note: string;
}

export interface PrepScheduleRow {
  id: string;
  room: '계량실·냉동실' | '취반기' | '로터리 믹서' | '조리실' | '샐러드실' | '채소·커팅실';
  shiftType: ShiftType | '공통';
  startMin: number;
  endMin: number;
  timeRange: string;
  rowType: '작업' | '세척/전환';
  targetLine: string;
  baseProductName: string;
  materialName: string;
  eaQty: number;
  unitWeightG: number;
  requiredKg: number;
  riceColorBadge: RiceColorBadge;
  isBatched?: boolean;
  workers?: string;
  note: string;
}

export const DEFAULT_LINE_WORKERS: Record<FormingLineName, string> = {
  '도시락 1라인': '14명',
  '김밥 성형': '4명',
  '김밥 포장': '6명',
  '더큰 삼각라인': '3명',
  '삼각 1호기': '3명',
  '삼각 2호기': '3명',
  '커플 포장기': '2명',
};

export const DEFAULT_ROOM_WORKERS: Record<PrepScheduleRow['room'], string> = {
  '계량실·냉동실': '2명',
  '취반기': '3명',
  '로터리 믹서': '2명',
  '채소·커팅실': '4명',
  '조리실': '4명',
  '샐러드실': '3명',
};

export interface RiceWorkOrderResult {
  mode: WorkOrderWindowMode;
  workDate: string;
  tab1Master: AggregatedOrderItem[];
  tab2PrepRice: PrepScheduleRow[]; // 계량실·취반기·로터리
  tab3PrepCook: PrepScheduleRow[]; // 조리실·샐러드실·채소/커팅실
  tab4FormingBentoGimbap: FormingScheduleRow[]; // 도시락 1라인 & 김밥 성형/포장
  tab5FormingSamgak: FormingScheduleRow[]; // 더큰 삼각 & 삼각 1·2호기 & 커플포장기
  summary: {
    totalItems: number;
    totalEa: number;
    totalKg: number;
    shift2Ea: number;
    shift1Ea: number;
    colorBreakdown: Array<{ badge: RiceColorBadge; ea: number; pct: number }>;
    lineSummaries: Array<{
      lineName: FormingLineName;
      totalEa: number;
      endTime: string;
      endMin: number;
      isBottleneck: boolean;
    }>;
  };
}

export const LINE_UPH_MAP: Record<FormingLineName, number> = {
  '도시락 1라인': 1600,
  '김밥 성형': 1800,
  '김밥 포장': 2200,
  '더큰 삼각라인': 2400,
  '삼각 1호기': 2500,
  '삼각 2호기': 2500,
  '커플 포장기': 2500,
};

/** 현장 실측 기반 품목별 RPM(UPH) 보정 */
export function resolveItemUph(lineName: FormingLineName, baseProductName: string): number {
  const name = baseProductName || '';
  if (lineName === '도시락 1라인') {
    if (/자투리/.test(name)) return 1000;
    if (/꼬마김밥/.test(name)) return 1500;
    if (/반반제육|갈비양념제육|두부김치제육/.test(name)) return 1800;
    return 1600;
  }
  if (lineName === '김밥 포장') {
    if (/꼬마김밥/.test(name)) return 1200;
    return 2200;
  }
  return LINE_UPH_MAP[lineName];
}

/** 현장 배치 기준: 특수/자투리 품목은 동일 색상 내 후반부 배치 */
function getSpecialTailOrder(baseProductName: string): number {
  const name = baseProductName || '';
  if (/자투리/.test(name)) return 3;
  if (/꼬마김밥/.test(name)) return 2;
  if (/이달의도시락/.test(name)) return 1;
  return 0;
}

/** 현장 실측 기준: 품목 간 기본 전환 리더타임(분) */
function getItemChangeLeadMin(lineName: FormingLineName, nextProductName: string): number {
  if (lineName === '더큰 삼각라인') return 10;
  if (lineName === '도시락 1라인') {
    if (/자투리/.test(nextProductName)) return 10;
    if (/돈까스|꼬마김밥/.test(nextProductName)) return 7;
    return 5;
  }
  return 5;
}

const COLOR_SORT_ORDER: Record<RiceColorCode, number> = {
  '1': 1,
  '2': 2,
  '3': 3,
  '4-1': 4,
  '4-2': 5,
  '4-3': 6,
};

export function formatMinutesToHHMM(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  const hh = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function formatTimeRange(startMin: number, endMin: number): string {
  return `${formatMinutesToHHMM(startMin)} ~ ${formatMinutesToHHMM(endMin)}`;
}

/** 2.2 기본상품명 정규화: 선행 ^(주문) 제거 + 후행 (1편|2편|1|2)$ 제거 + trim */
export function normalizeBaseProductName(rawName: string): string {
  let s = (rawName || '').trim();
  s = s.replace(/^\(주문\)\s*/, '');
  s = s.replace(/^주문\s+/, '');
  s = s.replace(/\s*(?:1편|2편|[12])$/, '');
  return s.trim();
}

/** 2.1 편 구분: 공급자 컬럼 값에 '2편' 포함 시 2편, '1편' 포함 시 1편 */
export function classifyShiftFromSupplier(supplier?: string): ShiftType {
  const s = (supplier || '').trim();
  if (s.includes('1편')) return '1편';
  return '2편';
}

/** 3.1 밥 색상 구분 (BOM 기반 + 상품명 보조) */
export function classifyRiceColor(
  baseProductName: string,
  bomMaterials: BomMaterialInput[]
): { code: RiceColorCode; label: string; badge: RiceColorBadge } {
  const matJoined = bomMaterials.map((m) => m.materialName).join(' ');
  const name = baseProductName || '';

  // 3 복합 (흰밥+빨간밥 동기화 브릿지)
  if (/커플\)\s*곱창김참치&비빔밥|곱창김참치&비빔/.test(name)) {
    return { code: '3', label: '3 복합(흰+빨)', badge: '복합' };
  }

  // 4-3 진한적색밥: 김치볶음밥용소스
  if (/김치볶음밥용소스/.test(matJoined) || /김치볶음/.test(name)) {
    return { code: '4-3', label: '4-3 진한적색(김치)', badge: '빨간밥' };
  }

  // 4-2 적색밥: 뉴비빔밥용고추장소스
  if (/뉴비빔밥용고추장소스/.test(matJoined) || /전주비빔/.test(name)) {
    return { code: '4-2', label: '4-2 적색(고추장)', badge: '빨간밥' };
  }

  // 4-1 주황밥: 파프리카소스
  if (/파프리카소스/.test(matJoined) || /떡갈비김밥/.test(name)) {
    return { code: '4-1', label: '4-1 주황(파프리카)', badge: '빨간밥' };
  }

  // 2 흑미밥: [상온] 흑미 등
  if (/흑미/.test(matJoined) || /두툼돈까스&순창제육|두부김치제육|반반제육도시락|백설갈비양념제육/.test(name)) {
    return { code: '2', label: '2 흑미밥', badge: '흑미밥' };
  }

  // 1 흰밥 (최우선)
  return { code: '1', label: '1 흰밥', badge: '흰밥' };
}

/** 3.2 라인 배정 */
export function assignPrimaryLine(baseProductName: string): FormingLineName {
  const n = baseProductName || '';
  if (/커플\)\s*곱창김참치&비빔밥|곱창김참치&비빔/.test(n)) return '커플 포장기';
  if (/더큰/.test(n)) return '더큰 삼각라인';
  if (/무스비/.test(n)) return '삼각 1호기';
  if (/삼각/.test(n) && /전주비빔/.test(n)) return '삼각 2호기';
  if (/삼각/.test(n)) return '삼각 1호기';
  if (/김밥/.test(n)) return '김밥 성형';
  return '도시락 1라인';
}

function getColorGroupMajor(code: RiceColorCode): '1' | '2' | '3' | '4' {
  if (code.startsWith('4')) return '4';
  return code as '1' | '2' | '3';
}

function toGramWeight(qty: number, unit: string): number {
  const u = (unit || '').toLowerCase().trim();
  if (u === 'kg') return qty * 1000;
  if (u === 'g' || u === 'ml') return qty;
  return 0;
}

function classifyPrepRoom(matName: string, nextProcess?: string): PrepScheduleRow['room'] {
  const m = `${matName} ${nextProcess || ''}`;
  if (/백미|흑미|쌀|찹쌀/.test(m)) return '취반기';
  if (/조미에센스|조미액|취반소스|치킨조미소스|파프리카소스|고추장소스|김치볶음밥용소스|참기름/.test(m)) {
    return '로터리 믹서';
  }
  if (/시금치|도라지|콩나물|깍두기|단무지|쪽파|양파|양배추|당근|오이|채소|커팅|찹핑|슬라이스/.test(m)) {
    return '채소·커팅실';
  }
  if (/참치마요|샐러드|마요|코울슬로|계란말이|지단|에그/.test(m)) {
    return '샐러드실';
  }
  if (/제육|불고기|돈까스|치킨|닭강정|소시지|떡갈비|볶음|스팀|후라이|오븐|미트볼|어묵/.test(m)) {
    return '조리실';
  }
  return '계량실·냉동실';
}

/** 4. 성형장 단일 라인 Forward Scheduling */
function scheduleFormingLine(
  lineName: FormingLineName,
  items: AggregatedOrderItem[],
  startOffsetMin = 0
): FormingScheduleRow[] {
  const uph = LINE_UPH_MAP[lineName];
  const rows: FormingScheduleRow[] = [];
  let cursor = 9 * 60 + 30 + startOffsetMin; // 09:30 기준
  let seq = 1;
  let lunchTaken = false;
  let dinnerTaken = false;

  const shifts: ShiftType[] = ['2편', '1편'];

  for (let sIdx = 0; sIdx < shifts.length; sIdx++) {
    const shift = shifts[sIdx];
    const shiftItems = items
      .filter((it) => it.shiftType === shift && it.eaQty > 0)
      .sort(
        (a, b) =>
          COLOR_SORT_ORDER[a.riceColorCode] - COLOR_SORT_ORDER[b.riceColorCode] ||
          getSpecialTailOrder(a.baseProductName) - getSpecialTailOrder(b.baseProductName) ||
          b.eaQty - a.eaQty ||
          a.baseProductName.localeCompare(b.baseProductName, 'ko')
      );

    if (shiftItems.length === 0) continue;

    // 2편 종료 → 1편 시작 시 편 교체 완전 분해세척 (+35분)
    if (sIdx === 1 && rows.length > 0) {
      rows.push({
        id: `${lineName}-shift-clean`,
        lineName,
        shiftType: '공통',
        seq: seq++,
        startMin: cursor,
        endMin: cursor + 35,
        timeRange: formatTimeRange(cursor, cursor + 35),
        durationMin: 35,
        rowType: '세척/전환',
        baseProductName: '편 교체(2편→1편) 호퍼·성형틀 완전 분해세척',
        eaQty: 0,
        uph,
        riceColorLabel: '분해세척',
        riceColorBadge: '세척/전환',
        note: '교대 및 완전 분해세척 (+35분)',
      });
      cursor += 35;
    }

    for (let i = 0; i < shiftItems.length; i++) {
      const item = shiftItems[i];
      const prev = i > 0 ? shiftItems[i - 1] : null;

      if (prev) {
        const prevMajor = getColorGroupMajor(prev.riceColorCode);
        const curMajor = getColorGroupMajor(item.riceColorCode);
        const isColorChange = prevMajor !== curMajor || prev.riceColorCode !== item.riceColorCode;

        // 중식 (11:45 ~ 13:30) 색상 전환 시점 병합 (+60분)
        if (!lunchTaken && cursor >= 11 * 60 + 45 && cursor <= 13 * 60 + 30 && isColorChange) {
          rows.push({
            id: `${lineName}-lunch`,
            lineName,
            shiftType: shift,
            seq: seq++,
            startMin: cursor,
            endMin: cursor + 60,
            timeRange: formatTimeRange(cursor, cursor + 60),
            durationMin: 60,
            rowType: '휴게',
            baseProductName: '중식 및 밥 색상 전환 세척 (병합)',
            eaQty: 0,
            uph,
            riceColorLabel: '중식/세척',
            riceColorBadge: '세척/전환',
            note: '11:45~13:30 색상전환+중식 병합 (+60분)',
          });
          cursor += 60;
          lunchTaken = true;
        } else if (!dinnerTaken && cursor >= 17 * 60 + 45 && cursor <= 20 * 60 && isColorChange) {
          // 석식 (17:45 ~ 20:00) 색상 전환 시점 병합 (+40분)
          rows.push({
            id: `${lineName}-dinner`,
            lineName,
            shiftType: shift,
            seq: seq++,
            startMin: cursor,
            endMin: cursor + 40,
            timeRange: formatTimeRange(cursor, cursor + 40),
            durationMin: 40,
            rowType: '휴게',
            baseProductName: '석식 및 밥 색상 전환 세척 (병합)',
            eaQty: 0,
            uph,
            riceColorLabel: '석식/세척',
            riceColorBadge: '세척/전환',
            note: '17:45~20:00 색상전환+석식 병합 (+40분)',
          });
          cursor += 40;
          dinnerTaken = true;
        } else if (isColorChange) {
          // 밥 색상 전환 간이세척 (현장 실측: 10분, 단 김밥/주먹밥 2호기 등 기본 5~10분)
          const colorCleanMin = lineName === '김밥 성형' || lineName === '김밥 포장' ? 5 : 10;
          rows.push({
            id: `${lineName}-color-${shift}-${i}`,
            lineName,
            shiftType: shift,
            seq: seq++,
            startMin: cursor,
            endMin: cursor + colorCleanMin,
            timeRange: formatTimeRange(cursor, cursor + colorCleanMin),
            durationMin: colorCleanMin,
            rowType: '세척/전환',
            baseProductName: `밥 색상 전환(${prev.riceColorBadge}→${item.riceColorBadge}) 간이세척`,
            eaQty: 0,
            uph,
            riceColorLabel: '색전환 세척',
            riceColorBadge: '세척/전환',
            note: `호퍼 잔밥 제거 및 간이세척 (+${colorCleanMin}분)`,
          });
          cursor += colorCleanMin;
        } else {
          // 동일 밥 색상 내 품목 변경 리더타임 (현장 실측: 기본 5분, 더큰 10분, 도시락 5~10분)
          cursor += getItemChangeLeadMin(lineName, item.baseProductName);
        }
      }

      // 11:45~13:30 구간에 색상 전환 없이 넘어간 경우 중식 자동 삽입
      if (!lunchTaken && cursor >= 12 * 60 + 15 && cursor <= 13 * 60 + 30) {
        rows.push({
          id: `${lineName}-lunch-auto`,
          lineName,
          shiftType: shift,
          seq: seq++,
          startMin: cursor,
          endMin: cursor + 60,
          timeRange: formatTimeRange(cursor, cursor + 60),
          durationMin: 60,
          rowType: '휴게',
          baseProductName: '중식 및 라인 위생 점검',
          eaQty: 0,
          uph,
          riceColorLabel: '중식',
          riceColorBadge: '세척/전환',
          note: '중식 시간 (+60분)',
        });
        cursor += 60;
        lunchTaken = true;
      }

      const itemUph = resolveItemUph(lineName, item.baseProductName);
      const durationMin = Math.max(1, Math.ceil((item.eaQty / itemUph) * 60));
      rows.push({
        id: `${lineName}-${shift}-${i}`,
        lineName,
        shiftType: shift,
        seq: seq++,
        startMin: cursor,
        endMin: cursor + durationMin,
        timeRange: formatTimeRange(cursor, cursor + durationMin),
        durationMin,
        rowType: '생산',
        baseProductName: item.baseProductName,
        eaQty: item.eaQty,
        diffEa: item.diffEa,
        uph: itemUph,
        riceColorCode: item.riceColorCode,
        riceColorLabel: item.riceColorLabel,
        riceColorBadge: item.riceColorBadge,
        workers: DEFAULT_LINE_WORKERS[lineName] || '-',
        note: i === 0 ? '동일색상 최우선 배치' : '',
      });
      cursor += durationMin;
    }
  }

  // 일일 마감 세척 (+35분)
  if (rows.length > 0) {
    rows.push({
      id: `${lineName}-eod-clean`,
      lineName,
      shiftType: '공통',
      seq: seq++,
      startMin: cursor,
      endMin: cursor + 35,
      timeRange: formatTimeRange(cursor, cursor + 35),
      durationMin: 35,
      rowType: '세척/전환',
      baseProductName: '일일 마감 완전 분해 세척 및 CIP 살균',
      eaQty: 0,
      uph,
      riceColorLabel: '마감세척',
      riceColorBadge: '세척/전환',
      note: '1편 최종 품목 종료 후 마감 세척 (+35분)',
    });
  }

  return rows;
}

/** 메인 생성 함수 */
export function generateRiceWorkOrder(params: {
  mode: WorkOrderWindowMode;
  workDate: string;
  orders: RawOrderInput[];
  pre10BaselineOrders?: RawOrderInput[];
  bomByNormName: Map<string, BomMaterialInput[]>;
}): RiceWorkOrderResult {
  const { mode, workDate, orders, pre10BaselineOrders = [], bomByNormName } = params;

  const aggregate = (list: RawOrderInput[]) => {
    const map = new Map<string, { shiftType: ShiftType; baseProductName: string; eaQty: number }>();
    for (const row of list) {
      const qty = Math.round(Number(row.eaQty) || 0);
      if (qty <= 0) continue;
      const shiftType = row.shiftType || classifyShiftFromSupplier(row.supplier);
      const baseProductName = normalizeBaseProductName(row.productName);
      if (!baseProductName) continue;
      const key = `${shiftType}::${baseProductName}`;
      const existing = map.get(key);
      if (existing) {
        existing.eaQty += qty;
      } else {
        map.set(key, { shiftType, baseProductName, eaQty: qty });
      }
    }
    return map;
  };

  const mainMap = aggregate(orders);
  const pre10Map = aggregate(pre10BaselineOrders);

  const tab1Master: AggregatedOrderItem[] = [];
  for (const [key, entry] of mainMap.entries()) {
    const normKey = entry.baseProductName.replace(/\s+/g, '');
    const bomMaterials = bomByNormName.get(normKey) || [];
    const color = classifyRiceColor(entry.baseProductName, bomMaterials);
    const primaryLine = assignPrimaryLine(entry.baseProductName);
    const pre10Ea = pre10Map.get(key)?.eaQty;
    const diffEa =
      mode === 'post10' && pre10BaselineOrders.length > 0
        ? entry.eaQty - (pre10Ea ?? 0)
        : undefined;

    tab1Master.push({
      shiftType: entry.shiftType,
      baseProductName: entry.baseProductName,
      eaQty: entry.eaQty,
      pre10EaQty: pre10Ea,
      diffEa,
      riceColorCode: color.code,
      riceColorLabel: color.label,
      riceColorBadge: color.badge,
      primaryLine,
      bomMaterials,
    });
  }

  tab1Master.sort(
    (a, b) =>
      (a.shiftType === b.shiftType ? 0 : a.shiftType === '2편' ? -1 : 1) ||
      COLOR_SORT_ORDER[a.riceColorCode] - COLOR_SORT_ORDER[b.riceColorCode] ||
      getSpecialTailOrder(a.baseProductName) - getSpecialTailOrder(b.baseProductName) ||
      b.eaQty - a.eaQty ||
      a.baseProductName.localeCompare(b.baseProductName, 'ko')
  );

  // 성형장 라인별 스케줄 생성
  const bentoRows = scheduleFormingLine(
    '도시락 1라인',
    tab1Master.filter((i) => i.primaryLine === '도시락 1라인')
  );
  const gimbapItems = tab1Master.filter((i) => i.primaryLine === '김밥 성형');
  const gimbapMoldRows = scheduleFormingLine('김밥 성형', gimbapItems, 0);
  const gimbapPackRows = scheduleFormingLine('김밥 포장', gimbapItems, 40); // 성형 개시(09:30) 후 10:10 포장 개시

  const deokunRows = scheduleFormingLine(
    '더큰 삼각라인',
    tab1Master.filter((i) => i.primaryLine === '더큰 삼각라인')
  );

  // 커플 상품은 삼각 1호기(참치) + 삼각 2호기(비빔) + 커플 포장기 동시 동기화
  const coupleItems = tab1Master.filter((i) => i.primaryLine === '커플 포장기');
  const samgak1Items = [
    ...tab1Master.filter((i) => i.primaryLine === '삼각 1호기'),
    ...coupleItems.map((c) => ({ ...c, baseProductName: `${c.baseProductName} (참치파트)` })),
  ];
  const samgak2Items = [
    ...tab1Master.filter((i) => i.primaryLine === '삼각 2호기'),
    ...coupleItems.map((c) => ({ ...c, baseProductName: `${c.baseProductName} (비빔파트)` })),
  ];

  const samgak1Rows = scheduleFormingLine('삼각 1호기', samgak1Items);
  const samgak2Rows = scheduleFormingLine('삼각 2호기', samgak2Items);
  const couplePackRows = scheduleFormingLine('커플 포장기', coupleItems);

  // 10시 이전 모드에서는 성형장 초기 투입분(09:30~11:00 시작 기준) 우선 표시 필터
  const filterPre10Forming = (rows: FormingScheduleRow[]) =>
    mode === 'pre10' ? rows.filter((r) => r.startMin <= 11 * 60 && r.rowType === '생산') : rows;

  const tab4FormingBentoGimbap = filterPre10Forming([...bentoRows, ...gimbapMoldRows, ...gimbapPackRows]);
  const tab5FormingSamgak = filterPre10Forming([...deokunRows, ...samgak1Rows, ...samgak2Rows, ...couplePackRows]);

  // 5. 전처리실 역산 스케줄링 (Backward Scheduling)
  const allFormingProd = [...bentoRows, ...gimbapMoldRows, ...deokunRows, ...samgak1Rows, ...samgak2Rows].filter(
    (r) => r.rowType === '생산'
  );

  const tab2PrepRice: PrepScheduleRow[] = [];
  const tab3PrepCook: PrepScheduleRow[] = [];
  const processedPrepKeys = new Set<string>();

  // 공통 토핑 Batching (예: 참치마요)
  const batchAccumulator = new Map<string, { shift: ShiftType | '공통'; materialName: string; totalKg: number; products: string[] }>();

  for (const formRow of allFormingProd) {
    const master = tab1Master.find(
      (m) =>
        m.shiftType === formRow.shiftType &&
        (m.baseProductName === formRow.baseProductName ||
          formRow.baseProductName.startsWith(m.baseProductName))
    );
    if (!master) continue;
    const prepKey = `${formRow.shiftType}::${master.baseProductName}`;
    if (processedPrepKeys.has(prepKey)) continue;
    processedPrepKeys.add(prepKey);

    // 10시 이전 모드에서는 전처리 10:30 이전 시작분만 포함
    const materials = master.bomMaterials;
    for (let idx = 0; idx < materials.length; idx++) {
      const mat = materials[idx];
      const unitWeightG = toGramWeight(mat.unitQty, mat.unit);
      if (unitWeightG <= 0) continue; // g/kg 중량 환산 대상만 전처리 지시서에 표시
      const yieldFactor = 100 / Math.max(1, Number(mat.yieldRate) || 100);
      const requiredKg = Math.round(((formRow.eaQty * unitWeightG * yieldFactor) / 1000) * 100) / 100;
      if (requiredKg <= 0) continue;

      const room = classifyPrepRoom(mat.materialName, mat.nextProcess);

      // 공통 토핑 Batching (참치마요 등)
      if (/참치마요|계란지단|단무지/.test(mat.materialName) && room === '샐러드실') {
        const bKey = `${formRow.shiftType}::${mat.materialName}`;
        const prevB = batchAccumulator.get(bKey);
        if (prevB) {
          prevB.totalKg = Math.round((prevB.totalKg + requiredKg) * 100) / 100;
          if (!prevB.products.includes(master.baseProductName)) prevB.products.push(master.baseProductName);
        } else {
          batchAccumulator.set(bKey, {
            shift: formRow.shiftType,
            materialName: mat.materialName,
            totalKg: requiredKg,
            products: [master.baseProductName],
          });
        }
        continue;
      }

      let leadMin = 60;
      if (room === '계량실·냉동실') leadMin = 150;
      else if (room === '취반기') leadMin = 90;
      else if (room === '로터리 믹서') leadMin = 40;

      let startMin = Math.max(6 * 60, formRow.startMin - leadMin);
      let endMin = Math.max(startMin + 20, formRow.startMin - Math.max(10, leadMin - 30));

      // 전주비빔 나물 & 깍두기 찹핑 06:00~07:30 최우선 배치
      const isPriorityVeg =
        room === '채소·커팅실' && /시금치|도라지|콩나물|깍두기/.test(mat.materialName);
      if (isPriorityVeg) {
        startMin = 6 * 60;
        endMin = 7 * 60 + 30;
      }

      if (mode === 'pre10' && startMin > 10 * 60 + 30) continue;

      const prepRow: PrepScheduleRow = {
        id: `prep-${formRow.id}-${idx}`,
        room,
        shiftType: formRow.shiftType,
        startMin,
        endMin,
        timeRange: formatTimeRange(startMin, endMin),
        rowType: '작업',
        targetLine: formRow.lineName,
        baseProductName: master.baseProductName,
        materialName: mat.materialName,
        eaQty: formRow.eaQty,
        unitWeightG,
        requiredKg,
        riceColorBadge: master.riceColorBadge,
        workers: DEFAULT_ROOM_WORKERS[room] || '-',
        note: isPriorityVeg
          ? '06:00~07:30 최우선 데침/찹핑'
          : room === '계량실·냉동실' && formRow.shiftType === '1편'
          ? '10:30 본발주 확정 직후 일괄 계량'
          : '',
      };

      if (room === '계량실·냉동실' || room === '취반기' || room === '로터리 믹서') {
        tab2PrepRice.push(prepRow);
      } else {
        tab3PrepCook.push(prepRow);
      }
    }
  }

  // 로터리 믹서 10:30~11:30 완전 분해세척(45분) 고정 삽입 (수주가 있을 때만)
  if (tab1Master.length > 0) {
    tab2PrepRice.push({
      id: 'rotary-clean-mid',
      room: '로터리 믹서',
      shiftType: '공통',
      startMin: 10 * 60 + 30,
      endMin: 11 * 60 + 15,
      timeRange: '10:30 ~ 11:15',
      rowType: '세척/전환',
      targetLine: '로터리 전 라인',
      baseProductName: '2편 종료 후 로터리 완전 분해세척 (45분)',
      materialName: '-',
      eaQty: 0,
      unitWeightG: 0,
      requiredKg: 0,
      riceColorBadge: '세척/전환',
      workers: DEFAULT_ROOM_WORKERS['로터리 믹서'],
      note: '흰밥→주황→빨간 2편 사이클 종료 후 완전 세척',
    });
  }

  // 통합 배합(Batching) 행 추가
  for (const [bKey, b] of batchAccumulator.entries()) {
    const startMin = b.shift === '2편' ? 7 * 60 + 30 : 13 * 60 + 30;
    if (mode === 'pre10' && startMin > 10 * 60 + 30) continue;
    tab3PrepCook.push({
      id: `batch-${bKey}`,
      room: '샐러드실',
      shiftType: b.shift,
      startMin,
      endMin: startMin + 40,
      timeRange: formatTimeRange(startMin, startMin + 40),
      rowType: '작업',
      targetLine: `${b.products.length}개 품목 일괄 배합`,
      baseProductName: b.products.slice(0, 3).join(', ') + (b.products.length > 3 ? ` 외 ${b.products.length - 3}종` : ''),
      materialName: `${b.materialName} (통합배합)`,
      eaQty: 0,
      unitWeightG: 0,
      requiredKg: b.totalKg,
      riceColorBadge: '흰밥',
      isBatched: true,
      workers: DEFAULT_ROOM_WORKERS['샐러드실'],
      note: '편별 1회 일괄 배합 후 라인별 소분 불출',
    });
  }

  tab2PrepRice.sort((a, b) => a.startMin - b.startMin || a.room.localeCompare(b.room, 'ko'));
  tab3PrepCook.sort((a, b) => a.startMin - b.startMin || a.room.localeCompare(b.room, 'ko'));

  const totalEa = tab1Master.reduce((s, r) => s + r.eaQty, 0);
  const shift2Ea = tab1Master.filter((r) => r.shiftType === '2편').reduce((s, r) => s + r.eaQty, 0);
  const shift1Ea = tab1Master.filter((r) => r.shiftType === '1편').reduce((s, r) => s + r.eaQty, 0);
  const totalKg = Math.round(
    [...tab2PrepRice, ...tab3PrepCook].reduce((s, r) => s + r.requiredKg, 0) * 100
  ) / 100;

  // Tab 1 각 품목에 예상 가동시간 · 원물중량(kg) · 물량비중(%) 매핑
  const formByKey = new Map<string, FormingScheduleRow>();
  for (const fr of allFormingProd) {
    const cleanName = fr.baseProductName.replace(/\s*\((?:참치|비빔)파트\)$/, '');
    const k = `${fr.shiftType}::${cleanName}`;
    if (!formByKey.has(k)) formByKey.set(k, fr);
  }
  for (const item of tab1Master) {
    const fr = formByKey.get(`${item.shiftType}::${item.baseProductName}`);
    if (fr) {
      item.scheduledTimeRange = fr.timeRange;
      item.durationMin = fr.durationMin;
    }
    const itemKg = item.bomMaterials.reduce((sum, mat) => {
      const g = toGramWeight(mat.unitQty, mat.unit);
      const yf = 100 / Math.max(1, Number(mat.yieldRate) || 100);
      return sum + (g > 0 ? Math.round(((item.eaQty * g * yf) / 1000) * 100) / 100 : 0);
    }, 0);
    item.totalMaterialKg = Math.round(itemKg * 100) / 100;
    item.sharePct = totalEa > 0 ? Math.round((item.eaQty / totalEa) * 1000) / 10 : 0;
  }

  // 밥 색상별 물량 비율
  const colorBadges: RiceColorBadge[] = ['흰밥', '흑미밥', '복합', '빨간밥'];
  const colorBreakdown = colorBadges.map((badge) => {
    const ea = tab1Master.filter((r) => r.riceColorBadge === badge).reduce((s, r) => s + r.eaQty, 0);
    return { badge, ea, pct: totalEa > 0 ? Math.round((ea / totalEa) * 1000) / 10 : 0 };
  });

  // 라인별 예상 마감시각 및 병목(최장 가동 라인) 계산
  const lineGroups: Array<{ lineName: FormingLineName; rows: FormingScheduleRow[] }> = [
    { lineName: '도시락 1라인', rows: bentoRows },
    { lineName: '김밥 성형', rows: gimbapMoldRows },
    { lineName: '더큰 삼각라인', rows: deokunRows },
    { lineName: '삼각 1호기', rows: samgak1Rows },
    { lineName: '삼각 2호기', rows: samgak2Rows },
  ];
  const rawLineSummaries = lineGroups
    .map((g) => {
      const prodRows = g.rows.filter((r) => r.rowType === '생산');
      const lineEa = prodRows.reduce((s, r) => s + r.eaQty, 0);
      const lastEnd = prodRows.length > 0 ? Math.max(...prodRows.map((r) => r.endMin)) : 0;
      return {
        lineName: g.lineName,
        totalEa: lineEa,
        endTime: lastEnd > 0 ? formatMinutesToHHMM(lastEnd) : '-',
        endMin: lastEnd,
        isBottleneck: false,
      };
    })
    .filter((l) => l.totalEa > 0);
  const maxEndMin = rawLineSummaries.length > 0 ? Math.max(...rawLineSummaries.map((l) => l.endMin)) : 0;
  const lineSummaries = rawLineSummaries.map((l) => ({
    ...l,
    isBottleneck: maxEndMin > 0 && l.endMin === maxEndMin,
  }));

  return {
    mode,
    workDate,
    tab1Master,
    tab2PrepRice,
    tab3PrepCook,
    tab4FormingBentoGimbap,
    tab5FormingSamgak,
    summary: {
      totalItems: tab1Master.length,
      totalEa,
      totalKg,
      shift2Ea,
      shift1Ea,
      colorBreakdown,
      lineSummaries,
    },
  };
}

/**
 * 기준정보 설정(ProductionConfigModal)에 저장된 라인·작업실별 투입인원을
 * 생성된 RiceWorkOrderResult에 반영한다.
 */
export function applyWorkersOverride(
  result: RiceWorkOrderResult,
  lineWorkers?: Partial<Record<FormingLineName, string>>,
  roomWorkers?: Partial<Record<PrepScheduleRow['room'], string>>
): RiceWorkOrderResult {
  const mapForming = (rows: FormingScheduleRow[]) =>
    rows.map((r) => ({
      ...r,
      workers:
        (lineWorkers && lineWorkers[r.lineName]) ||
        r.workers ||
        DEFAULT_LINE_WORKERS[r.lineName] ||
        '-',
    }));
  const mapPrep = (rows: PrepScheduleRow[]) =>
    rows.map((r) => ({
      ...r,
      workers:
        (roomWorkers && roomWorkers[r.room]) ||
        r.workers ||
        DEFAULT_ROOM_WORKERS[r.room] ||
        '-',
    }));

  return {
    ...result,
    tab2PrepRice: mapPrep(result.tab2PrepRice),
    tab3PrepCook: mapPrep(result.tab3PrepCook),
    tab4FormingBentoGimbap: mapForming(result.tab4FormingBentoGimbap),
    tab5FormingSamgak: mapForming(result.tab5FormingSamgak),
  };
}


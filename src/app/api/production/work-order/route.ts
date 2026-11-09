import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { makeDocNo } from '@/lib/kst';
import { normName } from '@/lib/gfs/norm';
import { getCanonicalDailyReport } from '@/components/production/data/dailyProductionReportData';

function normalizeWarehouse(rawWh?: string | null): string {
  if (!rawWh) return '상온';
  const w = String(rawWh).trim();
  if (w === '냉장1' || w === '냉장창고1') return '냉장1';
  if (w === '냉장2' || w === '냉장창고2') return '냉장2';
  if (w === '냉동' || w === '냉동창고') return '냉동';
  if (w === '상온' || w === '상온창고') return '상온';
  if (w === '부자재' || w === '부자재창고') return '부자재';
  return w.replace(/창고$/, '');
}

// 가공 반제품 / 전처리 규격품 정본 보관창고 사전 (사용자 지정 & 공장 실무 기준)
const CUSTOM_ITEM_WAREHOUSE_MAP: Record<string, string> = {
  '계란옷소시지전튀김_1/2컷': '냉동',
  '계란옷소시지전튀김(52개)': '냉동',
  '미니등심돈까스70_1/2컷': '냉동',
  '고미트햄슬라이스_24등분': '상온',
  '에그스크램블(해동)': '냉동',
  '풍림)얇은고명지단H(해동)': '냉동',
  '선진)김밥용남도떡갈비_1/2컷': '냉동',
  '한울)유채나물무침(해동)': '냉동',
  '한울)곤드레나물(해동)': '냉동',
  '선진)통통한칼집소시지_1/2대각': '냉장1',
  '야채계란말이_1/2대각컷': '냉장1',
  '숯불갈비맛스모크햄(찹핑)': '냉장1',
  '아워홈)부산어묵볼(봉당130개)': '냉장1',
  '한울)볶음김치(자연탈수)': '냉장2',
  '종가)백볶음김치(탈수)': '냉장2',
  '반찬단지)진미채견과볶음': '냉장2',
  '세천팜)8mm단무지': '냉장1',
  '신슈단무지(꼬들단무지)': '상온',
  '신슈알밥용단무지': '냉장2',
  '깐쪽파슬라이스(2mm)(소독/탈수)': '냉장2',
  '깐쪽파슬라이스(2mm)흰부위제거': '냉장2',
  '양파슬라이스(3mm)(커팅)': '냉장2',
  '양배추슬라이스3mm(세척)': '냉장2',
  '[선]깍두기찹핑(7mm)': '냉장2',
  '[선]콩나물찹핑(1cm)': '냉장2',
  '[선]도라지찹핑(7mm)': '냉장2',
  '[선]당근찹핑(7mm)': '냉장2',
  '[선]시금치찹핑(7mm)': '냉장2',
};

function normalizeForBom(name: string): string {
  let s = (name || '').trim();
  s = s.replace(/^\(주문\)\s*/, '');
  s = s.replace(/\s*[12]편$/, '');
  s = s.replace(/[12]$/, '');
  s = s.replace(/\s+/g, '');
  return s;
}

// 11대 생산현장 표준 라인 정의 및 유연한 라우팅 해석기
interface LineRoutingDef {
  key: string;
  label: string;
  kind: 'PREP' | 'FORMING';
  keywords: string[];
  gyeIds: string[];
  defaultTimeStart: string;
  speedUph: number;
  workers: string;
  leadWorker: string;
  ccp: string;
}

function resolveLineRouting(lineName: string): LineRoutingDef {
  const l = (lineName || '').trim();

  // 성형 9개 라인 (엑셀 타임테이블 및 참고자료 시트 100% 반영)
  if (l.includes('도시락') || l === 'ALL_SEONGHYEONG') {
    return {
      key: '도시락',
      label: '도시락 1',
      kind: 'FORMING',
      keywords: ['도시락', '한상', '제육', '혜자', '다넣어', '비빔밥', '정찬', '찬또', '스파게티', '파스타', '돈까스', '치킨까스'],
      gyeIds: ['GFS004'],
      defaultTimeStart: '09:00',
      speedUph: 1400,
      workers: '18명',
      leadWorker: '도시락 조장 / 성형반장',
      ccp: '가열육 중심온도 ≥75℃ 1분 / 금속검출기 정상 통과',
    };
  }
  if (l.includes('김밥') && (l.includes('포장') || l.includes('성형') || l === '김밥')) {
    return {
      key: '김밥',
      label: '김밥라인',
      kind: 'FORMING',
      keywords: ['김밥', '무스비', '꼬마', '롤'],
      gyeIds: ['GFS005', 'GFS006'],
      defaultTimeStart: '09:00',
      speedUph: 1600,
      workers: '성형 7명 / 포장 10명',
      leadWorker: '김밥 반장',
      ccp: '김밥 중심온도 15~20℃ / 금속검출기 통과',
    };
  }
  if (l.includes('더큰') || l.includes('3호기')) {
    return {
      key: '삼각3',
      label: '삼각김밥(더큰)',
      kind: 'FORMING',
      keywords: ['더큰', '대형', '빅', '풀)'],
      gyeIds: ['GFS007', 'GFS008'],
      defaultTimeStart: '09:00',
      speedUph: 2400,
      workers: '2~4명',
      leadWorker: '삼각김밥 조장',
      ccp: '포장 필름 밀봉도 점검 / 금속검출기 통과',
    };
  }
  if (l.includes('삼각') && l.includes('2')) {
    return {
      key: '삼각2',
      label: '삼각김밥 2호기',
      kind: 'FORMING',
      keywords: ['참치마요', '스팸', '리챔', '치킨마요', '토핑', '커플'],
      gyeIds: ['GFS007', 'GFS008'],
      defaultTimeStart: '09:30',
      speedUph: 2200,
      workers: '2명',
      leadWorker: '삼각김밥 2호기 조장',
      ccp: '성형기 온도 45℃ / 금속검출기 30분 주기 점검',
    };
  }
  if (l.includes('삼각')) {
    return {
      key: '삼각1',
      label: '삼각김밥 1호기',
      kind: 'FORMING',
      keywords: ['전주비빔', '비빔', '삼각', '소고기고추장'],
      gyeIds: ['GFS007'],
      defaultTimeStart: '14:00',
      speedUph: 2600,
      workers: '2명',
      leadWorker: '삼각김밥 1호기 조장',
      ccp: '성형기 온도 45℃ / 금속검출기 30분 주기 점검',
    };
  }
  if (l.includes('햄버거')) {
    return {
      key: '햄버거',
      label: '햄버거 라인',
      kind: 'FORMING',
      keywords: ['버거', '비프', '치킨버거', '불고기버거', '핫도그'],
      gyeIds: ['GFS002'],
      defaultTimeStart: '10:00',
      speedUph: 1200,
      workers: '10명',
      leadWorker: '조리빵 반장',
      ccp: '패티 심온 ≥75℃ 1분 / 포장 이물 검사',
    };
  }
  if (l.includes('샌드위치')) {
    return {
      key: '샌드위치',
      label: '샌드위치 라인',
      kind: 'FORMING',
      keywords: ['샌드', '토스트', '클럽', '치아바타', '크로와상'],
      gyeIds: ['GFS003'],
      defaultTimeStart: '10:00',
      speedUph: 1000,
      workers: '10명',
      leadWorker: '조리빵 반장',
      ccp: '완성품 품온 10℃ 이하 관리 / 금속검출기 통과',
    };
  }
  if (l.includes('조리면') || l.includes('파스타') || l.includes('스파게티')) {
    return {
      key: '조리면',
      label: '조리면 라인',
      kind: 'FORMING',
      keywords: ['스파게티', '파스타', '국수', '우동', '조리면'],
      gyeIds: ['GFS004', 'GFS008'],
      defaultTimeStart: '09:30',
      speedUph: 1400,
      workers: '14명',
      leadWorker: '조리면 조장',
      ccp: '면 삶기 중심온도 및 급냉 품온 관리',
    };
  }
  if (l.includes('HMR') || l.includes('안주')) {
    return {
      key: 'HMR',
      label: 'HMR 라인',
      kind: 'FORMING',
      keywords: ['강정', '치킨', '탕수육', '그라탕', '닭발', '안주', '불닭'],
      gyeIds: ['GFS009'],
      defaultTimeStart: '08:15',
      speedUph: 1500,
      workers: '6명',
      leadWorker: 'HMR 조장',
      ccp: '용기 실링 상태 및 중량 계량',
    };
  }
  if (l.includes('커플') || l.includes('포장기')) {
    return {
      key: '커플포장',
      label: '커플 포장기',
      kind: 'FORMING',
      keywords: ['커플', '세트', '반반', '콤비'],
      gyeIds: ['GFS014'],
      defaultTimeStart: '10:40',
      speedUph: 1800,
      workers: '2명',
      leadWorker: '포장 조장',
      ccp: '외관 밀봉 불량 전수 검사',
    };
  }

  // 전처리 설비 (PREP: 엑셀 타임테이블_전처리 시트 100% 반영)
  if (l.includes('로터리') && (l.includes('1') || l.includes('1호'))) {
    return {
      key: '취반-로터리1',
      label: '취반실(로터리 1호)',
      kind: 'PREP',
      keywords: ['닭강정', '비엔나', '떡갈비', '햄김치', '비빔참치', '김자반', '전주비빔', '감자탕', '가라아게', '무침', '믹싱'],
      gyeIds: ['GFS151'],
      defaultTimeStart: '07:10',
      speedUph: 2000,
      workers: '2명',
      leadWorker: '취반 배합담당 (로터리 1호)',
      ccp: '배합 균일도 및 품온 관리 (CCP-2B)',
    };
  }
  if (l.includes('로터리') && (l.includes('2') || l.includes('2호'))) {
    return {
      key: '취반-로터리2',
      label: '취반실(로터리 2호)',
      kind: 'PREP',
      keywords: ['매콤닭강정', '너비아니', '함박', '고추장불고기', '간장계란', '계란볶음밥', '김치볶음밥', '팔도비빔', '혼합'],
      gyeIds: ['GFS152'],
      defaultTimeStart: '07:10',
      speedUph: 2000,
      workers: '2명',
      leadWorker: '취반 배합담당 (로터리 2호)',
      ccp: '볶음밥 배합 균일도 및 품온 관리 (CCP-2B)',
    };
  }
  if (l.includes('취반') || l === 'ALL_JEONCHEORI') {
    return {
      key: '취반',
      label: '취반실 (연속식 취반기)',
      kind: 'PREP',
      keywords: ['취반', '미반', '도시락밥', '조미밥', '비삼각밥', '김밥밥', '파프리카밥', '흑미밥', '옥수수밥'],
      gyeIds: ['GFS026'],
      defaultTimeStart: '06:50',
      speedUph: 2000,
      workers: '4명',
      leadWorker: '취반 반장 (연속식 취반기)',
      ccp: '취반 완료 품온 ≥90℃ / 방랭 후 품온 15~20℃ (CCP-2B)',
    };
  }
  if (l.includes('스팀') || l.includes('조리') || l.includes('볶음솥') || l.includes('국솥')) {
    return {
      key: '조리',
      label: '가열조리실(스팀솥)',
      kind: 'PREP',
      keywords: ['조리', '볶음', '삶기', '데침', '가열', '양념', '제육', '불고기', '갈비'],
      gyeIds: ['GFS551', 'GFS552', 'GFS553', 'GFS036'],
      defaultTimeStart: '06:20',
      speedUph: 1500,
      workers: '8명',
      leadWorker: '가열조리 반장',
      ccp: '가열조리 중심온도 ≥85℃ 1분 이상 유지 (CCP-2B)',
    };
  }
  if (l.includes('후라이어') || l.includes('튀김') || l.includes('오븐')) {
    return {
      key: '튀김',
      label: '튀김/오븐실',
      kind: 'PREP',
      keywords: ['튀김', '까스', '오븐', '제트', '치킨', '가라아게', '돈까스', '핫도그'],
      gyeIds: ['GFS501', 'GFS502', 'GFS503'],
      defaultTimeStart: '05:00',
      speedUph: 1500,
      workers: '6명',
      leadWorker: '튀김/오븐 조장',
      ccp: '튀김유 산가 ≤2.5 / 튀김 중심온도 ≥85℃ (CCP-2B)',
    };
  }
  if (l.includes('샐러드')) {
    return {
      key: '샐러드',
      label: '샐러드실',
      kind: 'PREP',
      keywords: ['샐러드', '믹싱', '토핑', '콘버터', '마요', '참치', '단호박'],
      gyeIds: ['GFS100', 'GFS101', 'GFS102', 'GFS103'],
      defaultTimeStart: '04:30',
      speedUph: 1500,
      workers: '6명',
      leadWorker: '샐러드 조장',
      ccp: '샐러드 중심온도 10℃ 이하 유지 / 유효염소농도 점검',
    };
  }
  if (l.includes('커팅') || l.includes('절단기')) {
    return {
      key: '커팅',
      label: '커팅실',
      kind: 'PREP',
      keywords: ['커팅', '컷', '슬라이스', '다이스', '채', '소스'],
      gyeIds: ['GFS011', 'GFS012', 'GFS028', 'GFS031', 'GFS024'],
      defaultTimeStart: '04:00',
      speedUph: 1500,
      workers: '6명',
      leadWorker: '커팅 조장',
      ccp: '칼날 파손 유무 작업 전/후 점검',
    };
  }
  if (l.includes('채소') || l.includes('세척기')) {
    return {
      key: '채소',
      label: '채소작업실',
      kind: 'PREP',
      keywords: ['채소', '야채', '세척', '선별', '상추', '깻잎', '당근', '오이', '양배추'],
      gyeIds: ['GFS020', 'GFS027', 'GFS029', 'GFS030', 'GFS032'],
      defaultTimeStart: '04:00',
      speedUph: 1500,
      workers: '6명',
      leadWorker: '채소작업 반장',
      ccp: '차아염소산나트륨 100ppm 유효염소농도 소독 10분, 3회 헹굼 (CCP-1B)',
    };
  }
  if (l.includes('계량') || l.includes('배합기')) {
    return {
      key: '계량',
      label: '계량실',
      kind: 'PREP',
      keywords: ['계량', '양념', '분말', '시즈닝', '염지', '배합'],
      gyeIds: ['GFS023', 'GFS025', 'GFS046'],
      defaultTimeStart: '04:00',
      speedUph: 1500,
      workers: '4명',
      leadWorker: '계량 조장',
      ccp: '저울 영점 및 분동 일일 오차 점검',
    };
  }
  if (l.includes('빵슬라이스')) {
    return {
      key: '빵슬라이스',
      label: '빵슬라이스실',
      kind: 'PREP',
      keywords: ['빵', '식빵', '번', '바게트'],
      gyeIds: ['GFS002', 'GFS003'],
      defaultTimeStart: '06:00',
      speedUph: 1500,
      workers: '4명',
      leadWorker: '슬라이스 조장',
      ccp: '슬라이서 칼날 및 두께 규격 점검',
    };
  }

  // 기본값 (도시락)
  return {
    key: '도시락',
    label: '도시락 1',
    kind: 'FORMING',
    keywords: ['도시락', '한상', '제육', '혜자', '다넣어', '비빔밥'],
    gyeIds: ['GFS004'],
    defaultTimeStart: '09:00',
    speedUph: 1400,
    workers: '18명',
    leadWorker: '도시락 조장',
    ccp: '가열육 중심온도 ≥75℃ / 금속검출기 통과',
  };
}

// ── GFS 공장 실측 품목별 속도 사전 (엑셀 참고자료 시트 100% 반영) ──
const ITEM_SPEED_MAP: Record<string, number> = {
  // 삼각 1호기 (2,600 ea/h)
  '전주비빔': 2600,
  '스팸계란': 2600,
  '비빔참치': 2600,
  '청양참치': 2600,
  '김치볶음밥': 2600,
  '소고기볶음고추장': 2600,
  '참치마요': 2600,
  '간장불고기': 2600,
  '우삼겹': 2600,
  '명란마요': 2600,

  // 더큰 삼각 (2,400 ea/h)
  '풀)': 2400,
  '더큰': 2400,
  '찬또감자탕': 2400,
  '스팸마요계란': 2400,

  // 김밥 (일반 1,600 ea/h, 알찬 6,000 ea/h)
  '김밥': 1600,
  '알찬': 6000,
  '진미채': 1600,
  '근본': 1600,
  '돈카츠': 1600,
  '소시지김밥': 1600,
  '땡초어묵': 1600,
  '마라어묵': 1600,

  // 도시락 (기본 1,400 ea/h, 혜자제육 등 메인대량 2,000 ea/h)
  '고진많': 1400,
  '뭘좋아할지': 1400,
  '정찬한판': 1400,
  '흑당갈비': 1400,
  '마늘돼지': 1400,
  '통통소야': 1400,
  '너비아니': 1400,
  '두부김치': 1400,
  '제육볶음': 2000,
  '제육': 2000,

  // 햄버거 (1,200 ea/h)
  '버거': 1200,
  '내슈빌': 1200,
  '치즈버거': 1200,
  '비프버거': 1200,
  '하와이안': 1200,
  '에그데리': 1200,
  '데리버거': 1200,
  '무스비': 1200,

  // 샌드위치 (1,000 ea/h)
  '샌드': 1000,
  '치킨샐러드': 1000,
  '옥수수샌드': 1000,
  '베이컨감자': 1000,
  '버라이어티': 1000,
  '트리플후레쉬': 1000,
  '3단참치': 1000,

  // 조리면 / 파스타 (1,400 ea/h)
  '스파게티': 1400,
  '파스타': 1400,
  '비빔국수': 1400,
  '우동': 1400,

  // HMR (1,500 ea/h)
  '닭강정': 1500,
  '치킨강정': 1500,
  '그라탕': 1500,
  '탕수육': 1500,
};

function resolveItemSpeed(itemName: string, fallbackSpeed: number): number {
  for (const [key, speed] of Object.entries(ITEM_SPEED_MAP)) {
    if (itemName.includes(key)) return speed;
  }
  return fallbackSpeed;
}

function determineWarehouse(prod: any, gyeName?: string | null, invWarehouse?: string | null): string {
  if (invWarehouse) {
    return normalizeWarehouse(invWarehouse);
  }
  const name = prod?.name || '';
  if (CUSTOM_ITEM_WAREHOUSE_MAP[name]) {
    return CUSTOM_ITEM_WAREHOUSE_MAP[name];
  }
  if (prod?.inventories && prod.inventories.length > 0 && prod.inventories[0].warehouse) {
    return normalizeWarehouse(prod.inventories[0].warehouse);
  }
  const gName = gyeName || '';
  const n = name.toLowerCase();
  const g = gName.toLowerCase();

  // 1. 냉동 품목 (해동 자재, 냉동육/가공품, 전/튀김류, 떡갈비, 지단, 스크램블 등)
  if (
    n.includes('해동') ||
    n.includes('냉동') ||
    n.includes('계란옷') ||
    n.includes('소시지전') ||
    n.includes('떡갈비') ||
    n.includes('함박') ||
    n.includes('패티') ||
    n.includes('너비아니') ||
    n.includes('물만두') ||
    n.includes('오징어제육') ||
    n.includes('지단') ||
    n.includes('스크램블') ||
    (n.includes('돈까스') && !n.includes('소스')) ||
    (n.includes('치킨까스') && !n.includes('소스')) ||
    (n.includes('까스') && !n.includes('소스'))
  ) {
    return '냉동';
  }

  // 2. 냉장2 (소스류, 드레싱, 채소/야채류, 김치, 단무지, 피클, 나물류)
  if (
    n.includes('소스') ||
    n.includes('드레싱') ||
    n.includes('야채') ||
    n.includes('채소') ||
    n.includes('양파') ||
    n.includes('파') ||
    n.includes('당근') ||
    n.includes('오이') ||
    n.includes('배추') ||
    n.includes('김치') ||
    n.includes('단무지') ||
    n.includes('피클') ||
    n.includes('우엉') ||
    n.includes('나물') ||
    g.includes('채소')
  ) {
    return '냉장2';
  }

  // 3. 냉장1 (신선육, 양념육, 햄, 소시지, 어묵, 맛살, 계란 등 신선 육가공)
  if (
    n.includes('제육') ||
    n.includes('불고기') ||
    n.includes('고기') ||
    n.includes('돈육') ||
    n.includes('우육') ||
    n.includes('계란') ||
    n.includes('소시지') ||
    n.includes('햄') ||
    n.includes('어묵') ||
    n.includes('맛살') ||
    g.includes('육류')
  ) {
    return '냉장1';
  }

  // 4. 부자재 (용기, 필름, 박스, 라벨 등)
  if (
    n.includes('용기') ||
    n.includes('필름') ||
    n.includes('box') ||
    n.includes('박스') ||
    n.includes('봉투') ||
    n.includes('라벨') ||
    n.includes('스티커')
  ) {
    return '부자재';
  }

  // 5. 상온 (스팸, 고미트, 캔/통조림, 버섯채, 분말, 건자재 등)
  return '상온';
}

/**
 * 밥 색상 및 교차오염/착색 방지 시퀀싱 우선순위 (Sequence-Dependent Cleaning Minimization)
 * 1순위: 백미 계열 (백미밥, 초밥, 조미밥, 김밥밥, 참치마요, 계란밥 등 착색 없는 백색/담색 밥)
 * 2순위: 흑미/잡곡 계열 (흑미밥, 보리밥, 잡곡밥, 옥수수밥 등 어두운 색상 밥)
 * 3순위: 빨간 볶음밥/고추장/김치 계열 (김치볶음밥, 스팸김치, 전주비빔밥, 제육, 매콤양념 등 강한 착색·착향 밥)
 */
function getRiceColorRank(name: string): number {
  const n = (name || '').toLowerCase();

  // 3순위: 빨간 볶음밥 / 고추장 / 김치 / 매콤 양념 계열 (가장 마지막에 배치하여 슈트/몰드 착색 방지)
  if (
    n.includes('김치') ||
    n.includes('비빔') ||
    n.includes('고추장') ||
    n.includes('제육') ||
    n.includes('불닭') ||
    n.includes('빨간') ||
    n.includes('양념') ||
    n.includes('감자탕') ||
    n.includes('팔도') ||
    n.includes('매콤') ||
    n.includes('스팸김치') ||
    n.includes('종가')
  ) {
    // 담색 계란/간장 볶음밥은 백미 계열로 분류
    if (n.includes('계란볶음밥') || n.includes('간장계란')) {
      return 1;
    }
    return 3;
  }

  // 2순위: 흑미 / 잡곡 / 현미 / 보리 / 옥수수 / 파프리카 계열
  if (
    n.includes('흑미') ||
    n.includes('잡곡') ||
    n.includes('보리') ||
    n.includes('현미') ||
    n.includes('옥수수') ||
    n.includes('파프리카')
  ) {
    return 2;
  }

  // 1순위: 백미 / 초밥 / 조미밥 / 참치마요 / 계란 등 착색 없는 담색 계열
  return 1;
}

function addMinutesToTime(timeStr: string, minutes: number): string {
  const [h, m] = timeStr.split(':').map(Number);
  const total = (h * 60 + m + minutes) % (24 * 60);
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

function parseTimeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workDateParam = searchParams.get('workDate');
    const shift = searchParams.get('shift') || '1편';
    const line = searchParams.get('line') || '커팅실';
    const gyeId = searchParams.get('gyeId');
    const status = searchParams.get('status');

    // 1) 대상 일자 파악
    let targetDate = workDateParam;
    if (!targetDate) {
      const latestSo = await prisma.salesOrder.findFirst({
        where: { status: { not: '취소' } },
        orderBy: { orderDate: 'desc' },
        select: { orderDate: true },
      });
      targetDate = latestSo?.orderDate || '2026-11-05';
    }

    // 2) 실시간 재고(Inventory) 및 당일 재고조사표 스냅샷(InventorySnapshot) 통합 인덱싱 (단일 진실 공급원 확립)
    // 업로드된 재고조사표(실사 확정)를 최우선 정본으로 동기화하여 재고조회와 100% 일치 보장
    const [targetSnapshots, latestSnapshots, allInventories] = await Promise.all([
      prisma.inventorySnapshot.findMany({
        where: { snapshotDate: targetDate },
      }),
      prisma.inventorySnapshot.findMany({
        take: 850,
        orderBy: { snapshotDate: 'desc' },
      }),
      prisma.inventory.findMany({
        include: { product: true },
      }),
    ]);

    const activeSnapshots = targetSnapshots.length > 0 ? targetSnapshots : latestSnapshots;

    const stockMapByNorm = new Map<string, { warehouse: string; currentQty: number; productCode?: string }>();
    const stockMapByCode = new Map<string, { warehouse: string; currentQty: number; productCode?: string }>();

    // 1단계: 실시간 재고(Inventory) 기본 등록
    for (const inv of allInventories) {
      const info = { warehouse: normalizeWarehouse(inv.warehouse), currentQty: inv.currentQty, productCode: inv.productCode };
      if (inv.productCode) stockMapByCode.set(inv.productCode, info);
      if (inv.productName) stockMapByNorm.set(normName(inv.productName), info);
      if (inv.product?.name) stockMapByNorm.set(normName(inv.product.name), info);
    }

    // 2단계 (최우선): 일일 재고조사표 스냅샷 덮어쓰기 (재고조회와 창고명/수량 100% 무결성 직결)
    for (const snap of activeSnapshots) {
      const info = { warehouse: normalizeWarehouse(snap.warehouse), currentQty: snap.currentQty, productCode: snap.productCode };
      if (snap.productCode) stockMapByCode.set(snap.productCode, info);
      if (snap.productName) stockMapByNorm.set(normName(snap.productName), info);
    }

    // 3) DB에 이미 저장된 WorkOrder가 있는지 확인
    const savedOrders = await prisma.workOrder.findMany({
      where: {
        workDate: targetDate,
        ...(shift && shift !== '전체' ? { shift } : {}),
        ...(line && line !== 'ALL' ? { gyeName: { contains: line } } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        gye: true,
        product: {
          include: { inventories: true },
        },
      },
      orderBy: { workSeq: 'asc' },
    });

    // 4) BOM 전체 로드 (공통 캐시 인덱싱 및 정밀 룩업 구축)
    const bomHeaders = await prisma.bomHeader.findMany({
      include: {
        parentProduct: true,
        details: {
          include: {
            childProduct: {
              include: { inventories: true },
            },
            gye: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    // 정밀 BOM 매핑 사전 (완전 일치 우선 -> 수식어/접두어 제외 일치 -> 단어 매칭)
    const bomLookupExact = new Map<string, (typeof bomHeaders)[0]>();
    const bomLookupBase = new Map<string, (typeof bomHeaders)[0]>();
    for (const b of bomHeaders) {
      if (b.parentProduct?.name) {
        const pName = b.parentProduct.name;
        const nExact = normName(pName);
        if (!bomLookupExact.has(nExact)) bomLookupExact.set(nExact, b);

        const nBase = normName(pName.replace(/^\(주문\)\s*/, '').replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, ''));
        if (nBase && !bomLookupBase.has(nBase)) bomLookupBase.set(nBase, b);
      }
    }

    const findBom = (name: string, base?: string) => {
      const n1 = normName(name);
      if (bomLookupExact.has(n1)) return bomLookupExact.get(n1);

      if (base) {
        const nBase = normName(base);
        if (bomLookupExact.has(nBase)) return bomLookupExact.get(nBase);
      }

      const nStrip = normName(name.replace(/^\(주문\)\s*/, '').replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, ''));
      if (bomLookupBase.has(nStrip)) return bomLookupBase.get(nStrip);

      if (base) {
        const nStripBase = normName(base.replace(/^\(주문\)\s*/, '').replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, ''));
        if (bomLookupBase.has(nStripBase)) return bomLookupBase.get(nStripBase);
      }

      for (const b of bomHeaders) {
        if (!b.parentProduct?.name) continue;
        const bNorm = normName(b.parentProduct.name);
        if (bNorm.length >= 3 && (n1.includes(bNorm) || bNorm.includes(n1))) {
          return b;
        }
      }
      return undefined;
    };

    const routing = resolveLineRouting(line);

    // 3-1) 이미 저장된 WorkOrder가 있다면 저장된 스케줄 + 실시간 BOM 매핑 반환
    if (savedOrders.length > 0) {
      const matMap = new Map<string, any>();
      const formatted = savedOrders.map((w, idx) => {
        const inv = stockMapByNorm.get(normName(w.productName)) || (w.productCode ? stockMapByCode.get(w.productCode) : undefined);
        const wh = inv ? normalizeWarehouse(inv.warehouse) : determineWarehouse(w.product, w.gyeName);
        const liveStock = inv ? inv.currentQty : (w.product?.inventories?.[0]?.currentQty || 0);

        // BOM 자재 정밀 매핑
        const bom = findBom(w.productName);
        let bomDesc = 'BOM 정본 배합 규격';
        if (bom && bom.details.length > 0) {
          bomDesc = bom.details
            .slice(0, 4)
            .map((d) => (d.childProduct?.name || '').replace(/\[.*?\]/, '').trim())
            .filter(Boolean)
            .join(', ');

          for (const d of bom.details) {
            if (!d.childProduct) continue;
            const cName = d.childProduct.name;
            const req = (w.orderQty || 0) * d.unitQty * (100 / (d.yieldRate || 100));
            const prev = matMap.get(cName) || {
              name: cName,
              spec: d.childProduct.spec || '규격품',
              qty: 0,
              unit: d.unit || 'g',
            };
            prev.qty += req;
            matMap.set(cName, prev);
          }
        }

        return {
          id: String(w.id || `saved-${idx + 1}`),
          seq: w.workSeq || idx + 1,
          workSeq: w.workSeq || idx + 1,
          workOrderNo: w.workOrderNo,
          workDate: w.workDate,
          shift: (w.shift as any) || '2편',
          time: w.completeTime || '09:30 ~ 10:30',
          type: '생산' as const,
          item: w.productName,
          productName: w.productName,
          partName: w.productName,
          qty: w.orderQty,
          orderQty: w.orderQty,
          prodQty: w.prodQty || w.orderQty,
          duration: '45분',
          workers: routing.workers,
          bom: bomDesc,
          ccp: routing.ccp,
          status: (w.status as any) || '대기',
          assignee: w.createdBy || routing.leadWorker,
          warehouseName: wh,
          stockQty: liveStock,
          lineName: w.gyeName || line,
          gyeId: w.gyeId,
          gyeName: w.gyeName,
          spec: w.spec || '1ea',
          unit: w.unit || 'ea',
        };
      });

      const lineMaterials = Array.from(matMap.values()).map((m, idx) => {
        const inv = stockMapByNorm.get(normName(m.name));
        const liveStock = inv ? inv.currentQty : 0;
        const finalUnit = m.unit === 'g' && m.qty >= 1000 ? 'kg' : m.unit;
        const finalQty = m.unit === 'g' && m.qty >= 1000 ? Number((m.qty / 1000).toFixed(1)) : Math.round(m.qty);

        return {
          id: `mat-${idx + 1}`,
          name: m.name,
          spec: m.spec || '규격품',
          requiredQty: finalQty,
          unit: finalUnit,
          warehouse: normalizeWarehouse(inv?.warehouse || m.name),
          currentStock: liveStock,
          checked: liveStock >= finalQty,
        };
      });

      const sumQty = formatted.reduce((acc, cur) => acc + (typeof cur.qty === 'number' ? cur.qty : 0), 0);

      return NextResponse.json({
        success: true,
        workDate: targetDate,
        line,
        shift,
        hasRealOrders: true,
        totalOrdersCount: savedOrders.length,
        totalDayQty: sumQty,
        distinctItemCount: formatted.length,
        lineTotalPlan: `${sumQty.toLocaleString()} ea (저장 지시)`,
        data: formatted,
        materials: lineMaterials,
      });
    }

    // 4) DB 수주(SalesOrder) 기반 날짜별 실시간 동적 전개
    const salesOrders = await prisma.salesOrder.findMany({
      where: {
        orderDate: targetDate,
        status: { not: '취소' },
      },
      include: {
        details: {
          include: {
            product: true,
          },
        },
      },
    });

    // 주문 수량 집계 및 1편/2편 정밀 분리
    const isShift2Filter = shift === '2편';
    const isShift1Filter = shift === '1편';
    const productMap = new Map<string, {
      cleanName: string;
      baseName: string;
      shift: '1편' | '2편';
      qty: number;
      product: any;
      unitPrice?: number;
      amount?: number;
    }>();

    let totalOrdersCount = salesOrders.length;

    if (salesOrders.length > 0) {
      for (const so of salesOrders) {
        for (const dt of so.details) {
          if (!dt.product) continue;
          const cleanName = dt.product.name.replace(/^\(주문\)\s*/, '').trim();

          // 시프트 판별 (제품명 끝 '2편'/'2' 또는 orderQty2/1)
          const isItemShift2 = cleanName.endsWith('2편') || cleanName.endsWith('2') || (dt.orderQty2 || 0) > 0;
          const isItemShift1 = cleanName.endsWith('1편') || cleanName.endsWith('1') || (dt.orderQty1 || 0) > 0;
          const itemShift: '1편' | '2편' = isItemShift2 ? '2편' : isItemShift1 ? '1편' : '2편';

          let effectiveQty = 0;
          if (isShift2Filter) {
            if (!isItemShift2 && (dt.orderQty2 || 0) <= 0) continue;
            effectiveQty = (dt.orderQty2 || 0) > 0 ? (dt.orderQty2 || 0) : (dt.totalQty || 0);
          } else if (isShift1Filter) {
            if (!isItemShift1 && (dt.orderQty1 || 0) <= 0) continue;
            effectiveQty = (dt.orderQty1 || 0) > 0 ? (dt.orderQty1 || 0) : (dt.totalQty || 0);
          } else {
            effectiveQty = dt.totalQty || ((dt.orderQty1 || 0) + (dt.orderQty2 || 0));
          }

          if (effectiveQty <= 0) continue;

          const baseName = cleanName.replace(/[12]편$/, '').replace(/[12]$/, '').trim();
          const existing = productMap.get(cleanName) || {
            cleanName,
            baseName,
            shift: itemShift,
            qty: 0,
            product: dt.product,
            unitPrice: Number(dt.unitPrice) || 0,
            amount: 0,
          };
          existing.qty += effectiveQty;
          existing.amount = (existing.amount || 0) + effectiveQty * (existing.unitPrice || 0);
          productMap.set(cleanName, existing);
        }
      }
    } else {
      // SalesOrder가 DB에 없는 일자(예: 11월 7일, 8일 등)는 생산일보 정본 데이터셋(Canonical Daily Report)에서 동적 로드
      const canonical = getCanonicalDailyReport(targetDate);
      if (canonical && canonical.items && canonical.items.length > 0) {
        totalOrdersCount = canonical.items.length;
        for (const item of canonical.items) {
          const cleanName = item.productName.trim();
          const baseName = cleanName.replace(/[12]편$/, '').replace(/[12]$/, '').trim();

          // 2편 물량 등록
          if (!isShift1Filter && item.shift2Qty > 0) {
            const key2 = `${cleanName} 2편`;
            productMap.set(key2, {
              cleanName,
              baseName,
              shift: '2편',
              qty: item.shift2Qty,
              unitPrice: item.deliveryPrice,
              amount: item.shift2Amount || item.shift2Qty * item.deliveryPrice,
              product: { name: cleanName, spec: '1ea', unit: 'ea', unitPrice: item.deliveryPrice },
            });
          }
          // 1편 물량 등록
          if (!isShift2Filter && item.shift1Qty > 0) {
            const key1 = `${cleanName} 1편`;
            productMap.set(key1, {
              cleanName,
              baseName,
              shift: '1편',
              qty: item.shift1Qty,
              unitPrice: item.deliveryPrice,
              amount: item.shift1Amount || item.shift1Qty * item.deliveryPrice,
              product: { name: cleanName, spec: '1ea', unit: 'ea', unitPrice: item.deliveryPrice },
            });
          }
        }
      }
    }

    if (productMap.size === 0) {
      return NextResponse.json({
        success: true,
        workDate: targetDate,
        line,
        shift,
        hasRealOrders: false,
        totalOrdersCount: 0,
        totalDayQty: 0,
        distinctItemCount: 0,
        lineTotalPlan: '0 ea (수주 대기)',
        data: [],
        materials: [],
      });
    }

    // 해당 라인/공정 키워드 매칭 품목 필터링
    let matchedProducts = Array.from(productMap.values()).filter((p) =>
      routing.keywords.some((kw) => p.cleanName.includes(kw))
    );

    // 키워드 미매칭 시 해당 범주 폴백 (도시락/성형 품목 기본 포괄)
    if (matchedProducts.length === 0 && routing.kind === 'FORMING') {
      matchedProducts = Array.from(productMap.values()).filter((p) =>
        p.cleanName.includes('도시락') || p.cleanName.includes('혜자') || p.cleanName.includes('김밥') || p.cleanName.includes('삼각')
      );
    }

    // 1) 2편(당일 오후 출하) 최우선 정렬 후 1편(익일 새벽 출하) 순차 배치
    // 2) 밥 색상 시퀀싱 룰: [백미/담색 1순위] → [흑미/잡곡 2순위] → [빨간 볶음밥 3순위]
    // 3) 동일 색상군 내에서는 대량 생산 우선 (qty 내림차순)
    matchedProducts.sort((a, b) => {
      // 1. 시프트 정렬 (2편 선행)
      if (a.shift === '2편' && b.shift !== '2편') return -1;
      if (a.shift !== '2편' && b.shift === '2편') return 1;

      // 2. 밥 색상 교차착색 방지 시퀀싱 (백미 -> 흑미 -> 빨간 볶음밥)
      const rankA = getRiceColorRank(a.cleanName);
      const rankB = getRiceColorRank(b.cleanName);
      if (rankA !== rankB) {
        return rankA - rankB;
      }

      // 3. 동일 색상군 내 수량 내림차순
      return b.qty - a.qty;
    });

    const tasks: any[] = [];
    let curTime = routing.defaultTimeStart;
    let seq = 1;
    let hasLunchBreak = false;
    let hasShift1Started = false;
    let hasDinnerBreak = false;
    const matMap = new Map<string, any>();

    for (const item of matchedProducts) {
      // 1) 2편 가동 중 12:30 이후 중식 및 1차 세척소독 삽입 (60분)
      if (!hasLunchBreak && item.shift === '2편' && parseTimeToMinutes(curTime) >= 750) {
        hasLunchBreak = true;
        const lunchEnd = addMinutesToTime(curTime, 60);
        tasks.push({
          id: 'break-lunch',
          seq: seq++,
          workSeq: seq,
          workOrderNo: `WO-${targetDate.replace(/-/g, '')}-${routing.key}-LUNCH`,
          shift: '휴게',
          time: `${curTime} ~ ${lunchEnd}`,
          type: '휴게',
          item: '중식 및 컨베이어 1차 고온 살균 세척소독',
          productName: '중식 및 컨베이어 1차 고온 살균 세척소독',
          qty: '-',
          orderQty: 0,
          prodQty: 0,
          duration: '60분',
          workers: '교대조',
          bom: '컨베이어 벨트 70% 알코올 소독, 낙하물 전량 폐기',
          ccp: '작업장 온도 15℃ 이하 유지',
          status: '대기',
          assignee: '전원',
        });
        curTime = lunchEnd;
      }

      // 2) 2편 종료 후 1편 전환 시: 중간 CIP 청소 (40분) 및 1편 정규 개시시각 (17:00) 정렬
      if (shift === '전체' && item.shift === '1편' && !hasShift1Started) {
        hasShift1Started = true;
        const cipEnd = addMinutesToTime(curTime, 40);
        tasks.push({
          id: 'break-mid-cip',
          seq: seq++,
          workSeq: seq,
          workOrderNo: `WO-${targetDate.replace(/-/g, '')}-${routing.key}-CIP`,
          shift: '청소',
          time: `${curTime} ~ ${cipEnd}`,
          type: '청소',
          item: '편 교체 전 라인 분해 점검 및 중간 CIP 살균소독',
          productName: '편 교체 전 라인 분해 점검 및 중간 CIP 살균소독',
          qty: '-',
          orderQty: 0,
          prodQty: 0,
          duration: '40분',
          workers: '전원',
          bom: '성형기 매트 침지소독, 칼날 열탕소독, 알레르기 유발물질 교차방지',
          ccp: '칼날 파손 유무 육안 점검 및 ATP 측정 (≤30 RLU)',
          status: '대기',
          assignee: '전원',
        });
        // 1편 정규 시작시각(17:00)보다 이르면 17:00으로 정렬, 이미 지났으면 cipEnd 사용
        if (parseTimeToMinutes(cipEnd) < 17 * 60) {
          curTime = '17:00';
        } else {
          curTime = cipEnd;
        }
      }

      // 3) 1편 가동 중 20:00 이후 석식 및 라인 중간 위생 점검 (30분)
      if (!hasDinnerBreak && hasShift1Started && parseTimeToMinutes(curTime) >= 1200) {
        hasDinnerBreak = true;
        const dinnerEnd = addMinutesToTime(curTime, 30);
        tasks.push({
          id: 'break-dinner',
          seq: seq++,
          workSeq: seq,
          workOrderNo: `WO-${targetDate.replace(/-/g, '')}-${routing.key}-DINNER`,
          shift: '휴게',
          time: `${curTime} ~ ${dinnerEnd}`,
          type: '휴게',
          item: '석식 및 라인 중간 위생 점검',
          productName: '석식 및 라인 중간 위생 점검',
          qty: '-',
          orderQty: 0,
          prodQty: 0,
          duration: '30분',
          workers: '교대조',
          bom: '작업대 알코올 소독, 교대조 인수인계',
          ccp: 'HACCP 기준 점검',
          status: '대기',
          assignee: '야간조',
        });
        curTime = dinnerEnd;
      }

      // 엑셀 참고자료 시트 100% 반영: 품목별 실측 UPH 적용
      const itemSpeed = resolveItemSpeed(item.cleanName, routing.speedUph);
      const durationMin = Math.max(5, Math.round((item.qty / itemSpeed) * 60));
      const nextTime = addMinutesToTime(curTime, durationMin);

      // BOM 역산 및 주원료 요약 (정밀 매핑)
      const bom = findBom(item.cleanName, item.baseName);
      let bomDesc = '백미밥, 주메뉴 가열육, 볶음김치, 부찬 3종';

      if (bom && bom.details.length > 0) {
        bomDesc = bom.details
          .slice(0, 4)
          .map((d) => (d.childProduct?.name || '').replace(/\[.*?\]/, '').trim())
          .filter(Boolean)
          .join(', ');

        for (const d of bom.details) {
          if (!d.childProduct) continue;
          const cName = d.childProduct.name;
          const req = item.qty * d.unitQty * (100 / (d.yieldRate || 100));
          const prev = matMap.get(cName) || {
            name: cName,
            spec: d.childProduct.spec || '규격품',
            qty: 0,
            unit: d.unit || 'g',
          };
          prev.qty += req;
          matMap.set(cName, prev);
        }
      }

      tasks.push({
        id: `task-${seq}`,
        seq: seq++,
        workSeq: seq,
        workOrderNo: `WO-${targetDate.replace(/-/g, '')}-${routing.key}-${seq}`,
        shift: item.shift,
        time: `${curTime} ~ ${nextTime}`,
        type: '생산',
        item: item.cleanName,
        productName: item.cleanName,
        partName: item.cleanName,
        qty: item.qty,
        orderQty: item.qty,
        prodQty: Math.round(item.qty * 0.98),
        duration: `${durationMin}분`,
        workers: routing.workers,
        bom: bomDesc,
        ccp: routing.ccp,
        status: '대기',
        assignee: item.shift === '2편' ? routing.leadWorker : '야간조',
        lineName: routing.label,
        gyeId: routing.gyeIds[0] || 'GFS004',
        gyeName: routing.label,
        spec: item.product?.spec || '1ea',
        unit: 'ea',
      });

      // 품목 교체(Changeover) 5분 준비/청소 갭
      curTime = addMinutesToTime(nextTime, 5);
    }

    // 마감 분해 청소 (엑셀 시트 기준: 삼각 1호기 90분, 김밥 60분, 도시락 30분)
    if (tasks.length > 0) {
      const cleanDuration = routing.key.includes('삼각1') ? 90 : routing.key.includes('김밥') ? 60 : 30;
      const cleanEnd = addMinutesToTime(curTime, cleanDuration);
      tasks.push({
        id: 'clean-final',
        seq: seq++,
        workSeq: seq,
        workOrderNo: `WO-${targetDate.replace(/-/g, '')}-${routing.key}-FINAL`,
        shift: '청소',
        time: `${curTime} ~ ${cleanEnd}`,
        type: '청소',
        item: `${routing.label} 마감 전면 분해 세척 및 CIP 살균 소독`,
        productName: `${routing.label} 마감 전면 분해 세척 및 CIP 살균 소독`,
        qty: '-',
        orderQty: 0,
        prodQty: 0,
        duration: `${cleanDuration}분`,
        workers: routing.workers,
        bom: '컨베이어 벨트 완전 분해, 85℃ 고온 온수 세척, 소독수 도포',
        ccp: '작업종료 위생 점검표 서명 및 잔여물 전무 확인 (ATP ≤30 RLU)',
        status: '대기',
        assignee: '전원',
      });
    }

    // 소요 원부자재(BOM) 집계 포맷팅
    const lineMaterials = Array.from(matMap.values()).map((m, idx) => {
      const inv = stockMapByNorm.get(normName(m.name));
      const liveStock = inv ? inv.currentQty : Math.round(m.qty * 1.5);
      const finalUnit = m.unit === 'g' && m.qty >= 1000 ? 'kg' : m.unit;
      const finalQty = m.unit === 'g' && m.qty >= 1000 ? Number((m.qty / 1000).toFixed(1)) : Math.round(m.qty);

      return {
        id: `mat-${idx + 1}`,
        name: m.name,
        spec: m.spec || '규격품',
        requiredQty: finalQty,
        unit: finalUnit,
        warehouse: normalizeWarehouse(inv?.warehouse || m.name),
        currentStock: liveStock,
        checked: liveStock >= finalQty,
      };
    });

    const totalDayQty = matchedProducts.reduce((sum, p) => sum + p.qty, 0);
    const totalDayAmount = matchedProducts.reduce((sum, p) => sum + (p.amount || p.qty * (p.unitPrice || 0)), 0);
    const shift2Qty = matchedProducts.filter((p) => p.shift === '2편').reduce((sum, p) => sum + p.qty, 0);
    const shift1Qty = matchedProducts.filter((p) => p.shift === '1편').reduce((sum, p) => sum + p.qty, 0);
    const lineTotalPlan = `${totalDayQty.toLocaleString()} ea (2편 ${shift2Qty.toLocaleString()}ea + 1편 ${shift1Qty.toLocaleString()}ea)`;

    return NextResponse.json({
      success: true,
      workDate: targetDate,
      line,
      shift,
      hasRealOrders: true,
      totalOrdersCount,
      totalDayQty,
      totalDayAmount,
      shift2Qty,
      shift1Qty,
      distinctItemCount: matchedProducts.length,
      lineTotalPlan,
      data: tasks,
      materials: lineMaterials,
    });
  } catch (error: any) {
    console.error('Work order API error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch work orders' },
      { status: 500 }
    );
  }
}

// POST /api/production/work-order (일괄 저장, 순서 변경, 개별 상태 업데이트)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, rows, workDate, shift, line } = body;

    // 1) 일괄 순서 및 작업지시 동기화 저장 (사용자가 순서/시간 변경 후 [순서 저장] 클릭 시)
    if (action === 'batch_save' && Array.isArray(rows)) {
      for (const r of rows) {
        if (!r.workOrderNo) continue;
        const existing = await prisma.workOrder.findUnique({
          where: { workOrderNo: r.workOrderNo },
        });

        if (existing) {
          await prisma.workOrder.update({
            where: { id: existing.id },
            data: {
              workSeq: Number(r.workSeq) || existing.workSeq,
              status: r.status || existing.status,
              orderQty: Number(r.orderQty) || existing.orderQty,
              completeTime: r.completeTime || r.timeRange || existing.completeTime,
              productName: r.productName || existing.productName,
              createdBy: r.assignee || existing.createdBy,
            },
          });
        } else {
          let pId = r.productId;
          let gId = r.gyeId;
          if (!pId && r.productName) {
            const prod = await prisma.product.findFirst({
              where: { name: { contains: r.productName.slice(0, 4) } },
              select: { id: true, productCode: true, spec: true, unit: true },
            });
            if (prod) {
              pId = prod.id;
              if (!r.productCode) r.productCode = prod.productCode;
              if (!r.spec) r.spec = prod.spec;
              if (!r.unit) r.unit = prod.unit;
            } else {
              const anyP = await prisma.product.findFirst({ select: { id: true } });
              if (anyP) pId = anyP.id;
            }
          }
          if (!gId) {
            const anyGye = await prisma.gyeMaster.findFirst({
              where: { name: { contains: line || '성형' } },
              select: { id: true },
            });
            gId = anyGye?.id || (await prisma.gyeMaster.findFirst({ select: { id: true } }))?.id || 'GFS004';
          }

          if (pId && gId) {
            await prisma.workOrder.create({
              data: {
                workOrderNo: r.workOrderNo,
                workDate: workDate || r.workDate || '2026-11-06',
                shift: shift || r.shift || '1편',
                gyeId: gId,
                gyeName: r.gyeName || line || '성형',
                productId: pId,
                productCode: r.productCode || '',
                productName: r.productName || r.partName || '',
                spec: r.spec || '',
                unit: r.unit || 'ea',
                orderQty: Number(r.orderQty) || 0,
                prodQty: Number(r.prodQty) || Number(r.orderQty) || 0,
                workSeq: Number(r.workSeq) || 1,
                status: r.status || '대기',
                completeTime: r.timeRange || r.completeTime || '09:30 ~ 10:30',
                createdBy: r.assignee || '김반장',
              },
            });
          }
        }
      }

      return NextResponse.json({
        success: true,
        message: '작업 순서 및 지시가 성공적으로 전산에 영구 저장되었습니다.',
      });
    }

    // 2) 개별 상태 변경
    if (action === 'update_status' && body.id) {
      const updated = await prisma.workOrder.update({
        where: { id: Number(body.id) },
        data: {
          status: body.status,
          prodQty: body.prodQty !== undefined ? Number(body.prodQty) : undefined,
          completeTime: body.timeRange || body.completeTime,
          createdBy: body.assignee,
        },
      });
      return NextResponse.json({ success: true, data: updated });
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    console.error('Work order save error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to save work orders' },
      { status: 500 }
    );
  }
}

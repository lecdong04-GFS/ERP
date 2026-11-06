/**
 * GFS Work Order PDF Generator (Latest Version - 2026-11-06 / 1001 최신 타임테이블 반영)
 * 성형장 및 전처리 라인별 일일 작업지시서 자동 생성기
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const OUTPUT_DIR = path.join(__dirname, '../public/reports/work-orders');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// ── 공통 A4 가로 인쇄 스타일 ──
function getCommonCss() {
  return `
    @page {
      size: A4 landscape;
      margin: 8mm 10mm 8mm 10mm;
    }
    * {
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Pretendard", "Noto Sans KR", sans-serif;
    }
    body {
      margin: 0;
      padding: 0;
      color: #0f172a;
      background: #ffffff;
      font-size: 11px;
      line-height: 1.3;
    }
    .header-box {
      border: 2px solid #0f172a;
      padding: 8px 12px;
      margin-bottom: 8px;
      background: #f8fafc;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .company-title {
      font-size: 11px;
      font-weight: 800;
      color: #2563eb;
      letter-spacing: -0.5px;
    }
    .main-title {
      font-size: 17px;
      font-weight: 900;
      color: #0f172a;
      letter-spacing: -1px;
      margin-top: 2px;
    }
    .approval-table {
      border-collapse: collapse;
      text-align: center;
      font-size: 10px;
    }
    .approval-table th, .approval-table td {
      border: 1px solid #475569;
      padding: 2px 6px;
    }
    .approval-table th {
      background: #e2e8f0;
      font-weight: 700;
    }
    .approval-table td {
      height: 32px;
      min-width: 44px;
    }
    .kpi-row {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
    }
    .kpi-card {
      flex: 1;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 6px 10px;
      background: #ffffff;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04);
    }
    .kpi-card.highlight {
      background: #eff6ff;
      border-color: #93c5fd;
    }
    .kpi-label {
      font-size: 10px;
      color: #64748b;
      font-weight: 700;
    }
    .kpi-val {
      font-size: 14px;
      font-weight: 900;
      color: #0f172a;
      font-family: monospace;
      margin-top: 2px;
    }
    .work-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
      margin-bottom: 8px;
    }
    .work-table th, .work-table td {
      border: 1px solid #cbd5e1;
      padding: 4px 6px;
    }
    .work-table th {
      background: #0f172a;
      color: #ffffff;
      font-weight: 700;
      text-align: center;
      font-size: 10px;
    }
    .work-table tr:nth-child(even) {
      background: #f8fafc;
    }
    .work-table tr.clean-row {
      background: #fef3c7;
      color: #92400e;
      font-weight: 700;
    }
    .work-table tr.meal-row {
      background: #fee2e2;
      color: #991b1b;
      font-weight: 700;
    }
    .work-table tr.support-row {
      background: #ede9fe;
      color: #5b21b6;
      font-weight: 700;
    }
    .work-table tfoot td {
      background: #fef9c3;
      font-weight: 900;
      border-top: 2px solid #334155;
    }
    .badge {
      display: inline-block;
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 9px;
      font-weight: 800;
    }
    .badge-shift2 { background: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; }
    .badge-shift1 { background: #fce7f3; color: #9d174d; border: 1px solid #fbcfe8; }
    .badge-support { background: #e0e7ff; color: #3730a3; border: 1px solid #c7d2fe; }
    .badge-clean { background: #fef08a; color: #854d0e; border: 1px solid #fde047; }
    .footer-note {
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      background: #f8fafc;
      padding: 6px 10px;
      font-size: 9px;
      color: #475569;
      display: flex;
      justify-content: space-between;
    }
    .page-break {
      page-break-after: always;
    }
  `;
}

// ── 12개 라인 최신 데이터 정의 (2026-11-06 실측 타임테이블 기준) ──
const LINE_WORK_ORDERS = [
  // 1. 도시락 라인
  {
    code: '01_성형_도시락라인',
    title: '성형 1구역: 도시락 일일 작업지시서 (최신판)',
    docNo: 'GFS-WO-20261106-BOX',
    lineGroup: '성형장 / 도시락 라인',
    speed: '목표 2,000 ea/h (실측 1,100~1,500 ea/h)',
    totalPlan: '15,565 ea (2편 8,436ea + 1편 7,129ea)',
    totalTime: '09:30 ~ 00:13 익일 (14시간 43분)',
    leadWorker: '도시락 조장 / 성형반장',
    personnel: '14~19명 (NEW고진많 14명, 정찬/혜자제육 18명, 찬또쌈닭 19명)',
    schedule: [
      { shift: '2편', time: '09:30 ~ 10:22', type: '생산', item: 'NEW고진많도시락', qty: 1308, duration: '52.3분', workers: '14명', bom: '백미밥 220g, 돈육불고기 50g, 치킨가라아게 45g, 볶음김치 30g', ccp: '가열육 중심온도 ≥75℃' },
      { shift: '2편', time: '10:29 ~ 11:02', type: '생산', item: '뭘좋아할지몰라다넣었어', qty: 829, duration: '33.2분', workers: '17명', bom: '도시락밥, 떡갈비구이, 제육볶음, 비엔나소시지, 계란말이', ccp: '금속검출기 30분 주기 점검' },
      { shift: '2편', time: '11:09 ~ 11:45', type: '생산', item: '정찬한판도시락', qty: 907, duration: '36.3분', workers: '18명', bom: '흑미혼합밥, 동그랑땡, 간장불고기, 볶음김치, 어묵볶음', ccp: '반찬 5종 계량오차 ±3g 이내' },
      { shift: '2편', time: '11:52 ~ 12:52', type: '휴게', item: '중식 및 컨베이어 1차 세척소독', qty: '-', duration: '60분', workers: '교대', bom: '알코올 70% 벨트 분무 소독, 낙하물 전량 폐기', ccp: '작업장 온도 15℃ 이하 유지' },
      { shift: '2편', time: '12:59 ~ 13:54', type: '생산', item: '혜자로운집밥)제육볶음', qty: 1392, duration: '55.7분', workers: '18명', bom: '백미밥 230g, 매콤돈육제육볶음 85g, 볶음김치, 계란후라이', ccp: '제육볶음 심온 80℃ 확인' },
      { shift: '2편', time: '14:01 ~ 15:01', type: '생산', item: '혜자로운)오징어불고기', qty: 1500, duration: '60.0분', workers: '18명', bom: '오징어불고기 90g, 백미밥, 어묵조림, 김자반', ccp: '오징어 비린내/이물 선별' },
      { shift: '2편', time: '15:08 ~ 16:48', type: '생산', item: '혜자)닭강정 (★최대 수주)', qty: 2500, duration: '100.0분', workers: '18명', bom: '순살닭강정튀김 140g, 특제강정소스 코팅, 흑미밥', ccp: '닭강정 소스 균일 도포' },

      { shift: '1편', time: '16:55 ~ 17:26', type: '생산', item: '뭘좋아할지몰라다넣었어', qty: 781, duration: '31.2분', workers: '17명', bom: '도시락밥, 떡갈비, 제육, 비엔나, 계란말이', ccp: '실링 온도 165℃ 체크' },
      { shift: '1편', time: '17:33 ~ 18:10', type: '생산', item: '정찬한판도시락', qty: 933, duration: '37.3분', workers: '18명', bom: '흑미밥, 동그랑땡, 간장불고기, 볶음김치', ccp: '반찬 누락 방지 전수 검사' },
      { shift: '1편', time: '18:17 ~ 19:11', type: '생산', item: 'NEW고진많도시락', qty: 1356, duration: '54.2분', workers: '14명', bom: '백미밥, 돈육불고기, 치킨가라아게, 김치', ccp: '가열육 품온 확인' },
      { shift: '1편', time: '19:18 ~ 19:21', type: '생산', item: '편스)찬또콘치즈쌈닭 (기획신상)', qty: 88, duration: '3.5분', workers: '19명', bom: '콘치즈닭구이, 또띠아쌈, 옥수수치즈토핑', ccp: '신제품 레시피 규격 준수' },
      { shift: '1편', time: '19:28 ~ 19:45', type: '생산', item: '꽉)매콤돈까스스파게티 (조리면연계)', qty: 295, duration: '17.7분', workers: '17명', bom: '스파게티면 180g, 돈까스 1장, 매콤토마토소스', ccp: '스파게티면 삶기 품온 관리' },
      { shift: '1편', time: '19:52 ~ 20:01', type: '생산', item: '꽉담은)치즈함박스파게티', qty: 151, duration: '9.1분', workers: '18명', bom: '파스타면, 함박스테이크, 치즈소스, 파슬리', ccp: '치즈소스 정량 충전' },
      { shift: '1편', time: '20:08 ~ 20:12', type: '생산', item: '꽉담은)고로케커리스파게티', qty: 76, duration: '4.6분', workers: '19명', bom: '스파게티면, 감자고로케 1개, 카레소스', ccp: '고로케 바삭도 유지' },
      { shift: '1편', time: '20:19 ~ 20:49', type: '휴게', item: '석식 및 라인 위생 점검', qty: '-', duration: '30분', workers: '교대', bom: '작업대 알코올 소독, 교대조 인수인계', ccp: 'HACCP 기준 점검' },
      { shift: '1편', time: '20:56 ~ 21:24', type: '생산', item: '배곱파)토마토미트파스타', qty: 479, duration: '28.7분', workers: '14명', bom: '스파게티면 200g, 미트토마토소스 80g, 파마산', ccp: '용기 테두리 소스 묻음 방지' },
      { shift: '1편', time: '21:31 ~ 22:45', type: '생산', item: '혜자로운집밥)제육볶음 (★야간메인)', qty: 1850, duration: '74.0분', workers: '18명', bom: '백미밥 230g, 매콤제육 85g, 계란후라이, 김치', ccp: '최대 물량 속도 2000 UPH 가동' },
      { shift: '1편', time: '22:52 ~ 23:36', type: '생산', item: '혜자로운)오징어불고기', qty: 1120, duration: '44.8분', workers: '18명', bom: '오징어불고기, 백미밥, 어묵조림', ccp: '정량 계량 및 외관 검사' },
      { shift: '1편', time: '23:43 ~ 00:13', type: '청소', item: '도시락 라인 마감 분해 세척 및 CIP 살균', qty: '-', duration: '30분', workers: '18명 전원', bom: '컨베이어 벨트 분해, 고온 온수 세척, 소독수 도포', ccp: '마감 점검표 서명 및 잔여물 전무 확인' }
    ]
  },

  // 2. 김밥 라인
  {
    code: '02_성형_김밥라인',
    title: '성형 2구역: 김밥 라인 (성형 및 포장 연동) 일일 작업지시서',
    docNo: 'GFS-WO-20261106-KIMBAP',
    lineGroup: '성형장 / 김밥 라인',
    speed: '목표 2,000 ea/h (실가동 1,500~2,100 ea/h, 분당 25개)',
    totalPlan: '11,062 줄 (12알 포장 기준 환산 16,760 ea)',
    totalTime: '09:30 ~ 20:23 (10시간 53분)',
    leadWorker: '김밥 조장 / 포장 조장',
    personnel: '성형 6~7명, 포장 9~10명, 마감청소 11명 전원 투입',
    schedule: [
      { shift: '2편', time: '09:30 ~ 10:19', type: '생산', item: '참치김치김밥', qty: 1226, duration: '49.0분', workers: '7명', bom: '초밥 140g, 볶음김치 25g, 참치마요 25g, 단무지, 당근', ccp: '김밥 롤 압착 강도 확인' },
      { shift: '2편', time: '10:24 ~ 11:46', type: '생산', item: '참치마요김밥 (★주력)', qty: 2058, duration: '82.3분', workers: '7명', bom: '초밥 140g, 참치마요샐러드 35g, 단무지, 지단, 깻잎', ccp: '참치마요 토핑 정량 계량' },
      { shift: '2편', time: '11:51 ~ 12:15', type: '생산', item: '소고기고추장김밥', qty: 613, duration: '24.5분', workers: '6명', bom: '초밥 140g, 소고기볶음고추장 30g, 계란지단, 우엉', ccp: '속재료 중앙 정렬 검사' },
      { shift: '2편', time: '12:20 ~ 12:51', type: '생산', item: '매콤어묵김밥', qty: 798, duration: '31.9분', workers: '6명', bom: '초밥, 매콤양념어묵채 35g, 단무지, 시금치', ccp: '어묵 볶음 심온 확인' },
      { shift: '2편', time: '12:56 ~ 13:56', type: '휴게', item: '중식 및 김밥 성형기 1차 알코올 세척', qty: '-', duration: '60분', workers: '교대', bom: '성형 매트 및 커터 칼날 소독', ccp: '교차오염 방지' },
      { shift: '2편', time: '14:01 ~ 14:32', type: '생산', item: '황치즈김치볶음밥김밥', qty: 780, duration: '31.2분', workers: '7명', bom: '김치볶음밥 140g, 체다치즈스트링 25g, 단무지', ccp: '치즈 정위치 확인' },
      { shift: '2편', time: '14:37 ~ 14:45', type: '생산', item: '소시지피자김밥', qty: 224, duration: '9.0분', workers: '6명', bom: '피자밥 140g, 프랑크소시지 1줄, 모짜렐라치즈', ccp: '소시지 굵기 편차 검사' },

      { shift: '1편', time: '14:50 ~ 15:35', type: '생산', item: '참치김치김밥', qty: 1131, duration: '45.2분', workers: '6명', bom: '초밥, 볶음김치, 참치마요, 단무지', ccp: '금속검출기 정상 통과' },
      { shift: '1편', time: '15:40 ~ 16:53', type: '생산', item: '참치마요김밥 (★오후 대량)', qty: 1835, duration: '73.4분', workers: '7명', bom: '초밥, 참치마요 35g, 단무지, 지단', ccp: '터짐 불량 전수 선별' },
      { shift: '1편', time: '16:58 ~ 17:18', type: '청소', item: '기계세척 및 중간 정리정돈', qty: '-', duration: '20분', workers: '전원', bom: '컨베이어 잔여 밥알 제거 및 칼날 교체', ccp: '칼날 파손 여부 점검' },
      { shift: '1편', time: '17:23 ~ 17:55', type: '생산', item: '황치즈김치볶음밥김밥', qty: 802, duration: '32.1분', workers: '7명', bom: '김치볶음밥, 체다치즈, 김', ccp: '치즈 심온 확인' },
      { shift: '1편', time: '18:00 ~ 18:09', type: '생산', item: '소시지피자김밥', qty: 227, duration: '9.1분', workers: '7명', bom: '피자밥, 통소시지, 피자소스', ccp: '포장 씰링 상태 점검' },
      { shift: '1편', time: '18:14 ~ 18:37', type: '생산', item: '소고기고추장김밥 (속도 2100 UPH)', qty: 585, duration: '23.4분', workers: '6명', bom: '초밥, 소고기고추장볶음, 우엉', ccp: '절단 단면 육안 검사' },
      { shift: '1편', time: '18:42 ~ 19:13', type: '생산', item: '매콤어묵김밥 (속도 2100 UPH)', qty: 783, duration: '31.3분', workers: '6명', bom: '초밥, 매콤어묵채, 단무지', ccp: '중량 220g ±5g 준수' },
      { shift: '1편', time: '19:18 ~ 19:48', type: '휴게', item: '석식', qty: '-', duration: '30분', workers: '교대', bom: '식사 및 휴식', ccp: '온도 관리' },
      { shift: '1편', time: '19:53 ~ 20:23', type: '청소', item: '김밥 라인 마감 전면 청소 및 분해 살균', qty: '-', duration: '20분', workers: '11명 전원', bom: '성형기 매트 침지소독, 절단기 칼날 열탕소독', ccp: '작업종료 위생 점검표 작성' }
    ]
  },

  // 3. 삼각김밥 1호기 (전주비빔 전용)
  {
    code: '03_성형_삼각김밥1호기',
    title: '성형 3구역: 삼각김밥 1호기 (전주비빔 전용) 일일 작업지시서',
    docNo: 'GFS-WO-20261106-SAMGAK1',
    lineGroup: '성형장 / 삼각김밥 1호기',
    speed: '목표 3,000 ea/h (소인화 2,700~1,800 ea/h, 분당 30개)',
    totalPlan: '8,020 ea (2편 3,920ea + 1편 4,100ea)',
    totalTime: '14:00 ~ 20:26 (6시간 26분 가동)',
    leadWorker: '삼각 1호기 기장',
    personnel: '고정 2명 (오퍼레이터 1명, 포장/적재 1명)',
    schedule: [
      { shift: '2편', time: '14:00 ~ 16:10', type: '생산', item: '삼각)전주비빔 (대량 가동)', qty: 3920, duration: '130.7분', workers: '2명', bom: '전주비빔밥(로터리) 85g, 볶음소고기고추장토핑 20g, 삼각김', ccp: '비빔밥 품온 20~25℃ 유지' },
      { shift: '1편', time: '16:25 ~ 18:41', type: '생산', item: '삼각)전주비빔 (★최대 물량)', qty: 4100, duration: '136.7분', workers: '2명', bom: '전주비빔밥 85g, 소고기고추장토핑 20g, 김 필름', ccp: '김 필름 커팅 및 성형 모서리 각도 확인' },
      { shift: '1편', time: '18:56 ~ 20:26', type: '청소', item: '삼각 1호기 기계 완전 분해 청소 및 조립 소독', qty: '-', duration: '90분', workers: '2명', bom: '성형 챔버 탈거 고압세척, 노즐 알코올 소독, 그리스 도포', ccp: '분해 청소 후 ATP 측정 ≤30 RLU' }
    ]
  },

  // 4. 삼각김밥 2호기 (토핑 및 커플 포장 연동)
  {
    code: '04_성형_삼각김밥2호기',
    title: '성형 4구역: 삼각김밥 2호기 (일반·커플 복합) 일일 작업지시서',
    docNo: 'GFS-WO-20261106-SAMGAK2',
    lineGroup: '성형장 / 삼각김밥 2호기',
    speed: '목표 3,000 ea/h (소인화 2,700 ea/h, 기존 1,830 ea/h)',
    totalPlan: '15,311 ea (2편 7,618ea + 1편 7,693ea)',
    totalTime: '09:30 ~ 22:56 (13시간 26분)',
    leadWorker: '삼각 2호기 기장',
    personnel: '고정 2명 (오퍼레이터 1명, 포장/적재 1명)',
    schedule: [
      { shift: '2편', time: '09:30 ~ 10:40', type: '생산', item: '삼각)스팸계란볶음밥', qty: 2116, duration: '70.5분', workers: '2명', bom: '계란볶음밥 85g, 스팸큐브 20g, 삼각김', ccp: '스팸 토핑 정량 투입' },
      { shift: '2편', time: '10:55 ~ 11:27', type: '생산', item: '커플 - 비빔참치 (2입 포장)', qty: 964, duration: '32.1분', workers: '2명', bom: '비빔참치밥, 참치토핑, 커플 2입 트레이 포장필름', ccp: '2입 포장 밀착도 점검' },
      { shift: '2편', time: '11:42 ~ 12:56', type: '생산', item: '삼각)비빔참치', qty: 2244, duration: '74.8분', workers: '2명', bom: '비빔참치밥 85g, 참치마요토핑 20g, 김', ccp: '참치 품온 8℃ 이하 유지' },
      { shift: '2편', time: '13:01 ~ 14:01', type: '휴게', item: '중식 및 토핑 노즐 세척', qty: '-', duration: '60분', workers: '교대', bom: '토핑 피더 알코올 소독', ccp: '청결도 확인' },
      { shift: '2편', time: '14:16 ~ 14:48', type: '생산', item: '커플 - 매콤참치 (2입 포장)', qty: 964, duration: '32.1분', workers: '2명', bom: '매콤참치밥, 매콤참치토핑, 커플 포장', ccp: '매콤 소스 번짐 방지' },
      { shift: '2편', time: '15:03 ~ 15:47', type: '생산', item: '삼각)매콤참치', qty: 1330, duration: '44.3분', workers: '2명', bom: '조미밥 85g, 매콤참치토핑 20g, 김', ccp: '금속검출기 정상 작동' },

      { shift: '1편', time: '16:02 ~ 16:46', type: '생산', item: '삼각)매콤참치', qty: 1342, duration: '44.7분', workers: '2명', bom: '조미밥 85g, 매콤참치토핑 20g, 김', ccp: '성형 중량 105g ±3g' },
      { shift: '1편', time: '17:01 ~ 17:32', type: '생산', item: '커플 - 매콤참치', qty: 947, duration: '31.6분', workers: '2명', bom: '매콤참치밥, 토핑, 커플 포장지', ccp: '커플 필름 씰링 검사' },
      { shift: '1편', time: '17:47 ~ 18:18', type: '생산', item: '커플 - 비빔참치', qty: 947, duration: '31.6분', workers: '2명', bom: '비빔참치밥, 토핑, 커플 포장지', ccp: '외관 육안 검사' },
      { shift: '1편', time: '18:33 ~ 19:53', type: '생산', item: '삼각)비빔참치 (★오후 메인)', qty: 2403, duration: '80.1분', workers: '2명', bom: '비빔참치밥 85g, 참치토핑 20g, 김', ccp: '시간당 2700개 가동율 체크' },
      { shift: '1편', time: '19:58 ~ 20:28', type: '휴게', item: '석식', qty: '-', duration: '30분', workers: '교대', bom: '식사 및 휴식', ccp: '작업장 온도 확인' },
      { shift: '1편', time: '20:43 ~ 21:51', type: '생산', item: '삼각)스팸계란볶음밥', qty: 2054, duration: '68.5분', workers: '2명', bom: '계란볶음밥, 스팸큐브, 김', ccp: '스팸 토핑 정량 투입' },
      { shift: '1편', time: '22:06 ~ 22:56', type: '청소', item: '2호기 기계 분해 청소 및 조립 소독', qty: '-', duration: '50분', workers: '2명', bom: '성형 몰드 온수 고압 세척, 살균 소독', ccp: '마감 청소 점검 서명' }
    ]
  },

  // 5. 더큰삼각 라인
  {
    code: '05_성형_더큰삼각김밥',
    title: '성형 5구역: 삼각김밥(더큰) 일일 작업지시서',
    docNo: 'GFS-WO-20261106-BIGSAMGAK',
    lineGroup: '성형장 / 더큰삼각김밥 라인',
    speed: '목표 3,000 ea/h (소인화 1,800~2,300 ea/h, 분당 32.6개)',
    totalPlan: '16,430 ea (2편 8,557ea + 1편 7,873ea)',
    totalTime: '08:30 ~ 23:42 (15시간 12분 가동)',
    leadWorker: '더큰삼각 조장',
    personnel: '2~3명 (조기 가동 지원 인원 포함)',
    schedule: [
      { shift: '2편', time: '08:30 ~ 09:11', type: '생산', item: '풀)청양참치마요 (조기작업)', qty: 1242, duration: '41.4분', workers: '3명', bom: '더큰조미밥 110g, 청양참치마요토핑 40g, 대형김', ccp: '대용량 150g 정량 계량' },
      { shift: '2편', time: '09:26 ~ 10:42', type: '생산', item: '풀)참치김치', qty: 2281, duration: '76.0분', workers: '2명', bom: '조미밥 110g, 김치참치토핑 40g, 김', ccp: '김치 수분 누수 방지' },
      { shift: '2편', time: '10:57 ~ 11:32', type: '생산', item: '풀)소불고기', qty: 1053, duration: '35.1분', workers: '3명', bom: '조미밥 110g, 소불고기토핑 40g, 김', ccp: '불고기 가열 중심온도 확인' },
      { shift: '2편', time: '11:47 ~ 12:09', type: '생산', item: '편스)진또더맵싹갈비', qty: 682, duration: '22.7분', workers: '2명', bom: '조미밥, 맵싹갈비토핑 40g, 김', ccp: '매운맛 양념 규격 준수' },
      { shift: '2편', time: '12:24 ~ 12:39', type: '생산', item: '편스)진또계란프라이짜장', qty: 462, duration: '15.4분', workers: '3명', bom: '짜장밥 110g, 미니후라이토핑, 김', ccp: '계란후라이 온전도 확인' },
      { shift: '2편', time: '12:44 ~ 13:44', type: '휴게', item: '중식 및 라인 1차 소독', qty: '-', duration: '60분', workers: '교대', bom: '작업대 및 밥 공급 호퍼 세척', ccp: '청결도 유지' },
      { shift: '2편', time: '13:59 ~ 15:33', type: '생산', item: '풀)스팸김치볶음밥 (★대량)', qty: 2837, duration: '94.6분', workers: '3명', bom: '스팸김치볶음밥 110g, 통스팸토핑 40g, 김', ccp: '스팸 두께 및 위치 점검' },

      { shift: '1편', time: '15:48 ~ 17:19', type: '생산', item: '풀)스팸김치볶음밥 (★야간대량)', qty: 2744, duration: '91.5분', workers: '3명', bom: '스팸김치볶음밥 110g, 통스팸 40g, 김', ccp: '분당 38.3개 최고속 가동' },
      { shift: '1편', time: '17:34 ~ 17:57', type: '생산', item: '편스)진또더맵싹갈비', qty: 713, duration: '23.8분', workers: '2명', bom: '조미밥, 맵싹갈비토핑, 김', ccp: '금속검출기 정상 통과' },
      { shift: '1편', time: '18:12 ~ 18:28', type: '생산', item: '편스)진또계란프라이짜장', qty: 493, duration: '16.4분', workers: '3명', bom: '짜장밥, 계란후라이토핑, 김', ccp: '포장지 결합 상태 점검' },
      { shift: '1편', time: '18:33 ~ 19:03', type: '휴게', item: '석식', qty: '-', duration: '30분', workers: '교대', bom: '식사 및 휴식', ccp: '온도 관리' },
      { shift: '1편', time: '19:18 ~ 19:51', type: '생산', item: '풀)소불고기', qty: 1015, duration: '33.8분', workers: '3명', bom: '조미밥 110g, 소불고기 40g, 김', ccp: '불고기 토핑 누출 방지' },
      { shift: '1편', time: '20:06 ~ 20:46', type: '생산', item: '풀)청양참치마요', qty: 1212, duration: '40.4분', workers: '3명', bom: '조미밥, 청양참치마요, 김', ccp: '참치 품온 관리' },
      { shift: '1편', time: '21:01 ~ 21:57', type: '생산', item: '풀)참치김치', qty: 1696, duration: '56.5분', workers: '2명', bom: '조미밥, 참치김치토핑, 김', ccp: '완제품 외관 전수 선별' },
      { shift: '1편', time: '22:12 ~ 23:42', type: '청소', item: '더큰삼각 기계 완전 분해 청소 및 조립 소독', qty: '-', duration: '90분', workers: '전원', bom: '대형 몰드 온수 분해 소독, 바닥 살균 세척', ccp: '마감 청소 점검표 완료' }
    ]
  },

  // 6. 샌드위치 라인
  {
    code: '06_성형_샌드위치라인',
    title: '성형 6구역: 샌드위치 조립 및 포장 일일 작업지시서',
    docNo: 'GFS-WO-20261106-SAND',
    lineGroup: '성형장 / 샌드위치 라인 (14시근무 연계)',
    speed: '목표 2,000 ea/h (소인화 1,600 ea/h, 분당 26.7개)',
    totalPlan: '6,030 ea (2편 2,454ea + 1편 3,576ea)',
    totalTime: '09:30 ~ 19:24',
    leadWorker: '샌드위치 조장',
    personnel: '17~18명 (식빵 정렬 2명, 샐러드 도포 6명, 커팅 4명, 포장 5명)',
    schedule: [
      { shift: '2편', time: '09:30 ~ 10:10', type: '생산', item: 'B.E.L.T샌드위치 (★주력)', qty: 1082, duration: '40.6분', workers: '18명', bom: '식빵 3장, 베이컨구이 20g, 계란후라이, 양상추 30g, 토마토', ccp: '신선채소 오존수 살균 확인' },
      { shift: '2편', time: '10:17 ~ 10:54', type: '생산', item: '뚱)불고기샌드위치', qty: 1000, duration: '37.5분', workers: '18명', bom: '식빵 2장, 소불고기볶음 70g, 양상추, 불고기마요소스', ccp: '불고기 심온 75℃ 확인' },
      { shift: '2편', time: '11:01 ~ 11:06', type: '생산', item: '편스)더블새우뚱드위치', qty: 149, duration: '5.6분', workers: '17명', bom: '식빵, 통새우패티 2장, 스위트칠리소스, 양배추', ccp: '새우패티 튀김 상태 검사' },
      { shift: '2편', time: '11:13 ~ 11:21', type: '생산', item: '시그니처)계란듬뿍샌드', qty: 223, duration: '8.4분', workers: '17명', bom: '화이트식빵 2장, 에그마요스프레드 90g', ccp: '계란 껍질(난각) 전수 선별' },
      { shift: '2편', time: '12:25 ~ 13:25', type: '휴게', item: '중식 및 조리대 1차 소독', qty: '-', duration: '60분', workers: '교대', bom: '도마 열탕 살균, 작업대 알코올 분무', ccp: '작업장 15도 유지' },
      { shift: '2편', time: '13:32 ~ 14:09', type: '생산', item: '중화요리 신상 샌드/롤', qty: 1000, duration: '37.5분', workers: '18명', bom: '특제번즈/식빵, 중화풍포크 60g, 청경채, 해선장소스', ccp: '신제품 레시피 중량 준수' },

      { shift: '1편', time: '15:19 ~ 15:29', type: '생산', item: '시그니처)계란듬뿍샌드', qty: 275, duration: '10.3분', workers: '17명', bom: '식빵, 에그마요스프레드 90g', ccp: '에그 품온 8℃ 이하' },
      { shift: '1편', time: '15:36 ~ 15:43', type: '생산', item: '편스)더블새우뚱드위치', qty: 212, duration: '8.0분', workers: '17명', bom: '식빵, 통새우패티, 칠리소스', ccp: '금속검출기 정상 작동' },
      { shift: '1편', time: '15:50 ~ 16:34', type: '생산', item: 'B.E.L.T샌드위치', qty: 1189, duration: '44.6분', workers: '18명', bom: '식빵, 베이컨, 계란후라이, 양상추, 토마토', ccp: '단면 삼각 커팅 균일도' },
      { shift: '1편', time: '16:41 ~ 17:18', type: '생산', item: '뚱)불고기샌드위치', qty: 1000, duration: '37.5분', workers: '18명', bom: '식빵, 소불고기 70g, 양상추, 마요소스', ccp: '샌드위치 케이스 실링 검사' },
      { shift: '1편', time: '18:47 ~ 19:24', type: '생산', item: '중화요리 신상 샌드/롤', qty: 1000, duration: '37.5분', workers: '18명', bom: '특제식빵, 중화포크, 채소', ccp: '중량 및 포장 라벨 검사' },
      { shift: '1편', time: '19:24 ~ 19:54', type: '청소', item: '샌드위치 라인 마감 위생 정리 및 도마 열탕소독', qty: '-', duration: '30분', workers: '16명', bom: '칼/도마 고온 살균, 컨베이어 세척', ccp: '마감 점검표 서명' }
    ]
  },

  // 7. 햄버거 라인
  {
    code: '07_성형_햄버거라인',
    title: '성형 7구역: 햄버거 조립 및 포장 (지원라인 연계) 일일 작업지시서',
    docNo: 'GFS-WO-20261106-BURGER',
    lineGroup: '성형장 / 햄버거 라인',
    speed: '목표 1,800 ea/h (실측 1,600~1,700 ea/h, 분당 26.7~28.3개)',
    totalPlan: '7,448 ea (기본 3,650ea + 관리자지원 3,798ea)',
    totalTime: '09:30 ~ 17:58',
    leadWorker: '햄버거 조장 / 관리자 지원반장',
    personnel: '9~10명 (번즈 1명, 패티/치즈 3명, 야채/소스 3명, 자동포장 3명)',
    schedule: [
      { shift: '2편', time: '09:30 ~ 10:12', type: '생산', item: '1900)그릴드불고기버거', qty: 1135, duration: '42.6분', workers: '10명', bom: '글레이즈번즈, 그릴불고기패티 65g, 불고기소스, 양파다이스', ccp: '패티 그릴 구이 심온 ≥75℃' },
      { shift: '2편', time: '10:17 ~ 10:36', type: '생산', item: 'NEW찐)소불고기비프버거', qty: 512, duration: '19.2분', workers: '10명', bom: '참깨번즈, 비프패티 70g, 리얼소불고기토핑 25g, 치즈', ccp: '비프패티 가열 완료 확인' },
      { shift: '2편', time: '10:41 ~ 10:56', type: '생산', item: '빅)내슈빌핫치킨버거', qty: 440, duration: '15.5분', workers: '9명', bom: '빅번즈, 스파이시핫치킨패티 90g, 코울슬로샐러드', ccp: '치킨패티 튀김 심온 85℃' },
      { shift: '2편', time: '11:01 ~ 11:14', type: '생산', item: '빅)통돈까스치즈버거', qty: 377, duration: '13.3분', workers: '9명', bom: '빅번즈, 통등심돈까스 80g, 체다치즈, 돈까스소스', ccp: '돈까스 튀김 상태 확인' },
      { shift: '1편', time: '14:16 ~ 15:12', type: '생산', item: '1900)그릴드불고기버거 (★최다)', qty: 1500, duration: '56.3분', workers: '10명', bom: '번즈, 그릴패티 65g, 데리소스, 양파', ccp: '자동 버거 래핑기 실링 검사' },
      { shift: '2편지원', time: '15:00 ~ 15:34', type: '지원', item: '통돈까스치즈버거 (관리자지원라인)', qty: 931, duration: '34.9분', workers: '10명', bom: '빅번즈, 통등심돈까스, 체다치즈, 돈까스소스', ccp: '지원라인 UPH 1800 달성 점검' },
      { shift: '1편', time: '15:04 ~ 15:12', type: '생산', item: 'NEW찐)소불고기비프버거', qty: 234, duration: '8.8분', workers: '10명', bom: '참깨번즈, 비프패티, 불고기토핑', ccp: '금속검출기 정상 통과' },
      { shift: '1편', time: '15:17 ~ 15:23', type: '생산', item: '빅)통돈까스치즈버거', qty: 174, duration: '6.5분', workers: '10명', bom: '빅번즈, 돈까스, 치즈, 양배추', ccp: '치즈 용융 상태 확인' },
      { shift: '1편', time: '15:28 ~ 15:37', type: '생산', item: '빅)내슈빌핫치킨버거', qty: 278, duration: '9.8분', workers: '9명', bom: '빅번즈, 핫치킨패티, 코울슬로', ccp: '소스 균일 도포' },
      { shift: '1편지원', time: '15:59 ~ 16:24', type: '지원', item: 'NEW찐)소불고기비프버거 (지원라인)', qty: 675, duration: '25.3분', workers: '10명', bom: '참깨번즈, 비프패티, 불고기토핑, 소스', ccp: '포장지 라벨 바코드 확인' },
      { shift: '1편지원', time: '16:55 ~ 17:26', type: '지원', item: '통돈까스치즈버거 (지원라인)', qty: 750, duration: '31.3분', workers: '10명', bom: '빅번즈, 돈까스, 치즈, 소스', ccp: '정량 210g ±5g 준수' },
      { shift: '1편지원', time: '17:42 ~ 17:58', type: '지원', item: '빅)내슈빌핫치킨버거 (지원라인)', qty: 447, duration: '16.6분', workers: '9명', bom: '빅번즈, 치킨패티, 핫소스', ccp: '지원 작업 완료 수량 검수' },
      { shift: '1편', time: '18:00 ~ 18:30', type: '청소', item: '햄버거 라인 최종 마감 세척 및 살균 소독', qty: '-', duration: '30분', workers: '10명', bom: '번즈 토스터 벨트 소독, 포장기 청소', ccp: '마감 청소 점검 서명' }
    ]
  },

  // 8. 조리면 스파게티 라인
  {
    code: '08_성형_조리면스파게티',
    title: '성형 8구역: 조리면 (스파게티·파스타 4종) 일일 작업지시서',
    docNo: 'GFS-WO-20261106-SPAGHETTI',
    lineGroup: '성형장 / 조리면 4종 라인',
    speed: '목표 1,600 ea/h (소인화 1,000 ea/h, 분당 16.7개)',
    totalPlan: '2,681 ea (2편 577ea + 1편 2,104ea)',
    totalTime: '2편(11:28~12:18) / 1편(17:25~21:24)',
    leadWorker: '조리면 담당 조장',
    personnel: '14~19명 (면투입 2명, 소스충전 4명, 메인토핑 6명, 실링 3명, 검품 2명)',
    schedule: [
      { shift: '2편', time: '11:28 ~ 11:35', type: '생산', item: '꽉)매콤돈까스스파게티', qty: 160, duration: '7.7분', workers: '17명', bom: '스파게티면 180g, 돈까스 1장, 매콤토마토소스 90g', ccp: '돈까스 튀김 중심온도 ≥85℃' },
      { shift: '2편', time: '11:42 ~ 11:47', type: '생산', item: '꽉담은)치즈함박스파게티', qty: 110, duration: '5.3분', workers: '18명', bom: '파스타면 180g, 함박스테이크 80g, 치즈소스, 파슬리', ccp: '함박스테이크 가열 확인' },
      { shift: '2편', time: '11:54 ~ 11:56', type: '생산', item: '꽉담은)고로케커리스파게티', qty: 49, duration: '2.9분', workers: '19명', bom: '스파게티면, 감자고로케 1개, 카레소스 85g', ccp: '고로케 바삭도 유지' },
      { shift: '2편', time: '12:03 ~ 12:18', type: '생산', item: '배곱파)토마토미트파스타', qty: 258, duration: '15.5분', workers: '14명', bom: '스파게티면 200g, 미트토마토소스 90g, 파마산치즈', ccp: '정량 충전 오차 ±3g 이내' },

      { shift: '1편', time: '17:25 ~ 17:39', type: '생산', item: '꽉)매콤돈까스스파게티', qty: 300, duration: '14.4분', workers: '17명', bom: '스파게티면, 돈까스, 매콤소스', ccp: '면 삶기 알덴테 식감 관리' },
      { shift: '1편', time: '17:46 ~ 17:53', type: '생산', item: '꽉담은)치즈함박스파게티', qty: 150, duration: '7.2분', workers: '18명', bom: '파스타면, 함박스테이크, 치즈소스', ccp: '치즈 소스 노즐 온도 확인' },
      { shift: '1편', time: '18:00 ~ 18:04', type: '생산', item: '꽉담은)고로케커리스파게티', qty: 69, duration: '4.1분', workers: '19명', bom: '스파게티면, 감자고로케, 카레소스', ccp: '고로케 토핑 위치 정렬' },
      { shift: '1편', time: '18:11 ~ 18:40', type: '생산', item: '배곱파)토마토미트파스타', qty: 485, duration: '29.1분', workers: '14명', bom: '스파게티면, 미트소스, 치즈분태', ccp: '용기 실링 필름 접합 검사' },
      { shift: '도시락연계', time: '19:28 ~ 19:45', type: '생산', item: '꽉)매콤돈까스스파게티 (도시락라인 배정분)', qty: 295, duration: '17.7분', workers: '17명', bom: '스파게티면, 돈까스, 소스', ccp: '금속검출기 정상 통과' },
      { shift: '도시락연계', time: '19:52 ~ 20:01', type: '생산', item: '꽉담은)치즈함박스파게티 (도시락라인 배정분)', qty: 151, duration: '9.1분', workers: '18명', bom: '파스타면, 함박, 치즈소스', ccp: '중심온도 체크' },
      { shift: '도시락연계', time: '20:08 ~ 20:12', type: '생산', item: '꽉담은)고로케커리스파게티 (도시락라인 배정분)', qty: 76, duration: '4.6분', workers: '19명', bom: '스파게티면, 고로케, 카레소스', ccp: '외관 선별' },
      { shift: '도시락연계', time: '20:56 ~ 21:24', type: '생산', item: '배곱파)토마토미트파스타 (도시락라인 배정분)', qty: 479, duration: '28.7분', workers: '14명', bom: '스파게티면, 미트소스', ccp: '최종 중량 검수' },
      { shift: '1편', time: '21:25 ~ 21:55', type: '청소', item: '조리면 소스 디스펜서 및 노즐 분해 살균 세척', qty: '-', duration: '30분', workers: '14명', bom: '배관 온수 플러싱, 노즐 침지소독', ccp: '마감 청소 점검표 서명' }
    ]
  },

  // 9. HMR 완제품 라인
  {
    code: '09_성형_HMR라인',
    title: '성형 9구역: HMR 완제품 및 지원라인 일일 작업지시서',
    docNo: 'GFS-WO-20261106-HMR',
    lineGroup: '성형장 / HMR 라인 (도시락·샌드 교차지원)',
    speed: '목표 1,500 ea/h (소인화 900 ea/h, 분당 15개)',
    totalPlan: '984 ea (자체완제품) + 도시락 닭강정 2,500ea 지원',
    totalTime: '08:10 ~ 16:15 (교차지원 120분 포함)',
    leadWorker: 'HMR 전담 조장',
    personnel: '7~14명 (교차지원 시 14명 가동)',
    schedule: [
      { shift: '1편', time: '08:10 ~ 09:30', type: '생산', item: '매콤달콤치킨강정 (자체 483ea + 도시락 지원 2,500ea 연계)', qty: 483, duration: '80분', workers: '7명', bom: '순살닭강정 180g, 매콤달콤강정소스, 땅콩분태', ccp: '튀김 유탕 심온 ≥85℃' },
      { shift: '1편', time: '09:30 ~ 10:15', type: '생산', item: '새우왕교자그라탕', qty: 75, duration: '45분', workers: '7명', bom: '새우왕교자만두 3개, 토마토그라탕소스, 모짜렐라치즈', ccp: '만두 찜 심온 80℃' },
      { shift: '1편', time: '10:15 ~ 11:30', type: '생산', item: '반반탕수육(66ea) / 보쌈(72ea) / 백미(30ea)', qty: 168, duration: '75분', workers: '14명', bom: '등심탕수육, 탕수육소스, 삶은수육, 백미용기', ccp: '육류 가열 완료 검사' },
      { shift: '1편', time: '11:30 ~ 12:20', type: '휴게', item: '중식', qty: '-', duration: '50분', workers: '교대', bom: '식사 및 휴식', ccp: '온도 관리' },
      { shift: '1편', time: '12:20 ~ 14:20', type: '지원', item: '샌드위치 / 햄버거 라인 교차 지원 작업', qty: '-', duration: '120분', workers: '10명', bom: '샌드위치 조립 및 버거 패티/포장 라인 긴급 지원', ccp: '지원 공정 위생복 재소독' },
      { shift: '1편', time: '14:20 ~ 14:50', type: '휴게', item: '휴식', qty: '-', duration: '30분', workers: '교대', bom: '작업장 정돈', ccp: '위생 체크' },
      { shift: '1편', time: '14:50 ~ 15:40', type: '생산', item: '치즈불닭 (온라인/편의점 공급)', qty: 258, duration: '50분', workers: '14명', bom: '직화매콤닭다리살 160g, 불닭소스, 눈꽃모짜렐라치즈', ccp: '직화 가열 심온 85℃' },
      { shift: '1편', time: '15:40 ~ 16:00', type: '생산', item: '잔량 포장 및 검품', qty: '-', duration: '20분', workers: '10명', bom: '완제품 라벨 및 금속검출기 최종 통과', ccp: '금속검출기 정상' },
      { shift: '1편', time: '16:00 ~ 16:15', type: '청소', item: 'HMR 라인 전면 세척 및 소독', qty: '-', duration: '15분', workers: '10명', bom: '작업대 살균 소독 및 바닥 청소', ccp: '마감 청소 점검' }
    ]
  },

  // 10. 전처리 구역: 취반 및 밥 가공실
  {
    code: '10_전처리_취반공정',
    title: '전처리 1구역: 취반실 (연속취반기) 및 로터리 볶음솥 일일 작업지시서',
    docNo: 'GFS-WO-20261106-RICE',
    lineGroup: '전처리실 / 취반기 4대 & 로터리 볶음솥 3대',
    speed: '시간당 취반 500kg / 로터리 믹싱 400kg',
    totalPlan: '취반미 4,200kg, 전주비빔밥 1,150kg, 김치/스팸볶음밥 2,430kg',
    totalTime: '05:00 ~ 20:30 (15시간 30분 가동)',
    leadWorker: '취반장 / 믹싱 반장',
    personnel: '6명 (쌀 세미 1명, 취반 조작 2명, 로터리 볶음 2명, 배식 운반 1명)',
    schedule: [
      { shift: '2편선행', time: '05:00 ~ 06:30', type: '생산', item: '더큰 및 삼각 2호기용 1차 조미밥 취반 (★08:30 성형 공급)', qty: '30 솥 (750kg)', duration: '90분', workers: '3명', bom: '신동진 햅쌀, 배합초(식초+설탕+정제염), 취반유', ccp: '뜸들이기 15분, 심온 ≥95℃' },
      { shift: '2편선행', time: '06:30 ~ 08:00', type: '생산', item: '로터리 1호: 스팸김치볶음밥 믹싱 (더큰삼각 2,837ea 분량)', qty: '380 kg', duration: '90분', workers: '2명', bom: '취반밥 280kg, 볶음김치소스 75kg, 깍둑스팸 25kg', ccp: '품온 20~25℃ 냉각 후 공급' },
      { shift: '2편선행', time: '07:30 ~ 09:30', type: '생산', item: '도시락용 백미밥 및 김밥용 초밥 취반 (NEW고진많/정찬 공급)', qty: '45 솥 (1,125kg)', duration: '120분', workers: '3명', bom: '백미 800kg, 초밥용 쌀 325kg, 정수 1,300L', ccp: '밥알 수분율 62% 균일도 확인' },
      { shift: '2편선행', time: '08:30 ~ 09:30', type: '생산', item: '로터리 2호: 스팸계란볶음밥 믹싱 (삼각 2호기 2,116ea 분량)', qty: '240 kg', duration: '60분', workers: '2명', bom: '밥 180kg, 스크램블에그 35kg, 특제간장소스 25kg', ccp: '계란 뭉침 방지 균일 교반' },
      { shift: '1편선행', time: '11:30 ~ 13:30', type: '생산', item: '로터리 1호: 전주비빔밥 대량 믹싱 (삼각 1호기 8,020ea 전담)', qty: '1,150 kg', duration: '120분', workers: '2명', bom: '밥 860kg, 전주비빔고추장소스 210kg, 참기름 80kg', ccp: '삼각 1호기 14:00 정시 공급' },
      { shift: '1편선행', time: '13:30 ~ 16:00', type: '생산', item: '1편 야간 도시락(혜자제육 1,850ea) 및 김밥용 2차 취반', qty: '55 솥 (1,375kg)', duration: '150분', workers: '3명', bom: '백미 900kg, 김밥미 475kg', ccp: '취반 심온 95℃ 확인' },
      { shift: '1편선행', time: '16:00 ~ 17:30', type: '생산', item: '로터리 2호: 1편 더큰용 스팸김치볶음밥 2차 대량 믹싱', qty: '360 kg', duration: '90분', workers: '2명', bom: '취반밥, 볶음김치소스, 스팸큐브', ccp: '소스 혼합 균일도 점검' },
      { shift: '마감정리', time: '19:30 ~ 20:30', type: '청소', item: '취반 솥 160개 세척 및 로터리 볶음솥 CIP 고온 고압 세척', qty: '-', duration: '60분', workers: '6명 전원', bom: '고압 온수 세척, 배관 린스 살균', ccp: '취반실 바닥 전분 제거 확인' }
    ]
  },

  // 11. 전처리 구역: 가열 조리실
  {
    code: '11_전처리_가열조리실',
    title: '전처리 2구역: 가열 조리실 (회전솥·유탕기·그릴) 일일 작업지시서',
    docNo: 'GFS-WO-20261106-COOK',
    lineGroup: '전처리실 / 회전솥 4대, 오토후라이어 2대, 패티그릴 1대',
    speed: '연속 유탕 및 회전솥 가열 조리',
    totalPlan: '제육볶음 650kg, 오징어불고기 420kg, 치킨강정 580kg, 버거패티 2,635ea, 돈까스 2,232ea',
    totalTime: '04:30 ~ 19:30 (15시간 가동)',
    leadWorker: '가열조리 반장',
    personnel: '8명 (회전솥 3명, 튀김/오븐 3명, 패티 그릴 2명)',
    schedule: [
      { shift: '2편선행', time: '04:30 ~ 07:00', type: '생산', item: '그릴 패티 구이: 1900불고기버거 패티 & NEW찐 비프패티 1차', qty: '1,800 ea', duration: '150분', workers: '2명', bom: '돈육불고기패티 65g, 비프패티 70g (그릴 220℃)', ccp: '패티 그릴 구이 심온 ≥75℃' },
      { shift: '2편선행', time: '05:00 ~ 07:30', type: '생산', item: '오토후라이어 1호: 버거용 통등심돈까스 & 핫치킨패티 튀김', qty: '1,200 ea', duration: '150분', workers: '3명', bom: '통등심돈까스 80g, 내슈빌핫치킨패티 90g (유온 175℃)', ccp: '튀김 중심온도 ≥85℃ (산가 ≤2.0)' },
      { shift: '2편선행', time: '07:00 ~ 09:30', type: '생산', item: '회전솥 1·2호: 혜자 제육볶음 (2편 1,392ea 공급용)', qty: '280 kg', duration: '150분', workers: '3명', bom: '돈전지슬라이스 200kg, 특제고추장양념 60kg, 양파 20kg', ccp: '가열육 중심온도 ≥85℃' },
      { shift: '2편선행', time: '08:30 ~ 10:30', type: '생산', item: '회전솥 3호: 혜자 오징어불고기 (2편 1,500ea 공급용)', qty: '220 kg', duration: '120분', workers: '2명', bom: '솔트오징어채 140kg, 돈육 50kg, 불고기양념 30kg', ccp: '오징어 조리 심온 80℃' },
      { shift: 'HMR연계', time: '10:30 ~ 12:30', type: '생산', item: '오토후라이어 2호: 순살닭강정 튀김 & 소스 글레이징', qty: '580 kg', duration: '120분', workers: '3명', bom: '닭다리순살 460kg, 튀김가루 80kg, 강정양념 40kg', ccp: '도시락 2,500ea 분량 14시 정시 인계' },
      { shift: '1편선행', time: '13:30 ~ 16:30', type: '생산', item: '회전솥 1·2호: 1편 혜자 제육볶음 (대량 1,850ea 공급용)', qty: '370 kg', duration: '180분', workers: '3명', bom: '돈전지 260kg, 고추장양념 80kg, 대파/양파 30kg', ccp: '심온 85℃ 확인 후 핫박스 적재' },
      { shift: '1편선행', time: '14:30 ~ 16:30', type: '생산', item: '오토후라이어: 돈까스스파게티용 돈까스 튀김 (600장)', qty: '600 ea', duration: '120분', workers: '2명', bom: '스파게티용 등심돈까스 600장 (175도 4분)', ccp: '심온 85℃ 및 바삭도 유지' },
      { shift: '1편선행', time: '16:00 ~ 17:30', type: '생산', item: '회전솥 3호: 1편 혜자 오징어불고기 (1,120ea 공급용)', qty: '200 kg', duration: '90분', workers: '2명', bom: '오징어 130kg, 불고기 45kg, 양념 25kg', ccp: '중심온도 점검' },
      { shift: '마감정리', time: '18:30 ~ 19:30', type: '청소', item: '튀김유 여과/교체 및 회전솥 가성소다 탈지 세척', qty: '-', duration: '60분', workers: '8명 전원', bom: '규조토 여과기 가동, 회전솥 열탕 알칼리 세척', ccp: '가열조리실 마감 위생 점검' }
    ]
  },

  // 12. 전처리 구역: 야채 세척 및 소스·토핑 소분실
  {
    code: '12_전처리_야채및소스소분',
    title: '전처리 3구역: 채소 전처리 (오존수 살균) 및 참치·토핑 소분실 일일 작업지시서',
    docNo: 'GFS-WO-20261106-VEGE',
    lineGroup: '전처리실 / 오존수 세척조, 채소 슬라이서, 대형 믹서 2대',
    speed: '채소 세척 300kg/h, 토핑 배합 250kg/h',
    totalPlan: '참치마요/비빔참치 850kg, 샌드위치용 야채 320kg, 김밥속재료 450kg, 스파게티소스 480kg',
    totalTime: '05:30 ~ 18:30 (13시간 가동)',
    leadWorker: '채소/소분 조장',
    personnel: '6명 (오존수 세척 2명, 슬라이서/탈수 1명, 참치 믹싱 2명, 계량 1명)',
    schedule: [
      { shift: '2편선행', time: '05:30 ~ 07:30', type: '생산', item: '참치믹서 1호: 비빔참치 & 청양참치마요 대량 배합 (삼각 2호/더큰)', qty: '380 kg', duration: '120분', workers: '2명', bom: '탈유참치 250kg, 특제마요네즈 80kg, 청양고추/비빔양념 50kg', ccp: '참치 탈유율 65% 준수, 품온 ≤8℃' },
      { shift: '2편선행', time: '06:00 ~ 08:00', type: '생산', item: '오존수 세척기: B.E.L.T용 양상추/토마토 살균 세척 및 슬라이스', qty: '180 kg', duration: '120분', workers: '2명', bom: '국내산 양상추 120kg (오존수 5분 침지), 완숙토마토 60kg', ccp: '원료 이물/해충 육안 선별, 잔류 염소 확인' },
      { shift: '2편선행', time: '07:30 ~ 09:00', type: '생산', item: '소분실: 김밥용 단무지, 지단, 볶음김치, 우엉 롤 규격 소분', qty: '260 kg', duration: '90분', workers: '2명', bom: '김밥단무지 80kg, 계란지단 60kg, 맛김치 80kg, 우엉 40kg', ccp: '트레이 정량 배분' },
      { shift: '2편선행', time: '08:30 ~ 10:00', type: '생산', item: '참치믹서 2호: 김밥용 참치마요샐러드 배합 (김밥 2편 공급용)', qty: '160 kg', duration: '90분', workers: '2명', bom: '가다랑어참치 110kg, 마요네즈 40kg, 양념 10kg', ccp: '콜드체인 5℃ 유지' },
      { shift: '1편선행', time: '11:30 ~ 13:30', type: '생산', item: '참치믹서 1호: 1편 삼각 2호기(2,403ea) 및 김밥용 참치 2차 배합', qty: '310 kg', duration: '120분', workers: '2명', bom: '참치 210kg, 마요네즈 75kg, 부재료 25kg', ccp: '금속검출기 봉투 통과 후 공급' },
      { shift: '1편선행', time: '13:00 ~ 15:00', type: '생산', item: '소스실: 조리면 4종(매콤토마토, 미트, 치즈, 카레) 디스펜서 충전', qty: '320 kg', duration: '120분', workers: '2명', bom: '매콤스파게티소스 120kg, 미트소스 110kg, 치즈카레 90kg', ccp: '소스 덩어리 거름망 여과' },
      { shift: '1편선행', time: '14:30 ~ 16:30', type: '생산', item: '채소작업실: 1편 샌드위치용 양상추 2차 오존수 세척 및 탈수', qty: '140 kg', duration: '120분', workers: '2명', bom: '양상추 90kg, 토마토 50kg (원심탈수기 수분 제거)', ccp: '탈수 후 표면 수분율 관리' },
      { shift: '마감정리', time: '17:30 ~ 18:30', type: '청소', item: '믹서 보울 2기 완전 분해 소독 및 야채 세척조 염소 린스', qty: '-', duration: '60분', workers: '6명 전원', bom: '식품용 알코올 70% 분무 소독, 도마 자외선 소독고 적재', ccp: '표면 ATP 검사 50 RLU 이하 확인' }
    ]
  }
];

// ── 개별 라인 HTML 렌더링 ──
function generateHtml(order) {
  const css = getCommonCss();
  const scheduleRows = order.schedule.map((row, idx) => {
    let rowClass = '';
    if (row.type === '청소') rowClass = 'clean-row';
    else if (row.type === '휴게') rowClass = 'meal-row';
    else if (row.type === '지원') rowClass = 'support-row';

    let shiftBadge = '';
    if (row.shift.includes('2편')) shiftBadge = `<span class="badge badge-shift2">${row.shift}</span>`;
    else if (row.shift.includes('1편')) shiftBadge = `<span class="badge badge-shift1">${row.shift}</span>`;
    else if (row.shift.includes('지원')) shiftBadge = `<span class="badge badge-support">${row.shift}</span>`;
    else shiftBadge = `<span class="badge badge-clean">${row.shift}</span>`;

    return `
      <tr class="${rowClass}">
        <td style="text-align: center; font-family: monospace;">${idx + 1}</td>
        <td style="text-align: center;">${shiftBadge}</td>
        <td style="text-align: center; font-family: monospace; font-weight: 700;">${row.time}</td>
        <td style="text-align: center; font-weight: 700;">${row.type}</td>
        <td style="font-weight: 800; color: #0f172a;">${row.item}</td>
        <td style="text-align: right; font-family: monospace; font-weight: 900;">${typeof row.qty === 'number' ? row.qty.toLocaleString() + ' ea' : row.qty}</td>
        <td style="text-align: center; font-family: monospace;">${row.duration}</td>
        <td style="text-align: center; font-weight: 700;">${row.workers || '-'}</td>
        <td style="font-size: 9.5px; color: #334155;">${row.bom}</td>
        <td style="font-size: 9.5px; color: #b91c1c; font-weight: 700;">${row.ccp}</td>
        <td style="text-align: center; width: 40px;"><div style="width: 13px; height: 13px; border: 1.5px solid #94a3b8; border-radius: 2px; margin: auto;"></div></td>
      </tr>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html lang="ko">
    <head>
      <meta charset="UTF-8">
      <title>${order.title}</title>
      <style>${css}</style>
    </head>
    <body>
      <div class="header-box">
        <div>
          <div class="company-title">(주)지에프에스 (GFS Co., Ltd.) | GS25 신선식품 전용 제조공장</div>
          <div class="main-title">${order.title}</div>
          <div style="font-size: 10px; color: #64748b; margin-top: 2px;">
            <strong>문서번호:</strong> ${order.docNo} | <strong>기준자료:</strong> 2026-11-06 성형장 최신 타임테이블 (1001) 확정본 | <strong>운영:</strong> 1일 2교대 (2편+1편)
          </div>
        </div>
        <div>
          <table class="approval-table">
            <thead>
              <tr>
                <th style="width: 48px;">작 성</th>
                <th style="width: 48px;">검 토</th>
                <th style="width: 52px;">승 인</th>
                <th style="width: 52px;">공장장</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="kpi-row">
        <div class="kpi-card highlight">
          <div class="kpi-label">일일 총 생산계획</div>
          <div class="kpi-val" style="color: #1d4ed8;">${order.totalPlan}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">라인 가동 시간대</div>
          <div class="kpi-val">${order.totalTime}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">라인 생산속도 (UPH / 분당)</div>
          <div class="kpi-val" style="font-size: 12.5px;">${order.speed}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">소인화 투입인원</div>
          <div class="kpi-val" style="font-size: 12px; color: #b45309;">${order.personnel}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">공정 책임자</div>
          <div class="kpi-val" style="font-size: 13px;">${order.leadWorker}</div>
        </div>
      </div>

      <table class="work-table">
        <thead>
          <tr>
            <th style="width: 30px;">NO</th>
            <th style="width: 45px;">구분</th>
            <th style="width: 82px;">작업시간</th>
            <th style="width: 42px;">유형</th>
            <th style="width: 175px;">지시 제품명 (규격/스펙)</th>
            <th style="width: 72px;">지시수량</th>
            <th style="width: 52px;">소요시간</th>
            <th style="width: 45px;">작업인원</th>
            <th>주요 원부자재 배합 기준 (BOM)</th>
            <th style="width: 165px;">HACCP & CCP 핵심 관리기준</th>
            <th style="width: 38px;">확인</th>
          </tr>
        </thead>
        <tbody>
          ${scheduleRows}
        </tbody>
      </table>

      <div class="footer-note">
        <div>
          <strong>[현장 필수 준수사항]</strong> 1. 매 품목 교체 시 알레르기 유발물질 교차오염 방지용 알코올 70% 세척 필수 &nbsp;|&nbsp; 2. 금속검출기(Fe 2.0mm, SUS 3.0mm) 매 30분 주기 테스트 &nbsp;|&nbsp; 3. 품온 기준 10℃ 이하 엄수 (가열육 중심온도 ≥75℃)
        </div>
        <div style="font-family: monospace;">
          발행: GFS 제조생산관리 ERP 시스템 (자동 타임테이블 연계)
        </div>
      </div>
    </body>
    </html>
  `;
}

// ── 실행 메인 함수 ──
async function main() {
  console.log('🚀 GFS 최신 타임테이블(1001) 반영 라인별 작업지시서 PDF 생성 시작...');
  const generatedFiles = [];

  // 1. 개별 라인별 PDF 생성
  for (let i = 0; i < LINE_WORK_ORDERS.length; i++) {
    const order = LINE_WORK_ORDERS[i];
    const htmlContent = generateHtml(order);
    const htmlPath = path.join(OUTPUT_DIR, `${order.code}_최신.html`);
    const pdfPath = path.join(OUTPUT_DIR, `${order.code}_최신.pdf`);

    fs.writeFileSync(htmlPath, htmlContent, 'utf-8');

    const cmd = `"${CHROME_PATH}" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${pdfPath}" "${htmlPath}"`;
    try {
      execSync(cmd, { stdio: 'pipe' });
      const stats = fs.statSync(pdfPath);
      console.log(`✅ [${i + 1}/${LINE_WORK_ORDERS.length}] ${order.code} PDF 완료 (${(stats.size / 1024).toFixed(1)} KB)`);
      generatedFiles.push({ name: order.title, pdfPath, code: order.code, size: stats.size });
    } catch (err) {
      console.error(`❌ ${order.code} 변환 실패:`, err.message);
    } finally {
      if (fs.existsSync(htmlPath)) fs.unlinkSync(htmlPath);
    }
  }

  // 2. 전 라인 통합 마스터 PDF 생성 (12개 라인 종합본)
  console.log('📑 전 라인 통합 마스터 종합본 PDF 생성 중...');
  const combinedHtmlPages = LINE_WORK_ORDERS.map((order, idx) => {
    const pageHtml = generateHtml(order)
      .replace('<!DOCTYPE html>', '')
      .replace('<html lang="ko">', '')
      .replace('</html>', '')
      .replace(/<head>[\s\S]*?<\/head>/, '')
      .replace(/<body>/, '')
      .replace(/<\/body>/, '');
    
    return `<div class="${idx < LINE_WORK_ORDERS.length - 1 ? 'page-break' : ''}">${pageHtml}</div>`;
  }).join('\n');

  const masterHtml = `
    <!DOCTYPE html>
    <html lang="ko">
    <head>
      <meta charset="UTF-8">
      <title>GFS 전 라인 통합 작업지시서 (최신 타임테이블 반영본)</title>
      <style>${getCommonCss()}</style>
    </head>
    <body>
      ${combinedHtmlPages}
    </body>
    </html>
  `;

  const masterHtmlPath = path.join(OUTPUT_DIR, `00_GFS_전라인_통합작업지시서_종합본_최신.html`);
  const masterPdfPath = path.join(OUTPUT_DIR, `00_GFS_전라인_통합작업지시서_종합본_최신.pdf`);

  fs.writeFileSync(masterHtmlPath, masterHtml, 'utf-8');
  try {
    execSync(`"${CHROME_PATH}" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${masterPdfPath}" "${masterHtmlPath}"`, { stdio: 'pipe' });
    const masterStats = fs.statSync(masterPdfPath);
    console.log(`🎉 [마스터 종합본] 00_GFS_전라인_통합작업지시서_종합본_최신.pdf 완료 (${(masterStats.size / 1024).toFixed(1)} KB, 12페이지)`);
    generatedFiles.unshift({ name: 'GFS 전 라인 통합 작업지시서 (마스터 종합본 12페이지)', pdfPath: masterPdfPath, code: '00_종합본', size: masterStats.size });
  } catch (err) {
    console.error('❌ 마스터 PDF 생성 실패:', err.message);
  } finally {
    if (fs.existsSync(masterHtmlPath)) fs.unlinkSync(masterHtmlPath);
  }

  console.log(`\n총 ${generatedFiles.length}건의 최신 작업지시서 PDF 파일이 성공적으로 생성되었습니다.`);
  console.log(`저장 디렉토리: ${OUTPUT_DIR}`);
}

main();

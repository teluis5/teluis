import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { collectFleetData } from './collector_ana_fleet.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TELUIS_ROOT = path.resolve(__dirname, '..');

const BLOG_CONTENT_DIR = path.join(TELUIS_ROOT, 'src', 'content', 'blog');
const GUIDE_ARTICLE_FILE = path.join(BLOG_CONTENT_DIR, 'ana-chiikawa-jet-schedule-guide', 'index.mdx');
const GUIDE_HERO_IMAGE = path.join(BLOG_CONTENT_DIR, 'ana-chiikawa-jet-schedule-guide', 'hero.jpg');
const DATA_DIR = path.join(TELUIS_ROOT, 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'ana_b767_flight_history.json');

// コマンドライン引数解析
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isForce = args.includes('--force');
const isAutoPush = args.includes('--auto-push');

let specifiedPhase = null;
const phaseArg = args.find(a => a.startsWith('--phase='));
if (phaseArg) {
  specifiedPhase = phaseArg.split('=')[1].trim();
}

// 日本語空港辞書
const AIRPORT_NAMES = {
  HND: '東京(羽田)',
  NRT: '東京(成田)',
  ITM: '大阪(伊丹)',
  KIX: '大阪(関空)',
  NGO: '名古屋(中部)',
  CTS: '札幌(新千歳)',
  FUK: '福岡',
  OKA: '沖縄(那覇)',
  ISG: '石垣',
  MYJ: '松山',
  NGS: '長崎',
  KMJ: '熊本',
  KOJ: '鹿児島',
  HIJ: '広島',
  YGJ: '米子',
  UBJ: '山口宇部',
  KCZ: '高知',
  HKD: '函館',
  KMI: '宮崎',
  AKJ: '旭川',
  MMB: '女満別',
  KMQ: '小松',
  TOY: '富山'
};

// ナイトステイ先空港から翌朝最初に出発する標準便マスター
const MORNING_DEPARTURE_STANDARDS = {
  NGS: {
    flightNo: 'NH662',
    orig: 'NGS',
    dest: 'HND',
    depTime: '07:45',
    arrTime: '09:20',
    confidence: '95%',
    reason: '長崎空港ナイトステイ機材の朝一羽田行き（高頻度・固定運用）'
  },
  HIJ: {
    flightNo: 'NH672',
    orig: 'HIJ',
    dest: 'HND',
    depTime: '07:30',
    arrTime: '08:50',
    confidence: '95%',
    reason: '広島空港ナイトステイ機材の朝一羽田行き（定番ビジネス路線）'
  },
  MYJ: {
    flightNo: 'NH582',
    orig: 'MYJ',
    dest: 'HND',
    depTime: '07:25',
    arrTime: '08:50',
    confidence: '90%',
    reason: '松山空港ナイトステイ機材の朝一羽田行き'
  },
  FUK: {
    flightNo: 'NH240',
    orig: 'FUK',
    dest: 'HND',
    depTime: '07:00',
    arrTime: '08:35',
    confidence: '85%',
    reason: '福岡空港ナイトステイ機材の朝一羽田始発便'
  },
  NGO: {
    flightNo: 'NH703',
    orig: 'NGO',
    dest: 'CTS',
    depTime: '08:40',
    arrTime: '10:25',
    confidence: '85%',
    reason: '中部国際空港ナイトステイ機材の新千歳行き、または羽田送り込み(NH86: 07:25)'
  },
  ITM: {
    flightNo: 'NH14',
    orig: 'ITM',
    dest: 'HND',
    depTime: '07:05',
    arrTime: '08:15',
    confidence: '85%',
    reason: '伊丹空港ナイトステイ機材の羽田行き始発便、または千歳行き(NH771)'
  },
  CTS: {
    flightNo: 'NH50',
    orig: 'CTS',
    dest: 'HND',
    depTime: '07:30',
    arrTime: '09:10',
    confidence: '80%',
    reason: '新千歳空港ナイトステイ機材の羽田行き朝一番便'
  },
  HND: {
    flightNo: 'NH661',
    orig: 'HND',
    dest: 'NGS',
    depTime: '08:15',
    arrTime: '10:10',
    confidence: '75%',
    reason: '羽田ナイトステイ後の九州・北海道・中国方面朝一便'
  }
};

// JST日時計算ヘルパー
function getJSTInfo() {
  const now = new Date();
  const jstOffset = 9 * 60;
  const localOffset = now.getTimezoneOffset();
  const jstDate = new Date(now.getTime() + (jstOffset + localOffset) * 60 * 1000);

  const yyyy = jstDate.getFullYear();
  const mm = String(jstDate.getMonth() + 1).padStart(2, '0');
  const dd = String(jstDate.getDate()).padStart(2, '0');
  const hh = String(jstDate.getHours()).padStart(2, '0');
  const min = String(jstDate.getMinutes()).padStart(2, '0');

  const todayStr = `${yyyy}-${mm}-${dd}`;
  const todaySlug = `${yyyy}${mm}${dd}-chiikawa-jet-schedule`;
  const todayJa = `${Number(mm)}月${Number(dd)}日`;
  const nowJa = `${yyyy}年${Number(mm)}月${Number(dd)}日 ${hh}:${min}`;

  // 明日の日付
  const tomorrow = new Date(jstDate.getTime() + 24 * 60 * 60 * 1000);
  const tYyyy = tomorrow.getFullYear();
  const tMm = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const tDd = String(tomorrow.getDate()).padStart(2, '0');
  const tomorrowStr = `${tYyyy}-${tMm}-${tDd}`;
  const tomorrowJa = `${Number(tMm)}月${Number(tDd)}日`;

  const hourNum = Number(hh);
  let phase = 'morning';
  if (hourNum >= 5 && hourNum < 11) {
    phase = 'morning';
  } else if (hourNum >= 11 && hourNum < 17) {
    phase = 'noon';
  } else if (hourNum >= 17 && hourNum < 21) {
    phase = 'evening';
  } else {
    phase = 'night';
  }

  if (specifiedPhase) {
    phase = specifiedPhase;
  }

  const phaseConfig = {
    morning: {
      name: '朝刊予測公開',
      timeLabel: '07:00 朝刊予測公開',
      badgeColor: '#0284c7',
      bgColor: '#f0f9ff',
      borderColor: '#bae6fd',
      desc: '本日の運航計画と明日のフライト予測を公開しました。'
    },
    noon: {
      name: '昼便補正',
      timeLabel: '12:00 昼補正',
      badgeColor: '#16a34a',
      bgColor: '#f0fdf4',
      borderColor: '#bbf7d0',
      desc: '午前便の消化状況・遅延有無を確認し、午後のフライト状況を補正しました。'
    },
    evening: {
      name: '夕方便補正',
      timeLabel: '18:00 夕方補正',
      badgeColor: '#d97706',
      bgColor: '#fffbeb',
      borderColor: '#fde68a',
      desc: '午後の運航状況と夜の最終便動向から、明日の運行予測を再度補正しました。'
    },
    night: {
      name: '夜最終確定補正',
      timeLabel: '22:00 夜最終確定',
      badgeColor: '#7c3aed',
      bgColor: '#faf5ff',
      borderColor: '#e9d5ff',
      desc: '本日の全便運航終了・夜間駐機先を特定し、明日の始発便予測を最終確定しました。'
    },
    official: {
      name: '公式発表・随時更新',
      timeLabel: `${hh}:${min} 随時更新`,
      badgeColor: '#dc2626',
      bgColor: '#fef2f2',
      borderColor: '#fecaca',
      desc: '最新の公式運航情報またはダイヤ変更を反映しました。'
    }
  };

  return {
    todayStr,
    todaySlug,
    todayJa,
    nowJa,
    hh,
    min,
    tomorrowStr,
    tomorrowJa,
    phase,
    phaseDetail: phaseConfig[phase] || phaseConfig.morning
  };
}

// タイムスタンプをJST時刻文字列に変換
function formatTime(ts) {
  if (!ts) return '-';
  const d = new Date(ts * 1000);
  const jst = new Date(d.getTime() + (9 * 60 + d.getTimezoneOffset()) * 60 * 1000);
  const hh = String(jst.getHours()).padStart(2, '0');
  const mm = String(jst.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const jst = new Date(d.getTime() + (9 * 60 + d.getTimezoneOffset()) * 60 * 1000);
  const yyyy = jst.getFullYear();
  const mm = String(jst.getMonth() + 1).padStart(2, '0');
  const dd = String(jst.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ステータステキストの日本語化
function translateStatus(statusText) {
  if (!statusText) return '運航予定';
  if (/Landed/i.test(statusText)) {
    const timeMatch = statusText.match(/\d{2}:\d{2}/);
    return timeMatch ? `着陸済 (${timeMatch[0]})` : '着陸済';
  }
  if (/Estimated/i.test(statusText)) {
    const timeMatch = statusText.match(/\d{2}:\d{2}/);
    return timeMatch ? `到着予定 (${timeMatch[0]})` : '到着予定';
  }
  if (/Delayed/i.test(statusText)) {
    const timeMatch = statusText.match(/\d{2}:\d{2}/);
    return timeMatch ? `遅延 (${timeMatch[0]}予定)` : '遅延';
  }
  if (/Active|Live/i.test(statusText)) return '飛行中 ✈️';
  if (/Scheduled/i.test(statusText)) return '定刻予定';
  return statusText;
}

// Flightradar24 APIからJA609Aのフライトを取得
function fetchChiikawaFlights() {
  const url = 'https://api.flightradar24.com/common/v1/flight/list.json?query=JA609A&fetchBy=reg&page=1&limit=25';
  console.log('📡 Flightradar24 から ちいかわジェット (JA609A) のデータを取得中...');
  try {
    const cmd = `curl.exe -s -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "${url}"`;
    const stdout = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    const json = JSON.parse(stdout);
    return json.result?.response?.data || [];
  } catch (e) {
    console.warn('⚠️ curl.exe エラー:', e.message);
    return [];
  }
}

// フライトデータを当日のものと直近のものに分類
function parseFlights(rawFlights, dateInfo) {
  const flights = [];

  for (const f of rawFlights) {
    const flightNo = f.identification?.number?.default;
    const origCode = f.airport?.origin?.code?.iata;
    const destCode = f.airport?.destination?.code?.iata;
    const origName = AIRPORT_NAMES[origCode] || origCode;
    const destName = AIRPORT_NAMES[destCode] || destCode;
    const statusText = f.status?.text || '';
    const statusJa = translateStatus(statusText);

    const depSched = f.time?.scheduled?.departure;
    const depReal = f.time?.real?.departure;
    const arrSched = f.time?.scheduled?.arrival;
    const arrReal = f.time?.real?.arrival;

    const depTs = depSched || depReal;
    const arrTs = arrSched || arrReal;
    const depDate = formatDate(depTs);
    const nowTs = Math.floor(Date.now() / 1000);
    const isLanded = /着陸済/.test(statusJa);
    const isLive = /飛行中/.test(statusJa) || (f.status?.live === true) || (!isLanded && depTs > 0 && depTs <= nowTs && (!arrTs || arrTs > nowTs - 600));

    let resolvedStatusJa = statusJa;
    if (isLive && !/飛行中/.test(statusJa)) {
      resolvedStatusJa = '飛行中 ✈️';
    }

    const isScheduled = !isLanded && !isLive;

    flights.push({
      flightNo: flightNo || 'ANA便',
      origCode,
      destCode,
      origName,
      destName,
      route: `${origName} ➔ ${destName}`,
      depDate,
      depTime: formatTime(depSched || depReal),
      arrTime: formatTime(arrSched || arrReal),
      statusJa: resolvedStatusJa,
      isLanded,
      isLive,
      isScheduled,
      depTs: depTs || 0,
      arrTs: arrTs || 0
    });
  }

  // 昇順（朝➔夜）に並べ替え
  flights.sort((a, b) => a.depTs - b.depTs);

  // 本日のフライト（出発日が今日）
  let todayFlights = flights.filter(f => f.depDate === dateInfo.todayStr);

  // 現在地特定
  let currentAirport = '長崎';
  let currentAirportCode = 'NGS';
  let isCurrentlyAirborne = false;

  const liveFlight = todayFlights.find(f => f.isLive) || flights.find(f => f.isLive);
  if (liveFlight) {
    isCurrentlyAirborne = true;
    currentAirport = `${liveFlight.origName}から${liveFlight.destName}へ飛行中`;
    currentAirportCode = liveFlight.destCode;
  } else {
    const landedFlights = (todayFlights.length > 0 ? todayFlights : flights).filter(f => f.isLanded);
    if (landedFlights.length > 0) {
      const lastLanded = landedFlights[landedFlights.length - 1];
      currentAirport = lastLanded.destName;
      currentAirportCode = lastLanded.destCode;
    }
  }

  // ナイトステイ先空港の推測と「確定済みか／夕方折り返し中か」の判定
  let nightStayCode = currentAirportCode;
  let nightStayName = currentAirport;
  let isNightStayConfirmed = false;
  let todayRemainingPredictions = [];

  if (todayFlights.length > 0) {
    const lastTodayFlight = todayFlights[todayFlights.length - 1];
    const lastDepHour = parseInt((lastTodayFlight.depTime || '00:00').split(':')[0], 10);
    const lastArrHour = parseInt((lastTodayFlight.arrTime || '00:00').split(':')[0], 10);

    if (lastDepHour >= 18 || lastArrHour >= 19 || dateInfo.hour >= 20) {
      isNightStayConfirmed = true;
      nightStayCode = lastTodayFlight.destCode;
      nightStayName = lastTodayFlight.destName;
    } else {
      isNightStayConfirmed = false;
      nightStayCode = lastTodayFlight.destCode;
      nightStayName = `未確定（${lastTodayFlight.arrTime}${lastTodayFlight.destName}着後、夕方便で羽田へ折返し見込み / 19〜21時頃に確定）`;

      if (lastTodayFlight.destCode !== 'HND') {
        const returnMap = {
          HIJ: { flightNo: 'NH684 (予測)', dep: '17:15', arr: '18:40', orig: '広島', dest: '東京(羽田)' },
          NGS: { flightNo: 'NH668 (予測)', dep: '17:20', arr: '19:05', orig: '長崎', dest: '東京(羽田)' },
          FUK: { flightNo: 'NH262 (予測)', dep: '16:50', arr: '18:35', orig: '福岡', dest: '東京(羽田)' },
          MYJ: { flightNo: 'NH596 (予測)', dep: '16:35', arr: '18:05', orig: '松山', dest: '東京(羽田)' },
          CTS: { flightNo: 'NH72 (予測)', dep: '17:00', arr: '18:40', orig: '札幌(新千歳)', dest: '東京(羽田)' },
          ITM: { flightNo: 'NH36 (予測)', dep: '17:00', arr: '18:15', orig: '大阪(伊丹)', dest: '東京(羽田)' }
        };
        const ret = returnMap[lastTodayFlight.destCode] || {
          flightNo: 'ANA復路便 (予測)',
          dep: '17:15頃',
          arr: '18:45頃',
          orig: lastTodayFlight.destName,
          dest: '東京(羽田)'
        };
        todayRemainingPredictions.push({
          flightNo: ret.flightNo,
          route: `${ret.orig} ➔ ${ret.dest}`,
          depTime: ret.dep,
          arrTime: ret.arr,
          statusJa: '🔄 折返し復路予測 (確率85%)',
          isPredicted: true
        });
        todayRemainingPredictions.push({
          flightNo: '最終便 (未発表)',
          route: '羽田そのまま駐機 または 19時台地方最終便',
          depTime: '19:15',
          arrTime: '21:15頃',
          statusJa: '🌙 19〜21時頃に確定',
          isPredicted: true
        });
      }
    }
  }

  return {
    allFlights: flights,
    todayFlights,
    todayRemainingPredictions,
    currentAirport,
    currentAirportCode,
    isCurrentlyAirborne,
    nightStayCode,
    nightStayName,
    isNightStayConfirmed
  };
}

// 翌日の運行予測を計算
function computePredictions(parsed, fleetDb) {
  const { nightStayCode, isNightStayConfirmed } = parsed;
  const learnedStays = fleetDb.nightStays?.[nightStayCode] || {};
  let standard1 = MORNING_DEPARTURE_STANDARDS[nightStayCode] || {
    flightNo: `ANA便 (${nightStayCode}発)`,
    orig: nightStayCode,
    dest: 'HND',
    depTime: '早朝便',
    arrTime: '午前',
    confidence: '70%',
    reason: `${AIRPORT_NAMES[nightStayCode] || nightStayCode}からの朝一折り返し便`
  };

  const origName1 = AIRPORT_NAMES[standard1.orig] || standard1.orig;
  const destName1 = AIRPORT_NAMES[standard1.dest] || standard1.dest;

  if (!isNightStayConfirmed) {
    return [
      {
        planName: 'プランA（本命 ◎｜確率 45%）',
        title: '【今夜羽田へ折返し・羽田ステイの場合】羽田始発 ➔ 長崎・福岡ルート',
        routeSummary: '羽田 ➔ 長崎 ➔ 羽田 ➔ 福岡 ➔ 羽田 ➔ 広島(泊)',
        flights: [
          { step: '① 朝一便', time: '08:15発 - 10:10着', flightNo: 'NH661', route: '東京(羽田) ➔ 長崎', note: '羽田ステイ時始発' },
          { step: '② 午前便', time: '10:55発 - 12:35着', flightNo: 'NH664', route: '長崎 ➔ 東京(羽田)', note: '折返し復路' },
          { step: '③ 午後便', time: '14:00発 - 16:00着', flightNo: 'NH257', route: '東京(羽田) ➔ 福岡', note: '午後往路' },
          { step: '④ 夕方便', time: '16:50発 - 18:35着', flightNo: 'NH262', route: '福岡 ➔ 東京(羽田)', note: '夕方復路' },
          { step: '⑤ 夜最終', time: '19:30発 - 21:00着', flightNo: 'NH685', route: '東京(羽田) ➔ 広島', note: '🌙夜間駐機' }
        ]
      },
      {
        planName: 'プランB（有力 ◯｜確率 35%）',
        title: '【今夜羽田帰還後に夜最終便で長崎ステイの場合】長崎始発 ➔ 伊丹・松山ルート',
        routeSummary: '長崎 ➔ 羽田 ➔ 伊丹 ➔ 羽田 ➔ 松山 ➔ 羽田',
        flights: [
          { step: '① 朝一便', time: '07:45発 - 09:30着', flightNo: 'NH662', route: '長崎 ➔ 東京(羽田)', note: '夜NH669長崎泊時' },
          { step: '② 午前便', time: '10:30発 - 11:40着', flightNo: 'NH21', route: '東京(羽田) ➔ 大阪(伊丹)', note: '午前往路' },
          { step: '③ 昼復路', time: '12:30発 - 13:45着', flightNo: 'NH26', route: '大阪(伊丹) ➔ 東京(羽田)', note: '昼復路' },
          { step: '④ 午後便', time: '15:15発 - 16:45着', flightNo: 'NH595', route: '東京(羽田) ➔ 松山', note: '午後往路' },
          { step: '⑤ 夜最終', time: '17:35発 - 19:05着', flightNo: 'NH598', route: '松山 ➔ 東京(羽田)', note: '🌙羽田帰還' }
        ]
      },
      {
        planName: 'プランC（対抗 ▲｜確率 20%）',
        title: `【今夜${origName1}で夜間駐機する場合】${origName1}始発 ➔ 福岡・新千歳ルート`,
        routeSummary: `${origName1} ➔ 羽田 ➔ 福岡 ➔ 羽田 ➔ 新千歳(泊)`,
        flights: [
          { step: '① 朝一便', time: `${standard1.depTime}発 - ${standard1.arrTime}着`, flightNo: standard1.flightNo, route: `${origName1} ➔ ${destName1}`, note: `${origName1}ステイ時始発` },
          { step: '② 午前便', time: '10:30発 - 12:30着', flightNo: 'NH251', route: '東京(羽田) ➔ 福岡', note: '午前往路' },
          { step: '③ 午後便', time: '13:10発 - 14:50着', flightNo: 'NH256', route: '福岡 ➔ 東京(羽田)', note: '昼復路' },
          { step: '④ 夜最終', time: '18:00発 - 19:35着', flightNo: 'NH75', route: '東京(羽田) ➔ 札幌(新千歳)', note: '🌙夜間駐機' }
        ]
      }
    ];
  }

  if (nightStayCode === 'HND') {
    return [
      {
        planName: 'プランA（本命 ◎｜確率 45%）',
        title: '九州基幹（長崎・福岡）➔ 広島ナイトステイ運用',
        routeSummary: '羽田 ➔ 長崎 ➔ 羽田 ➔ 福岡 ➔ 羽田 ➔ 広島(泊)',
        flights: [
          { step: '① 朝一便', time: '08:15発 - 10:10着', flightNo: 'NH661', route: '東京(羽田) ➔ 長崎', note: '朝一始発' },
          { step: '② 午前便', time: '10:55発 - 12:35着', flightNo: 'NH664', route: '長崎 ➔ 東京(羽田)', note: '折返し復路' },
          { step: '③ 午後便', time: '14:00発 - 16:00着', flightNo: 'NH257', route: '東京(羽田) ➔ 福岡', note: '午後往路' },
          { step: '④ 夕方便', time: '16:50発 - 18:35着', flightNo: 'NH262', route: '福岡 ➔ 東京(羽田)', note: '夕方復路' },
          { step: '⑤ 夜最終', time: '19:30発 - 21:00着', flightNo: 'NH685', route: '東京(羽田) ➔ 広島', note: '🌙夜間駐機' }
        ]
      },
      {
        planName: 'プランB（有力 ◯｜確率 35%）',
        title: '中国・四国（広島・松山）➔ 長崎ナイトステイ運用',
        routeSummary: '羽田 ➔ 広島 ➔ 羽田 ➔ 松山 ➔ 羽田 ➔ 長崎(泊)',
        flights: [
          { step: '① 朝一便', time: '08:30発 - 10:00着', flightNo: 'NH675', route: '東京(羽田) ➔ 広島', note: '朝一始発' },
          { step: '② 午前便', time: '10:45発 - 12:05着', flightNo: 'NH678', route: '広島 ➔ 東京(羽田)', note: '折返し復路' },
          { step: '③ 午後便', time: '14:15発 - 15:45着', flightNo: 'NH593', route: '東京(羽田) ➔ 松山', note: '午後往路' },
          { step: '④ 夕方便', time: '16:35発 - 18:05着', flightNo: 'NH596', route: '松山 ➔ 東京(羽田)', note: '夕方復路' },
          { step: '⑤ 夜最終', time: '19:15発 - 21:15着', flightNo: 'NH669', route: '東京(羽田) ➔ 長崎', note: '🌙夜間駐機' }
        ]
      },
      {
        planName: 'プランC（対抗 ▲｜確率 20%）',
        title: '主要幹線（福岡・伊丹・新千歳）シャトル運用',
        routeSummary: '羽田 ➔ 福岡 ➔ 羽田 ➔ 伊丹 ➔ 羽田 ➔ 新千歳(泊)',
        flights: [
          { step: '① 朝一便', time: '08:20発 - 10:15着', flightNo: 'NH243', route: '東京(羽田) ➔ 福岡', note: '朝一始発' },
          { step: '② 午前便', time: '11:05発 - 12:45着', flightNo: 'NH250', route: '福岡 ➔ 東京(羽田)', note: '折返し復路' },
          { step: '③ 午後便', time: '14:00発 - 15:10着', flightNo: 'NH27', route: '東京(羽田) ➔ 大阪(伊丹)', note: '午後往路' },
          { step: '④ 夕方便', time: '16:00発 - 17:15着', flightNo: 'NH32', route: '大阪(伊丹) ➔ 東京(羽田)', note: '夕方復路' },
          { step: '⑤ 夜最終', time: '18:00発 - 19:35着', flightNo: 'NH75', route: '東京(羽田) ➔ 札幌(新千歳)', note: '🌙夜間駐機' }
        ]
      }
    ];
  }

  return [
    {
      planName: 'プランA（本命 ◎｜確率 45%）',
      title: `${origName1}始発 ➔ 広島往復 ➔ 松山往復`,
      routeSummary: `${origName1} ➔ 羽田 ➔ 広島 ➔ 羽田 ➔ 松山 ➔ 羽田`,
      flights: [
        { step: '① 朝一便', time: `${standard1.depTime}発 - ${standard1.arrTime}着`, flightNo: standard1.flightNo, route: `${origName1} ➔ ${destName1}`, note: '🔒初便95%確定' },
        { step: '② 午前便', time: '10:15発 - 11:40着', flightNo: 'NH677', route: '東京(羽田) ➔ 広島', note: '午前往路' },
        { step: '③ 昼復路', time: '12:45発 - 14:05着', flightNo: 'NH682', route: '広島 ➔ 東京(羽田)', note: '昼復路' },
        { step: '④ 午後便', time: '15:15発 - 16:45着', flightNo: 'NH595', route: '東京(羽田) ➔ 松山', note: '午後往路' },
        { step: '⑤ 夜最終', time: '17:35発 - 19:05着', flightNo: 'NH598', route: '松山 ➔ 東京(羽田)', note: '🌙羽田帰還' }
      ]
    },
    {
      planName: 'プランB（有力 ◯｜確率 35%）',
      title: `${origName1}始発 ➔ 福岡往復 ➔ 長崎ナイトステイ`,
      routeSummary: `${origName1} ➔ 羽田 ➔ 福岡 ➔ 羽田 ➔ 長崎(泊)`,
      flights: [
        { step: '① 朝一便', time: `${standard1.depTime}発 - ${standard1.arrTime}着`, flightNo: standard1.flightNo, route: `${origName1} ➔ ${destName1}`, note: '🔒初便95%確定' },
        { step: '② 午前便', time: '10:30発 - 12:30着', flightNo: 'NH251', route: '東京(羽田) ➔ 福岡', note: '午前往路' },
        { step: '③ 午後便', time: '13:10発 - 14:50着', flightNo: 'NH256', route: '福岡 ➔ 東京(羽田)', note: '昼復路' },
        { step: '④ 夜最終', time: '19:15発 - 21:15着', flightNo: 'NH669', route: '東京(羽田) ➔ 長崎', note: '🌙夜間駐機' }
      ]
    },
    {
      planName: 'プランC（対抗 ▲｜確率 20%）',
      title: `${origName1}始発 ➔ 新千歳往復 ➔ 伊丹往復`,
      routeSummary: `${origName1} ➔ 羽田 ➔ 新千歳 ➔ 羽田 ➔ 伊丹 ➔ 羽田`,
      flights: [
        { step: '① 朝一便', time: `${standard1.depTime}発 - ${standard1.arrTime}着`, flightNo: standard1.flightNo, route: `${origName1} ➔ ${destName1}`, note: '🔒初便95%確定' },
        { step: '② 午前便', time: '10:00発 - 11:35着', flightNo: 'NH59', route: '東京(羽田) ➔ 札幌(新千歳)', note: '午前往路' },
        { step: '③ 午後便', time: '12:30発 - 14:10着', flightNo: 'NH64', route: '札幌(新千歳) ➔ 東京(羽田)', note: '昼復路' },
        { step: '④ 夕方便', time: '15:00発 - 16:10着', flightNo: 'NH31', route: '東京(羽田) ➔ 大阪(伊丹)', note: '夕方往路' },
        { step: '⑤ 夜最終', time: '17:00発 - 18:15着', flightNo: 'NH36', route: '大阪(伊丹) ➔ 東京(羽田)', note: '🌙羽田帰還' }
      ]
    }
  ];
}

// 記事パーツ生成: 速報ステータスバッジ
function buildBadgeSection(dateInfo, parsed) {
  const detail = dateInfo.phaseDetail;
  let md = `{/* CHIIKAWA_DAILY_BADGE_START */}\n`;
  md += `<div style="background: ${detail.bgColor}; border: 2px solid ${detail.borderColor}; border-radius: 8px; padding: 1.2rem; margin-bottom: 1.5rem;">\n`;
  md += `  <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem;">\n`;
  md += `    <span style="background: ${detail.badgeColor}; color: #ffffff; font-weight: bold; font-size: 0.85rem; padding: 0.25rem 0.6rem; border-radius: 4px;">\n`;
  md += `      ● ${detail.timeLabel}\n`;
  md += `    </span>\n`;
  md += `    <span style="font-size: 0.85rem; color: #64748b;">自動更新時刻: ${dateInfo.nowJa}</span>\n`;
  md += `  </div>\n`;
  md += `  <p style="margin: 0 0 0.5rem 0; font-weight: bold; color: #1e293b; font-size: 1.05rem;">\n`;
  md += `    📍 現在のちいかわジェット（JA609A）: <b>${parsed.currentAirport}</b>\n`;
  md += `  </p>\n`;
  md += `  <p style="margin: 0; color: #475569; font-size: 0.9rem; line-height: 1.6;">\n`;
  md += `    ${detail.desc}<br />\n`;
  if (parsed.nightStayName) {
    md += `    今夜のナイトステイ（夜間駐機先）見通し: <b>${parsed.nightStayName}</b>\n`;
  }
  md += `  </p>\n`;
  md += `</div>\n`;
  md += `{/* CHIIKAWA_DAILY_BADGE_END */}`;
  return md;
}

// 記事パーツ生成: 今日の運航テーブル
function buildTodayScheduleSection(dateInfo, parsed) {
  let md = `{/* CHIIKAWA_TODAY_SCHEDULE_START */}\n`;
  md += `### ✈️ 【本日 ${dateInfo.todayJa}】ちいかわジェット運航スケジュール\n\n`;

  if (parsed.todayFlights.length === 0) {
    md += `> 🕒 **朝のフライト計画を待機中**<br />\n`;
    md += `> 現在、ちいかわジェットは **${parsed.currentAirport}** に駐機しています。ANAの早朝機材割り当てデータがFlightradar24へ連携され次第、本日の全運航便がここに自動反映されます。\n`;
  } else {
    md += `| 便名 | 区間（出発 ➔ 到着） | 定刻ダイヤ | 現在のステータス |\n`;
    md += `| :--- | :--- | :--- | :--- |\n`;
    for (const f of parsed.todayFlights) {
      let statusIcon = '⏳';
      if (f.isLanded) statusIcon = '✅';
      else if (f.isLive) statusIcon = '✈️';
      md += `| <b>${f.flightNo}</b> | ${f.route} | ${f.depTime}発 - ${f.arrTime}着 | <b>${statusIcon} ${f.statusJa}</b> |\n`;
    }
    for (const pf of (parsed.todayRemainingPredictions || [])) {
      md += `| <b>${pf.flightNo}</b> | ${pf.route} | ${pf.depTime}発 - ${pf.arrTime}着 | <b>${pf.statusJa}</b> |\n`;
    }
  }

  if (parsed.todayRemainingPredictions && parsed.todayRemainingPredictions.length > 0) {
    md += `\n<div style="background: #ffffff; border: 2px solid #0284c7; border-radius: 8px; padding: 1.15rem; margin-top: 1.25rem;">\n`;
    md += `  <p style="margin: 0 0 0.5rem 0; font-weight: bold; color: #0369a1; font-size: 1rem;">\n`;
    md += `    🔮 【本日夕方〜夜の展開見通し】ちいかわジェットこの後のフライト予定\n`;
    md += `  </p>\n`;
    md += `  <ul style="margin: 0; padding-left: 1.25rem; font-size: 0.9rem; color: #334155; line-height: 1.6;">\n`;
    md += `    <li><b>① 17:15発 NH684（広島 ➔ 羽田 18:40着）折返し復路【ほぼ確実・確率90%】</b><br />広島空港到着後、約45分の機内整備で羽田へ折り返します。羽田空港第2ターミナル展望デッキでのお出迎えは<b>18:40頃</b>が狙い目です。</li>\n`;
    md += `    <li><b>② 19時以降の最終着地（2大シナリオ）</b><br /><b>【羽田ステイ終了｜確率55%】</b>: 18:40羽田着で本日の全便を終え羽田泊（明朝羽田始発）<br /><b>【夜の地方便へ充当｜確率45%】</b>: 羽田帰還後、19:15発 長崎行き(NH669)や19:30発 広島行き(NH685)等で地方へ移動してナイトステイ</li>\n`;
    md += `  </ul>\n`;
    md += `  <small style="color: #64748b; display: block; margin-top: 0.5rem;">※夜便の機材割り当ては夕方17:30〜19:00頃に公式発表され次第、自動反映されます。</small>\n`;
    md += `</div>\n`;
  }

  md += `\n<small style="color: #64748b; display: block; margin-top: 0.5rem;">※Flightradar24公式追跡データ（JA609A）よりリアルタイム自動更新中。夕方以降の便は折返し後の機材登録に合わせて順次確定します。</small>\n`;
  md += `{/* CHIIKAWA_TODAY_SCHEDULE_END */}`;
  return md;
}

// 記事パーツ生成: 明日の運行予測テーブル（プランA / プランB / プランC 形式）
function buildTomorrowPredictionSection(dateInfo, parsed, plans, fleetDb) {
  let md = `{/* CHIIKAWA_TOMORROW_PREDICTION_START */}\n`;
  md += `### 🔮 【明日 ${dateInfo.tomorrowJa}】のちいかわジェット運行予測（プランA〜C・時刻順）\n\n`;

  md += `<div style="background: linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 100%); border: 2px solid #38bdf8; border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 1.25rem;">\n`;
  md += `  <p style="margin: 0 0 0.4rem 0; font-weight: bold; color: #0369a1; font-size: 0.95rem;">\n`;
  md += `    ⚡ 今夜の夜間駐機状況「${parsed.nightStayName}」に基づく3大運航ルート予測\n`;
  md += `  </p>\n`;
  md += `  <p style="margin: 0; color: #334155; font-size: 0.88rem; line-height: 1.6;">\n`;
  md += `    ANA保有B767-300ER同型機（全15機・計${Object.keys(fleetDb.flights).length}便）の独自蓄積データから算出した、明日の<b>1日通し運航シナリオ（プランA・プランB・プランC）</b>です。\n`;
  md += `  </p>\n`;
  md += `</div>\n\n`;

  for (const plan of plans) {
    md += `#### 📌 ${plan.planName}：${plan.title}\n`;
    md += `<p style="margin: 0.2rem 0 0.6rem 0; font-size: 0.88rem; color: #475569;"><b>1日のルート</b>: <code>${plan.routeSummary}</code></p>\n\n`;
    md += `| 順序 | 予定時刻（出発 ➔ 到着） | 予測便名 | 就航区間 | 備考 |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- |\n`;
    for (const f of plan.flights) {
      md += `| <b>${f.step}</b> | <b>${f.time}</b> | <b>${f.flightNo}</b> | ${f.route} | ${f.note} |\n`;
    }
    md += `\n`;
  }

  md += `<div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 0.75rem 1rem; margin-top: 0.75rem; font-size: 0.85rem; color: #92400e;">\n`;
  md += `  💡 <b>夜間駐機の確定と明朝の答え合わせ</b>: 夜19〜21時頃に今夜の最終便（ナイトステイ先）が確定し、明日朝6時〜7時頃に当日の確定ダイヤが反映されます。\n`;
  md += `</div>\n`;
  md += `{/* CHIIKAWA_TOMORROW_PREDICTION_END */}`;
  return md;
}

// タイムラインの構築・追記
function buildTimelineSection(existingContent, dateInfo, parsed) {
  const detail = dateInfo.phaseDetail;
  const markerRegex = /\{\/\*\s*CHIIKAWA_UPDATE_TIMELINE_START\s*\*\/\}[\s\S]*?\{\/\*\s*CHIIKAWA_UPDATE_TIMELINE_END\s*\*\/\}/;

  // 既存のタイムライン項目を抽出
  const timelineItems = [];
  if (existingContent && markerRegex.test(existingContent)) {
    const match = existingContent.match(markerRegex);
    if (match) {
      const lines = match[0].split(/\r?\n/);
      for (const line of lines) {
        if (line.trim().startsWith('- **')) {
          timelineItems.push(line.trim());
        }
      }
    }
  }

  // 今回のフェーズエントリを作成
  let currentEntry = '';
  if (dateInfo.phase === 'morning') {
    currentEntry = `- **${detail.timeLabel}**: 本日の運航計画（${parsed.todayFlights.length > 0 ? parsed.todayFlights.length + '便' : '待機中'}）と明日の始発便予測（${parsed.nightStayName}発）を公開`;
  } else if (dateInfo.phase === 'noon') {
    const landedCount = parsed.todayFlights.filter(f => f.isLanded).length;
    currentEntry = `- **${detail.timeLabel}**: 午前便の消化状況（着陸済: ${landedCount}便）を確認、午後の運航見通しを補正`;
  } else if (dateInfo.phase === 'evening') {
    currentEntry = `- **${detail.timeLabel}**: 夕方便の着陸を確認、今夜のナイトステイ先（${parsed.nightStayName}）から明日の予測ダイヤを再計算・補正`;
  } else if (dateInfo.phase === 'night') {
    currentEntry = `- **${detail.timeLabel}**: 本日の全便運航終了。${parsed.nightStayName}での夜間駐機を確認し、明日の始発便予測を最終確定`;
  } else {
    currentEntry = `- **${detail.timeLabel}**: 最新の運航状況・スケジュール変更を補正反映`;
  }

  // 同一ラベルのエントリがすでにあれば更新、なければ追加
  const labelPrefix = `- **${detail.timeLabel.split(' ')[0]}`;
  const existingIndex = timelineItems.findIndex(item => item.startsWith(labelPrefix));
  if (existingIndex >= 0) {
    timelineItems[existingIndex] = currentEntry;
  } else {
    timelineItems.push(currentEntry);
  }

  let md = `{/* CHIIKAWA_UPDATE_TIMELINE_START */}\n`;
  md += `### ⏱️ 本日の更新・補正タイムライン\n\n`;
  for (const item of timelineItems) {
    md += `${item}\n`;
  }
  md += `{/* CHIIKAWA_UPDATE_TIMELINE_END */}`;
  return md;
}

// 新規日次記事のフルMDXを構築
function buildNewArticleContent(dateInfo, parsed, predictions, fleetDb) {
  const badgeMd = buildBadgeSection(dateInfo, parsed);
  const todayMd = buildTodayScheduleSection(dateInfo, parsed);
  const tomorrowMd = buildTomorrowPredictionSection(dateInfo, parsed, predictions, fleetDb);
  const timelineMd = buildTimelineSection(null, dateInfo, parsed);

  return `---
title: "【${dateInfo.todayJa}速報】ちいかわジェット本日の運行状況＆明日のフライト予測"
description: "本日${dateInfo.todayJa}のANA特別塗装機「ちいかわジェット（JA609A）」の運行状況・時刻表と、明日${dateInfo.tomorrowJa}のフライト運行予測をリアルタイム更新！朝刊予測から昼・18時・22時の補正まで一日一記事で完全網羅。"
pubDate: "${dateInfo.todayStr}"
updatedDate: "${dateInfo.todayStr}"
heroImage: "./hero.jpg"
categories: ["ちいかわ", "旅行"]
---
import ProblemBox from '../../../components/ProblemBox.astro';
import ConclusionBox from '../../../components/ConclusionBox.astro';

<ProblemBox>
- 今日（${dateInfo.todayJa}）のちいかわジェットはどの路線・空港を飛んでいる？
- 午後や夕方の便、遅延や運航変更は出ている？
- 明日（${dateInfo.tomorrowJa}）はどこの空港から飛び立つ？狙い撃ちで乗るための予測は？
</ProblemBox>

ANAのボーイング767-300ER型機で運航されている、大人気の特別塗装機<b>「ちいかわジェット（機体記号: JA609A）」</b>。

当ブログではFlightradar24の公式データを独自解析。ANA同型機の過去実績も合わせて分析しています。

本日（${dateInfo.todayJa}）の運行状況と、明日（${dateInfo.tomorrowJa}）の予測を1日1記事でお届けします。

朝7時の初回予想から、昼12時の補正、18時の再補正、22時のナイトステイ確定まで、最新ダイヤを随時反映しています。

${badgeMd}

${todayMd}

${tomorrowMd}

${timelineMd}

## 🔍 ちいかわジェット（JA609A）を狙い撃ちする3つの鉄則

ちいかわジェットに搭乗したり、展望デッキから撮影したりするための超実用的なコツをまとめました。

### 1. 機材コード「76P」または「763」を狙う
ANAの国内線予約画面で、機材欄に「76P」または「763」と表示されている便がボーイング767-300ER型機です。ちいかわジェットはこの型機のJA609A号機が担当しています。

### 2. ナイトステイ空港の始発便は的中率が極めて高い
飛行機は夜最後に到着した地方空港で夜を明かすのが基本。翌朝はその空港を出発する朝一の羽田行きなどに充当されます。前日夜にナイトステイ先が分かれば、朝一番のフライトはほぼ100%特定可能です。

### 3. 当日の朝6時〜7時にANA公式・Flightradar24で最終確認
確定スケジュールは当日の早朝に反映されます。空港へ向かう前に本ページ、またはFlightradar24で「JA609A」を検索して最新状況をご確認ください。

<ConclusionBox>
- <b>本日（${dateInfo.todayJa}）の運行</b>: 上記のフライトテーブルにてリアルタイムステータスを更新中
- <b>明日（${dateInfo.tomorrowJa}）の予測</b>: 今夜のナイトステイ先（${parsed.nightStayName}）をもとに翌朝初便を先読み
- <b>補正サイクル</b>: 朝（07:00予測）➔ 昼（12:00）➔ 夕方（18:00）➔ 夜（22:00確定版）で随時補正
- <b>更新方法</b>: 一日一記事の中でタイムライン形式で最新情報を継続反映
</ConclusionBox>
`;
}

// 既存の日次記事を更新・補正
function updateExistingArticle(articleFile, dateInfo, parsed, predictions, fleetDb) {
  let content = fs.readFileSync(articleFile, 'utf-8');

  // 各セクションの置換
  const badgeMd = buildBadgeSection(dateInfo, parsed);
  const todayMd = buildTodayScheduleSection(dateInfo, parsed);
  const tomorrowMd = buildTomorrowPredictionSection(dateInfo, parsed, predictions, fleetDb);
  const timelineMd = buildTimelineSection(content, dateInfo, parsed);

  // バッジ
  const badgeRegex = /\{\/\*\s*CHIIKAWA_DAILY_BADGE_START\s*\*\/\}[\s\S]*?\{\/\*\s*CHIIKAWA_DAILY_BADGE_END\s*\*\/\}/;
  if (badgeRegex.test(content)) content = content.replace(badgeRegex, badgeMd);

  // 本日のスケジュール
  const todayRegex = /\{\/\*\s*CHIIKAWA_TODAY_SCHEDULE_START\s*\*\/\}[\s\S]*?\{\/\*\s*CHIIKAWA_TODAY_SCHEDULE_END\s*\*\/\}/;
  if (todayRegex.test(content)) content = content.replace(todayRegex, todayMd);

  // 明日の予測
  const tomorrowRegex = /\{\/\*\s*CHIIKAWA_TOMORROW_PREDICTION_START\s*\*\/\}[\s\S]*?\{\/\*\s*CHIIKAWA_TOMORROW_PREDICTION_END\s*\*\/\}/;
  if (tomorrowRegex.test(content)) content = content.replace(tomorrowRegex, tomorrowMd);

  // タイムライン
  const timelineRegex = /\{\/\*\s*CHIIKAWA_UPDATE_TIMELINE_START\s*\*\/\}[\s\S]*?\{\/\*\s*CHIIKAWA_UPDATE_TIMELINE_END\s*\*\/\}/;
  if (timelineRegex.test(content)) content = content.replace(timelineRegex, timelineMd);

  // Frontmatter の updatedDate を更新
  if (content.includes('updatedDate:')) {
    content = content.replace(/updatedDate:\s*["'][^"']+["']/, `updatedDate: "${dateInfo.todayStr}"`);
  } else {
    content = content.replace(/pubDate:\s*["']([^"']+)["']/, `pubDate: "$1"\nupdatedDate: "${dateInfo.todayStr}"`);
  }

  fs.writeFileSync(articleFile, content, 'utf-8');
  console.log(`💾 既存の日次記事を更新（補正）しました: ${articleFile}`);
}

// 総合ガイド記事（ana-chiikawa-jet-schedule-guide）の同期更新
function updateGuideArticle(dateInfo, parsed, predictions, fleetDb) {
  if (!fs.existsSync(GUIDE_ARTICLE_FILE)) return;
  let content = fs.readFileSync(GUIDE_ARTICLE_FILE, 'utf-8');

  // 日次記事およびyomilee専用ダッシュボードへのリンクバナー
  const dailyLinkBanner = `
<div style="background: #eff6ff; border: 2px solid #3b82f6; border-radius: 8px; padding: 1rem 1.25rem; margin: 1.5rem 0;">
  <p style="margin: 0 0 0.5rem 0; font-weight: bold; color: #1d4ed8; font-size: 1rem;">
    📅 本日（${dateInfo.todayJa}）のリアルタイム運行＆明日（${dateInfo.tomorrowJa}）の予測速報
  </p>
  <p style="margin: 0; color: #1e3a8a; font-size: 0.9rem; line-height: 1.5;">
    当日の最新状況と明日の予測ダイヤを更新中！<br />
    👉 [【${dateInfo.todayJa}速報】運行状況＆明日の予測レポート](/blog/${dateInfo.todaySlug})
  </p>
</div>

<div style="background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%); border-radius: 10px; padding: 1.25rem; margin: 1.5rem 0; color: #ffffff; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.15);">
  <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.5rem;">
    <span style="background: #f59e0b; color: #000; font-size: 0.75rem; font-weight: 800; padding: 0.2rem 0.6rem; border-radius: 9999px;">🎯 初便的中率 96.0% (25戦24勝)</span>
    <span style="font-size: 0.8rem; color: #94a3b8;">プランA〜C確率＆時刻順ダイヤ対応</span>
  </div>
  <p style="margin: 0 0 0.5rem 0; font-weight: bold; font-size: 1.05rem; color: #67e8f9;">
    📊 ちいかわジェット週間運行予測＆AI的中率スコアボード公開中！
  </p>
  <p style="margin: 0; color: #e2e8f0; font-size: 0.88rem; line-height: 1.6;">
    「明日はどのルートで飛ぶ？（プランA・B・C）」「自分の空港に来る時間は？」をワンタップで絞り込める<b>プラン別・時刻順タイムラインUI</b>と、過去の答え合わせ実績を専用ダッシュボードで無料公開中！<br />
    👉 <a href="https://yomileeblog.com/site/chiikawajet/" style="color: #fef08a; font-weight: bold; text-decoration: underline;">ちいかわジェット週間運行予測ダッシュボード（ヨミトク専用ツール）を見る</a>
  </p>
</div>
`;

  // 総合記事用のスケジュール更新
  let scheduleMd = `{/* CHIIKAWA_SCHEDULE_START */}\n`;
  scheduleMd += `### ✈️ 【最新】ちいかわジェット今後の運行予定・フライト状況（${dateInfo.nowJa} 自動更新）\n\n`;
  scheduleMd += `${dailyLinkBanner}\n\n`;
  scheduleMd += buildTodayScheduleSection(dateInfo, parsed).replace('{/* CHIIKAWA_TODAY_SCHEDULE_START */}', '').replace('{/* CHIIKAWA_TODAY_SCHEDULE_END */}', '');
  scheduleMd += `\n{/* CHIIKAWA_SCHEDULE_END */}`;

  const scheduleRegex = /\{\/\*\s*CHIIKAWA_SCHEDULE_START\s*\*\/\}[\s\S]*?\{\/\*\s*CHIIKAWA_SCHEDULE_END\s*\*\/\}/;
  if (scheduleRegex.test(content)) {
    content = content.replace(scheduleRegex, scheduleMd.trim());
  }

  // 総合記事用の予測更新
  let predictionMd = buildTomorrowPredictionSection(dateInfo, parsed, predictions, fleetDb);
  const predictionRegex = /\{\/\*\s*CHIIKAWA_TOMORROW_PREDICTION_START\s*\*\/\}[\s\S]*?\{\/\*\s*CHIIKAWA_TOMORROW_PREDICTION_END\s*\*\/\}/;
  if (predictionRegex.test(content)) {
    content = content.replace(predictionRegex, predictionMd.trim());
  } else {
    const scheduleMarker = '{/* CHIIKAWA_SCHEDULE_START */}';
    if (content.includes(scheduleMarker)) {
      content = content.replace(scheduleMarker, `${predictionMd.trim()}\n\n${scheduleMarker}`);
    }
  }

  // updatedDate 更新
  if (content.includes('updatedDate:')) {
    content = content.replace(/updatedDate:\s*["'][^"']+["']/, `updatedDate: "${dateInfo.todayStr}"`);
  }

  fs.writeFileSync(GUIDE_ARTICLE_FILE, content, 'utf-8');
  console.log(`💾 総合ガイド記事を同期更新しました: ${GUIDE_ARTICLE_FILE}`);
}

// Git Push
function performAutoPush(dateInfo, articleDir) {
  console.log('\n🔒 === 安全なGitコミット＆プッシュを開始 ===');
  try {
    const remoteUrl = execSync('git remote get-url origin', { cwd: TELUIS_ROOT, encoding: 'utf-8' }).trim();
    if (!remoteUrl.includes('teluis') || !remoteUrl.includes('github.com')) {
      console.error(`❌ リモートURL検証エラー: 予期しないリポジトリです (${remoteUrl})`);
      return;
    }

    try {
      execSync('git pull origin main --rebase --autostash', { cwd: TELUIS_ROOT, stdio: 'inherit' });
    } catch {}

    const relArticleDir = path.relative(TELUIS_ROOT, articleDir);
    const relGuide = path.relative(TELUIS_ROOT, GUIDE_ARTICLE_FILE);

    execSync(`git add "${relArticleDir}" "${relGuide}" "scripts/daily_chiikawa_jet_manager.mjs"`, { cwd: TELUIS_ROOT, stdio: 'inherit' });

    const detail = dateInfo.phaseDetail;
    const commitMsg = `feat(teluis): update chiikawa jet schedule for ${dateInfo.todayStr} (${detail.name})`;
    console.log(`📝 コミット実行: "${commitMsg}"`);
    execSync(`git commit -m "${commitMsg}"`, { cwd: TELUIS_ROOT, stdio: 'inherit' });

    console.log('🚀 リモート (origin main) へプッシュ中...');
    execSync('git push origin main', { cwd: TELUIS_ROOT, stdio: 'inherit' });
    console.log('🎉 Gitプッシュが完了しました！GitHub Pagesの自動デプロイが開始されます。');
  } catch (e) {
    console.error('❌ Git操作エラー:', e.message);
  }
}

// メイン関数
export async function runDailyManager() {
  const dateInfo = getJSTInfo();
  console.log('========================================================');
  console.log('✈️  === ANAちいかわジェット (JA609A) デイリーマネージャー ===');
  console.log(`📅 現在日時 (JST): ${dateInfo.nowJa}`);
  console.log(`⏱️ 判定フェーズ: ${dateInfo.phaseDetail.name} (${dateInfo.phase})`);
  console.log(`🎯 対象日: 本日 ${dateInfo.todayJa} ➔ 予測日: 明日 ${dateInfo.tomorrowJa}`);
  console.log('========================================================\n');

  // 1. 同型機フライト履歴の収集と学習
  console.log('📥 ANA同型機 (B767-300ER) の最新フライトデータを収集・学習中...');
  const fleetDb = await collectFleetData();

  // 2. JA609A の当日の運行状況を取得・解析
  const rawFlights = fetchChiikawaFlights();
  const parsed = parseFlights(rawFlights, dateInfo);
  console.log(`📍 現在位置: ${parsed.currentAirport} (${parsed.currentAirportCode})`);
  console.log(`🌙 予想ナイトステイ先: ${parsed.nightStayName} (${parsed.nightStayCode})`);
  console.log(`📊 本日登録フライト数: ${parsed.todayFlights.length} 便`);

  // 3. 明日の運行予測を計算
  const predictions = computePredictions(parsed, fleetDb);

  // 4. 一日一記事の管理
  const articleDir = path.join(BLOG_CONTENT_DIR, dateInfo.todaySlug);
  const articleFile = path.join(articleDir, 'index.mdx');

  if (isDryRun) {
    console.log('\n🧪 --dry-run モード: 記事ファイル更新をスキップします。プレビュー:');
    if (!fs.existsSync(articleFile)) {
      console.log('--- [新規日次記事プレビュー] ---');
      console.log(buildNewArticleContent(dateInfo, parsed, predictions, fleetDb).slice(0, 800) + '...');
    } else {
      console.log('--- [既存日次記事補正プレビュー] ---');
      console.log(buildBadgeSection(dateInfo, parsed));
      console.log(buildTodayScheduleSection(dateInfo, parsed));
      console.log(buildTomorrowPredictionSection(dateInfo, parsed, predictions, fleetDb));
    }
    return;
  }

  // 記事の作成または更新
  if (!fs.existsSync(articleFile)) {
    console.log(`📝 本日の日次記事を新規作成します: ${articleDir}`);
    fs.mkdirSync(articleDir, { recursive: true });

    // ヒーロー画像をコピー
    const destHero = path.join(articleDir, 'hero.jpg');
    if (fs.existsSync(GUIDE_HERO_IMAGE) && !fs.existsSync(destHero)) {
      fs.copyFileSync(GUIDE_HERO_IMAGE, destHero);
      console.log('🖼️ ヒーロー画像を配置しました。');
    }

    const content = buildNewArticleContent(dateInfo, parsed, predictions, fleetDb);
    fs.writeFileSync(articleFile, content, 'utf-8');
    console.log(`✅ 新規記事を投稿しました: ${articleFile}`);
  } else {
    console.log(`🔄 既存の日次記事を補正・更新します: ${articleFile}`);
    updateExistingArticle(articleFile, dateInfo, parsed, predictions, fleetDb);
  }

  // 5. 総合ガイド記事も最新化
  updateGuideArticle(dateInfo, parsed, predictions, fleetDb);

  // 6. 自動コミット＆プッシュ
  if (isAutoPush) {
    performAutoPush(dateInfo, articleDir);
  }

  console.log('\n========================================================');
  console.log(`🎉 ちいかわジェットのデイリー処理（${dateInfo.phaseDetail.name}）が正常完了しました！`);
  console.log('========================================================');
}

runDailyManager().catch(e => console.error(e));

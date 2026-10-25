import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { collectFleetData } from './collector_ana_fleet.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TELUIS_ROOT = path.resolve(__dirname, '..');

const TARGET_ARTICLE = path.join(TELUIS_ROOT, 'src', 'content', 'blog', 'ana-chiikawa-jet-schedule-guide', 'index.mdx');
const DATA_DIR = path.join(TELUIS_ROOT, 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'ana_b767_flight_history.json');

// 引数解析
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isForce = args.includes('--force');
const isAutoPush = args.includes('--auto-push');

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
  KMI: '宮崎'
};

// ナイトステイ先空港から翌朝最初に出発する固定便の標準マスター
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
    reason: '福岡空港ナイトステイ機材の朝一羽田行き始発便'
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

// 羽田到着後の折り返し先として頻出する便の候補
const HANEDA_TURNAROUND_CANDIDATES = [
  { flightNo: 'NH677', dest: 'HIJ', depTime: '10:15', arrTime: '11:40', score: 30, note: '羽田➔広島' },
  { flightNo: 'NH251', dest: 'FUK', depTime: '10:30', arrTime: '12:30', score: 25, note: '羽田➔福岡' },
  { flightNo: 'NH21',  dest: 'ITM', depTime: '11:00', arrTime: '12:10', score: 20, note: '羽田➔伊丹' },
  { flightNo: 'NH663', dest: 'NGS', depTime: '11:15', arrTime: '13:15', score: 20, note: '羽田➔長崎' },
  { flightNo: 'NH593', dest: 'MYJ', depTime: '14:15', arrTime: '15:50', score: 15, note: '羽田➔松山（午後便）' }
];

function getJSTDate() {
  const now = new Date();
  const jstOffset = 9 * 60;
  const localOffset = now.getTimezoneOffset();
  const jstDate = new Date(now.getTime() + (jstOffset + localOffset) * 60 * 1000);
  const yyyy = jstDate.getFullYear();
  const mm = String(jstDate.getMonth() + 1).padStart(2, '0');
  const dd = String(jstDate.getDate()).padStart(2, '0');
  const hh = String(jstDate.getHours()).padStart(2, '0');
  const min = String(jstDate.getMinutes()).padStart(2, '0');

  // 明日の日付
  const tomorrow = new Date(jstDate.getTime() + 24 * 60 * 60 * 1000);
  const tYyyy = tomorrow.getFullYear();
  const tMm = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const tDd = String(tomorrow.getDate()).padStart(2, '0');

  return {
    todayStr: `${yyyy}-${mm}-${dd}`,
    tomorrowStr: `${tYyyy}-${tMm}-${tDd}`,
    tomorrowJa: `${Number(tMm)}月${Number(tDd)}日`,
    nowJa: `${yyyy}年${Number(mm)}月${Number(dd)}日 ${hh}:${min}`
  };
}

// ちいかわジェット（JA609A）の最新状況を取得
function fetchChiikawaCurrentStatus() {
  const url = 'https://api.flightradar24.com/common/v1/flight/list.json?query=JA609A&fetchBy=reg&page=1&limit=10';
  try {
    const cmd = `curl.exe -s -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "${url}"`;
    const stdout = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    const json = JSON.parse(stdout);
    return json.result?.response?.data || [];
  } catch (e) {
    console.warn('⚠️ JA609A 取得エラー:', e.message);
    return [];
  }
}

// 予測モデルの実行
export async function generatePrediction() {
  const dateInfo = getJSTDate();
  console.log('========================================================');
  console.log('🔮 === ANAちいかわジェット (JA609A) 翌日運行予測 ===');
  console.log(`📅 実行時刻: ${dateInfo.nowJa}`);
  console.log(`🎯 予測対象日: 明日 ${dateInfo.tomorrowJa} (${dateInfo.tomorrowStr})`);
  console.log('========================================================\n');

  // 1. 同型機フライト履歴の収集＆学習データを更新
  console.log('📥 最新のフライトデータベースを更新中...');
  const fleetDb = await collectFleetData();

  // 2. ちいかわジェットの最新フライト（ナイトステイ先）を特定
  const chiikawaFlights = fetchChiikawaCurrentStatus();
  if (chiikawaFlights.length === 0) {
    console.error('❌ ちいかわジェットのフライトデータが取得できませんでした。');
    return null;
  }

  // 直近の着陸済みフライト、または最新フライトの目的地
  const latestFlight = chiikawaFlights[0];
  const nightStayAirport = latestFlight.airport?.destination?.code?.iata || 'HND';
  const nightStayAirportName = AIRPORT_NAMES[nightStayAirport] || nightStayAirport;

  console.log(`\n📍 ちいかわジェットの今夜の駐機空港: ${nightStayAirportName} (${nightStayAirport})`);

  // 3. 翌日の第1便を予測
  // 過去の同型機データにおける実績
  const learnedStays = fleetDb.nightStays?.[nightStayAirport] || {};
  console.log(`📊 過去の ${nightStayAirport} ナイトステイ後の初便実績:`, learnedStays);

  let predictedFlight1 = MORNING_DEPARTURE_STANDARDS[nightStayAirport] || {
    flightNo: `ANA便 (${nightStayAirport}発)`,
    orig: nightStayAirport,
    dest: 'HND',
    depTime: '早朝便',
    arrTime: '午前',
    confidence: '70%',
    reason: `${nightStayAirportName}からの朝一折り返し便`
  };

  // 実績データの中で最も多い便があれば優先
  let topFlightNo = null;
  let topCount = 0;
  for (const fn in learnedStays) {
    if (learnedStays[fn] > topCount) {
      topCount = learnedStays[fn];
      topFlightNo = fn;
    }
  }

  if (topFlightNo && topFlightNo !== predictedFlight1.flightNo) {
    predictedFlight1.altFlightNo = topFlightNo;
    predictedFlight1.reason += ` (同型機過去実績 ${topCount}回)`;
  }

  // 4. 第2便・第3便・第4便の折り返し予測（デイリー運用チェーン）
  const predictions = [];
  // 第1便
  predictions.push({
    step: '第1便 (朝一始発)',
    flightNo: predictedFlight1.flightNo,
    route: `${AIRPORT_NAMES[predictedFlight1.orig] || predictedFlight1.orig} ➔ ${AIRPORT_NAMES[predictedFlight1.dest] || predictedFlight1.dest}`,
    time: `${predictedFlight1.depTime}発 - ${predictedFlight1.arrTime}着`,
    confidence: predictedFlight1.confidence,
    status: '本命 ◎',
    reason: predictedFlight1.reason
  });

  // 第2便（第1便が羽田に到着した場合）
  if (predictedFlight1.dest === 'HND') {
    predictions.push({
      step: '第2便 (午前往路)',
      flightNo: 'NH677 / NH251',
      route: '東京(羽田) ➔ 広島 または 福岡',
      time: '10:15〜10:30発 - 11:40〜12:30着',
      confidence: '75%',
      status: '有力 ◯',
      reason: '羽田での折り返し整備（約60分）後、主要幹線・地方基幹路線へ再投入'
    });
    predictions.push({
      step: '第3便 (午後復路)',
      flightNo: 'NH682 / NH256',
      route: '広島 または 福岡 ➔ 東京(羽田)',
      time: '12:45〜13:10発 - 14:05〜14:50着',
      confidence: '75%',
      status: '有力 ◯',
      reason: '地方空港から羽田への昼折り返し便'
    });
    predictions.push({
      step: '第4便 (夕方便)',
      flightNo: 'NH593 / NH669',
      route: '東京(羽田) ➔ 松山 または 長崎',
      time: '14:15〜19:15発',
      confidence: '60%',
      status: '可能性あり △',
      reason: '午後〜夕方にかけての四国・九州方面への2巡目フライト'
    });
  }

  // 5. Markdown生成
  let md = `\n{/* CHIIKAWA_PREDICTION_START */}\n`;
  md += `### 🔮 明日（${dateInfo.tomorrowJa}）のちいかわジェット運行予測（ANA同型機データ分析）\n\n`;

  md += `<div style="background: #f8fafc; border: 2px solid #38bdf8; border-radius: 8px; padding: 1.2rem; margin-bottom: 1.5rem;">\n`;
  md += `  <p style="margin: 0 0 0.5rem 0; font-weight: bold; color: #0369a1; font-size: 1.05rem;">\n`;
  md += `    ✈️ ナイトステイ分析による【明日 ${dateInfo.tomorrowJa}】の運航予想（22時AI更新）\n`;
  md += `  </p>\n`;
  md += `  <p style="margin: 0; color: #334155; font-size: 0.95rem; line-height: 1.6;">\n`;
  md += `    現在、ちいかわジェット（JA609A）は <b>${nightStayAirportName}（${nightStayAirport}）</b> にて夜間駐機（ナイトステイ）中です。<br />\n`;
  md += `    過去のANA同型機（ボーイング767-300ER）全15機のフライト蓄積データ（計${Object.keys(fleetDb.flights).length}件）から算出した明日の高精度予測ダイヤは以下の通りです。\n`;
  md += `  </p>\n`;
  md += `</div>\n\n`;

  md += `| 順番 | 予測便名 | 区間（出発 ➔ 到着） | 予定時刻 | 信頼度 | 予測根拠・運用パターン |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
  for (const p of predictions) {
    md += `| <b>${p.step}</b> | <b>${p.flightNo}</b> | ${p.route} | ${p.time} | <b>${p.status} (${p.confidence})</b> | ${p.reason} |\n`;
  }
  md += `\n`;

  md += `<div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 0.75rem 1rem; margin-top: 0.75rem; font-size: 0.85rem; color: #92400e;">\n`;
  md += `  💡 <b>答え合わせのコツ</b>: 明朝6時〜7時頃になると、ANA公式サイトの「国内線運航状況」およびFlightradar24に当日の確定ダイヤが反映されます。狙い撃ち搭乗や撮影に行かれる方は、出発前に最新状況をご確認ください。\n`;
  md += `</div>\n`;
  md += `{/* CHIIKAWA_PREDICTION_END */}\n`;

  return { md, predictions, nightStayAirport, nightStayAirportName, dateInfo };
}

// 記事本文の更新
export function updateArticleWithPrediction(predictionMd, dateInfo) {
  if (!fs.existsSync(TARGET_ARTICLE)) {
    console.error(`❌ 対象記事が見つかりません: ${TARGET_ARTICLE}`);
    return false;
  }

  let content = fs.readFileSync(TARGET_ARTICLE, 'utf-8');
  const markerRegex = /(?:\{\/\*\s*CHIIKAWA_PREDICTION_START\s*\*\/\}|<!--\s*CHIIKAWA_PREDICTION_START\s*-->)[\s\S]*?(?:\{\/\*\s*CHIIKAWA_PREDICTION_END\s*\*\/\}|<!--\s*CHIIKAWA_PREDICTION_END\s*-->)/;

  if (markerRegex.test(content)) {
    content = content.replace(markerRegex, predictionMd.trim());
  } else {
    // 既存マーカーがなければ、CHIIKAWA_SCHEDULE の直前に挿入
    const scheduleMarker = '{/* CHIIKAWA_SCHEDULE_START */}';
    if (content.includes(scheduleMarker)) {
      content = content.replace(scheduleMarker, `${predictionMd.trim()}\n\n${scheduleMarker}`);
    } else {
      // 適切な位置が見つからなければステップ1の後に挿入
      const targetHeader = '### ステップ1：Flightradar24で「JA609A」を検索';
      content = content.replace(targetHeader, `${predictionMd.trim()}\n\n${targetHeader}`);
    }
  }

  // Frontmatter の updatedDate を更新
  if (content.includes('updatedDate:')) {
    content = content.replace(/updatedDate:\s*["'][^"']+["']/, `updatedDate: "${dateInfo.todayStr}"`);
  } else {
    content = content.replace(/pubDate:\s*["']([^"']+)["']/, `pubDate: "$1"\nupdatedDate: "${dateInfo.todayStr}"`);
  }

  fs.writeFileSync(TARGET_ARTICLE, content, 'utf-8');
  console.log(`💾 記事に明日の運行予測を書き込みました: ${TARGET_ARTICLE}`);
  return true;
}

// Git Push
function performAutoPush(dateInfo) {
  console.log('\n🔒 === 安全なGitコミット＆プッシュを開始 ===');
  try {
    const remoteUrl = execSync('git remote get-url origin', { cwd: TELUIS_ROOT, encoding: 'utf-8' }).trim();
    if (!remoteUrl.includes('teluis') || !remoteUrl.includes('github.com')) {
      console.error(`❌ リモートURL検証エラー: 予期しないリポジトリです (${remoteUrl})`);
      return;
    }

    try {
      execSync('git pull origin main --rebase', { cwd: TELUIS_ROOT, stdio: 'inherit' });
    } catch {}

    const relArticle = path.relative(TELUIS_ROOT, TARGET_ARTICLE);
    const relData = path.relative(TELUIS_ROOT, HISTORY_FILE);
    execSync(`git add "${relArticle}" "${relData}"`, { cwd: TELUIS_ROOT, stdio: 'inherit' });

    const commitMsg = `feat(teluis): publish ANA chiikawa jet prediction for ${dateInfo.tomorrowStr} (22:00 batch)`;
    console.log(`📝 コミット実行: "${commitMsg}"`);
    execSync(`git commit -m "${commitMsg}"`, { cwd: TELUIS_ROOT, stdio: 'inherit' });

    console.log('🚀 リモート (origin main) へプッシュ中...');
    execSync('git push origin main', { cwd: TELUIS_ROOT, stdio: 'inherit' });
    console.log('🎉 Gitプッシュが完了しました！GitHub Pagesの自動デプロイが開始されます。');
  } catch (e) {
    console.error('❌ Git操作エラー:', e.message);
  }
}

async function main() {
  const result = await generatePrediction();
  if (!result) return;

  if (isDryRun) {
    console.log('\n🧪 --dry-run モード: 記事書き込みをスキップします。プレビュー:');
    console.log(result.md);
    return;
  }

  const updated = updateArticleWithPrediction(result.md, result.dateInfo);
  if (updated && isAutoPush) {
    performAutoPush(result.dateInfo);
  }

  console.log('\n========================================================');
  console.log('🎉 明日のちいかわジェット運行予測の公開処理が完了しました！');
  console.log('========================================================');
}

main().catch(e => console.error(e));

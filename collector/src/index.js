#!/usr/bin/env node
// =============================================================
// 臺南新訊 · 資訊蒐集器
//
//   node collector/src/index.js                 正式蒐集（需要網路）
//   node collector/src/index.js --out 路徑      改寫到指定檔案
//   node collector/src/index.js --fixtures 目錄  用測試資料跑整條管線（離線）
//   node collector/src/index.js --no-fetch      不抓來源，只對既有資料回填判區（離線）
//
// 流程：抓取各來源 → 相關性過濾 → 判區/分類/定位 → 去重合併 → 回填舊資料判區 → 寫檔
// =============================================================
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CONFIG } from './config.js';
import { extractDistrict, classifyCategory, geocode } from './classify.js';
import { collectGoogleNews } from './sources/googlenews.js';
import { collectPtt } from './sources/ptt.js';
import { collectRssFeeds } from './sources/rsslist.js';
import { collectProcurement } from './sources/procurement.js';
import { loadData, mergeNews, makeId, saveJSON } from './store.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function parseArgs(argv) {
  const args = { out: null, fixtures: null, noFetch: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--out') args.out = argv[++i];
    if (argv[i] === '--fixtures') args.fixtures = argv[++i];
    if (argv[i] === '--no-fetch') args.noFetch = true;
  }
  return args;
}

// 離線模式：依網址型態回傳對應的 fixture 檔
function fixtureFetch(dir) {
  const pick = (url) => {
    if (url.includes('news.google.com')) return 'googlenews.xml';
    if (url.includes('ptt.cc') && url.includes('index')) return 'ptt_index.html';
    if (url.includes('ptt.cc')) return 'ptt_article.html';
    if (url.includes('ronny.tw')) return 'procurement.json';
    return 'generic_feed.xml';
  };
  return async (url) => {
    const body = readFileSync(join(dir, pick(url)), 'utf8');
    return { ok: true, status: 200, text: async () => body };
  };
}

// 收進資料檔前的最後一哩：判區、分類、地圖座標，套用統一 schema
export function finalize(raw) {
  const text = `${raw.title} ${raw.snippet || ''}`;
  const district = extractDistrict(text);
  const id = makeId(raw.url);
  const { lat, lng } = geocode(district, id);
  return {
    id,
    title: raw.title,
    source: raw.source || '',
    url: raw.url,
    category: classifyCategory(text),
    date: raw.date || new Date().toISOString(),
    snippet: raw.snippet || '',
    district,
    lat,
    lng,
  };
}

// 判區規則會持續改善；對還沒有區的舊資料重新判一次（只補、不改已有的）。
// 回傳補到幾則。
export function backfillDistricts(list) {
  let filled = 0;
  for (const item of list) {
    if (item.district) continue;
    const district = extractDistrict(`${item.title} ${item.snippet || ''}`);
    if (!district) continue;
    const { lat, lng } = geocode(district, item.id || makeId(item.url));
    item.district = district;
    item.lat = lat;
    item.lng = lng;
    filled++;
  }
  return filled;
}

async function main() {
  const args = parseArgs(process.argv);
  const fetchImpl = args.fixtures ? fixtureFetch(args.fixtures) : fetch;
  const dataFile = args.out || join(ROOT, CONFIG.dataFile);
  const reportFile = args.out ? args.out.replace(/\.json$/, '.report.json') : join(ROOT, CONFIG.reportFile);

  console.log('=== 臺南新訊蒐集器 ===');
  const results = args.noFetch ? [] : await Promise.allSettled([
    collectGoogleNews(fetchImpl),
    collectPtt(fetchImpl),
    collectRssFeeds(fetchImpl),
    collectProcurement(fetchImpl),
  ]);
  if (args.noFetch) console.log('  （--no-fetch：略過來源抓取，只回填判區）');

  const report = { ranAt: new Date().toISOString(), sources: [], totalNew: 0, totalAfterMerge: 0 };
  const incoming = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      const { name, items, errors } = r.value;
      report.sources.push({ name, fetched: items.length, errors });
      console.log(`  ${name}: ${items.length} 則${errors.length ? `（${errors.length} 個錯誤）` : ''}`);
      errors.forEach(e => console.log(`    ⚠ ${e}`));
      incoming.push(...items.map(finalize));
    } else {
      report.sources.push({ name: '未知來源', fetched: 0, errors: [String(r.reason)] });
      console.log(`  ⚠ 來源整組失敗: ${r.reason}`);
    }
  }

  const existing = loadData(dataFile);
  const { news, added } = mergeNews(existing.news, incoming, CONFIG.maxTotalItems);
  report.totalNew = added;
  report.totalAfterMerge = news.length;
  report.districtBackfilled = backfillDistricts(news);
  report.withoutDistrict = news.filter(n => !n.district).length;
  if (report.districtBackfilled) console.log(`回填判區 ${report.districtBackfilled} 則（仍無區：${report.withoutDistrict} 則）`);

  saveJSON(dataFile, { lastFetched: args.noFetch ? existing.lastFetched : report.ranAt, news });
  // --no-fetch 沒有抓來源，不覆蓋上次真實執行的報表
  if (!args.noFetch) saveJSON(reportFile, report);
  console.log(`新增 ${added} 則，合併後共 ${news.length} 則 → ${dataFile}`);

  // 所有來源都掛掉才算失敗（讓排程知道要亮紅燈）
  const allFailed = report.sources.length > 0 && report.sources.every(s => s.fetched === 0 && s.errors.length > 0);
  if (allFailed) {
    console.error('所有來源皆抓取失敗');
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => { console.error(err); process.exit(1); });
}

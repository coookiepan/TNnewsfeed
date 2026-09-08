// =============================================================
// 去重、合併、存檔
// =============================================================
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function canonicalUrl(url) {
  try {
    const u = new URL(url);
    // 追蹤參數不影響識別
    for (const p of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|from|ref)/.test(p)) u.searchParams.delete(p);
    }
    u.hash = '';
    return u.toString();
  } catch (e) {
    return String(url || '');
  }
}

// 標題正規化：去掉空白、標點、尾巴的媒體名，用來偵測跨來源的同一則消息
export function normTitle(title) {
  return String(title || '')
    .replace(/\s*[-|–—]\s*[^-|–—]{2,20}$/, '')
    .replace(/[\s\p{P}\p{S}]/gu, '')
    .toLowerCase();
}

// 清掉標題裡的媒體名、頻道分類、討論串前綴：
//   「8490 8490 - 機器人…- 股市爆料同學會」「討論牆 | 南鐵…」「…| 雲嘉南| 地方」
export function cleanTitle(title) {
  let t = String(title || '').trim();
  t = t.replace(/^\d{3,5}\s+\d{3,5}\s*-\s*/, '');                 // 股市討論串的代號前綴
  t = t.replace(/^[^|｜\[\]【】\s]{1,6}\s*[|｜]\s*/, '');          // 「討論牆 | 」
  for (let i = 0; i < 3; i++) t = t.replace(/\s*[|｜]\s*[^|｜]{1,12}\s*$/, ''); // 「| 雲嘉南| 地方」
  // 「- 股市爆料同學會」「 - 旅遊新聞 - PChome Online 新聞」：短尾巴、不含數字，
  // 且剩下的標題還夠長才剪；最多剪兩段
  for (let i = 0; i < 2; i++) {
    const m = t.match(/^(.{8,}?)\s*[-–—－]\s*[^\d\-–—－]{2,20}$/);
    if (!m) break;
    t = m[1];
  }
  return t.replace(/\s+/g, ' ').trim() || String(title || '').trim();
}

export function makeId(url) {
  return createHash('sha1').update(canonicalUrl(url)).digest('hex').slice(0, 12);
}

export function loadData(file) {
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    return {
      news: Array.isArray(data.news) ? data.news : [],
      lastFetched: data.lastFetched || null,
      addedLastRun: Array.isArray(data.addedLastRun) ? data.addedLastRun : [],
    };
  } catch (e) {
    return { news: [], lastFetched: null, addedLastRun: [] };
  }
}

// 既有資料優先保留（id 與正規化標題都當 key），新資料補進來，依日期新到舊、裁掉超出上限的。
// 新進的那些會記上 firstSeen（＝這次執行時間），前端用來標「新進」。
export function mergeNews(existing, incoming, cap, runAt = new Date().toISOString()) {
  const byId = new Set();
  const byTitle = new Set();
  const out = [];
  const addedIds = [];
  const push = (item, isNew) => {
    const id = item.id || makeId(item.url);
    const tkey = normTitle(item.title);
    if (byId.has(id) || (tkey && byTitle.has(tkey))) return false;
    byId.add(id);
    if (tkey) byTitle.add(tkey);
    out.push(isNew ? { ...item, id, firstSeen: runAt } : { ...item, id });
    if (isNew) addedIds.push(id);
    return true;
  };
  let added = 0;
  for (const item of existing) push(item, false);
  for (const item of incoming) { if (push(item, true)) added++; }
  out.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return { news: out.slice(0, cap), added, addedIds };
}

export function saveJSON(file, obj) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(obj, null, 1) + '\n', 'utf8');
}

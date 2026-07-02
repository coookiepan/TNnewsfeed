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

export function makeId(url) {
  return createHash('sha1').update(canonicalUrl(url)).digest('hex').slice(0, 12);
}

export function loadData(file) {
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    return { news: Array.isArray(data.news) ? data.news : [], lastFetched: data.lastFetched || null };
  } catch (e) {
    return { news: [], lastFetched: null };
  }
}

// 既有資料優先保留（id 與正規化標題都當 key），新資料補進來，依日期新到舊、裁掉超出上限的
export function mergeNews(existing, incoming, cap) {
  const byId = new Set();
  const byTitle = new Set();
  const out = [];
  const push = (item) => {
    const id = item.id || makeId(item.url);
    const tkey = normTitle(item.title);
    if (byId.has(id) || (tkey && byTitle.has(tkey))) return false;
    byId.add(id);
    if (tkey) byTitle.add(tkey);
    out.push({ ...item, id });
    return true;
  };
  let added = 0;
  for (const item of existing) push(item);
  for (const item of incoming) { if (push(item)) added++; }
  out.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return { news: out.slice(0, cap), added };
}

export function saveJSON(file, obj) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(obj, null, 1) + '\n', 'utf8');
}

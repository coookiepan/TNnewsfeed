// =============================================================
// HTTP 抓取與 RSS 解析（零相依，regex 解析常見 RSS 2.0 / Atom）
// =============================================================
import { CONFIG } from './config.js';

export async function fetchText(url, fetchImpl = fetch) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CONFIG.fetchTimeoutMs);
  try {
    const resp = await fetchImpl(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': CONFIG.userAgent,
        'Accept': 'application/rss+xml, application/xml, text/xml, text/html, */*',
        'Cookie': 'over18=1',
      },
      redirect: 'follow',
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.text();
  } finally {
    clearTimeout(timer);
  }
}

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ' };

export function decodeEntities(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, m => ENTITIES[m] || m);
}

export function stripTags(s) {
  // 先解實體再去標籤：RSS 的 description 常是「編碼過的 HTML」
  const decoded = decodeEntities(String(s || ''));
  return decodeEntities(decoded.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function pick(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  if (!m) return '';
  let v = m[1].trim();
  const cdata = v.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdata) v = cdata[1].trim();
  return v;
}

// 回傳 [{title, link, pubDate, description, sourceName}]
export function parseRss(xml) {
  const items = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  for (const block of blocks) {
    const title = stripTags(pick(block, 'title'));
    let link = decodeEntities(pick(block, 'link'));
    if (!link) {
      // Atom：<link href="..."/>
      const m = block.match(/<link[^>]*href="([^"]+)"/i);
      if (m) link = decodeEntities(m[1]);
    }
    const pubDate = pick(block, 'pubDate') || pick(block, 'published') || pick(block, 'updated') || pick(block, 'dc:date');
    const description = stripTags(pick(block, 'description') || pick(block, 'summary') || pick(block, 'content'));
    const sourceName = stripTags(pick(block, 'source'));
    if (title && link) items.push({ title, link, pubDate, description, sourceName });
  }
  return items;
}

export function toISO(dateStr, fallback = null) {
  const d = new Date(dateStr);
  if (!isNaN(d)) return d.toISOString();
  return fallback;
}

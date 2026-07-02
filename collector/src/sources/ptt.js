// =============================================================
// 來源：PTT 看板（社群討論），抓標題含情報關鍵字的文章
// =============================================================
import { CONFIG, NEGATIVE_RE } from '../config.js';
import { fetchText, decodeEntities } from '../rss.js';

const KEYWORD_RE = /開幕|開店|新開|試營運|動工|興建|設廠|投資|進駐|完工|啟用|落成|展店|情報/;

// 解析看板列表頁：回傳 [{title, href, dateMD}] 與上一頁連結
export function parseBoardIndex(html) {
  const entries = [];
  const blocks = html.match(/<div class="r-ent">[\s\S]*?<div class="date">[\s\S]*?<\/div>/g) || [];
  for (const b of blocks) {
    const link = b.match(/<div class="title">\s*<a href="([^"]+)">([\s\S]*?)<\/a>/);
    if (!link) continue; // 被刪除的文章沒有連結
    const date = b.match(/<div class="date">\s*([\d/ ]+?)\s*<\/div>/);
    entries.push({
      href: link[1],
      title: decodeEntities(link[2]).trim(),
      dateMD: date ? date[1].trim() : '',
    });
  }
  const prev = html.match(/<a class="btn wide" href="([^"]+)">&lsaquo; 上頁<\/a>/);
  return { entries, prevHref: prev ? prev[1] : null };
}

// 解析文章頁：抓發文時間與內文前段當摘要
export function parseArticle(html) {
  let date = null;
  const t = html.match(/<span class="article-meta-tag">時間<\/span><span class="article-meta-value">([^<]+)<\/span>/);
  if (t) {
    const d = new Date(t[1]);
    if (!isNaN(d)) date = d.toISOString();
  }
  let snippet = '';
  const main = html.match(/<div id="main-content"[^>]*>([\s\S]*?)(?:\n--\n|<span class="f2">)/);
  if (main) {
    snippet = decodeEntities(
      main[1]
        .replace(/<div class="article-metaline[^>]*>[\s\S]*?<\/div>/g, '')
        .replace(/<[^>]*>/g, ' ')
    ).replace(/\s+/g, ' ').trim().slice(0, 200);
  }
  return { date, snippet };
}

// 「M/DD」推年份：月份比現在大表示是去年
function mdToISO(md, now = new Date()) {
  const m = md.match(/(\d{1,2})\/\s?(\d{1,2})/);
  if (!m) return null;
  let year = now.getFullYear();
  if (+m[1] > now.getMonth() + 1) year -= 1;
  const d = new Date(Date.UTC(year, +m[1] - 1, +m[2], 4)); // 台灣中午左右
  return isNaN(d) ? null : d.toISOString();
}

export async function collectPtt(fetchImpl = fetch) {
  const items = [];
  const errors = [];
  for (const { board, pages, maxArticleFetch } of CONFIG.pttBoards) {
    try {
      let url = `https://www.ptt.cc/bbs/${board}/index.html`;
      let fetched = 0;
      for (let p = 0; p < pages && url; p++) {
        const html = await fetchText(url, fetchImpl);
        const { entries, prevHref } = parseBoardIndex(html);
        for (const e of entries) {
          if (!KEYWORD_RE.test(e.title) || NEGATIVE_RE.test(e.title)) continue;
          if (/^\s*\[公告\]/.test(e.title)) continue;
          const item = {
            title: e.title,
            url: `https://www.ptt.cc${e.href}`,
            source: `PTT ${board}板`,
            date: mdToISO(e.dateMD),
            snippet: '',
          };
          // 抓文章內文當摘要（有數量上限，抓不到不影響收錄）
          if (fetched < maxArticleFetch) {
            try {
              const art = parseArticle(await fetchText(item.url, fetchImpl));
              if (art.date) item.date = art.date;
              if (art.snippet) item.snippet = art.snippet;
              fetched++;
            } catch (e2) { /* 內文抓失敗就只留標題 */ }
          }
          items.push(item);
        }
        url = prevHref ? `https://www.ptt.cc${prevHref}` : null;
      }
    } catch (err) {
      errors.push(`${board}板: ${err.message}`);
    }
  }
  return { name: 'PTT', items, errors };
}

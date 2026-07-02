// =============================================================
// 來源：Google News 搜尋 RSS（新聞主力，免金鑰）
// =============================================================
import { CONFIG, RELEVANT_RE, NEGATIVE_RE } from '../config.js';
import { fetchText, parseRss, toISO } from '../rss.js';

function feedUrl(query) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
}

// Google News 標題常是「標題 - 媒體名」，把尾巴的媒體名拆掉
function splitTitle(raw, sourceName) {
  if (sourceName && raw.endsWith(` - ${sourceName}`)) {
    return raw.slice(0, -(sourceName.length + 3)).trim();
  }
  const m = raw.match(/^(.*)\s-\s[^-]{2,20}$/);
  return m ? m[1].trim() : raw;
}

export async function collectGoogleNews(fetchImpl = fetch) {
  const seen = new Set();
  const items = [];
  const errors = [];
  for (const query of CONFIG.googleNewsQueries) {
    try {
      const xml = await fetchText(feedUrl(query), fetchImpl);
      for (const it of parseRss(xml).slice(0, CONFIG.maxItemsPerSource)) {
        const title = splitTitle(it.title, it.sourceName);
        const text = `${title} ${it.description}`;
        if (!RELEVANT_RE.test(text)) continue;
        if (NEGATIVE_RE.test(title)) continue;
        if (seen.has(it.link)) continue;
        seen.add(it.link);
        items.push({
          title,
          url: it.link,
          source: it.sourceName || 'Google News',
          date: toISO(it.pubDate),
          // Google News 的 description 只是標題連結清單，跟標題重複就不留
          snippet: it.description && !it.description.startsWith(title.slice(0, 12)) ? it.description : '',
        });
      }
    } catch (err) {
      errors.push(`query「${query}」: ${err.message}`);
    }
  }
  return { name: 'Google News', items, errors };
}

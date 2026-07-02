// =============================================================
// 來源：一般 RSS 清單（新聞網站分區 RSS、政府網站 RSS、RSSHub 等）
// 在 config.js 的 rssFeeds 加一行就能新增來源
// =============================================================
import { CONFIG, RELEVANT_RE, NEGATIVE_RE, CATEGORY_KEYWORDS } from '../config.js';
import { fetchText, parseRss, toISO } from '../rss.js';

const ANY_CATEGORY_RE = new RegExp(
  CATEGORY_KEYWORDS.flatMap(c => c.keys).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
);

export async function collectRssFeeds(fetchImpl = fetch) {
  const items = [];
  const errors = [];
  for (const feed of CONFIG.rssFeeds) {
    try {
      const xml = await fetchText(feed.url, fetchImpl);
      for (const it of parseRss(xml).slice(0, CONFIG.maxItemsPerSource)) {
        const text = `${it.title} ${it.description}`;
        if (NEGATIVE_RE.test(it.title)) continue;
        if (feed.requireKeyword && !ANY_CATEGORY_RE.test(text)) continue;
        if (!RELEVANT_RE.test(text) && feed.requireKeyword) continue;
        items.push({
          title: it.title,
          url: it.link,
          source: it.sourceName || feed.source,
          date: toISO(it.pubDate),
          snippet: it.description ? it.description.slice(0, 220) : '',
        });
      }
    } catch (err) {
      errors.push(`${feed.source}（${feed.url}）: ${err.message}`);
    }
  }
  return { name: 'RSS 清單', items, errors };
}

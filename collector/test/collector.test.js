import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseRss, stripTags, decodeEntities } from '../src/rss.js';
import { extractDistrict, classifyCategory, geocode, DISTRICTS, DISTRICT_COORDS } from '../src/classify.js';
import { parseBoardIndex, parseArticle } from '../src/sources/ptt.js';
import { canonicalUrl, normTitle, makeId, mergeNews } from '../src/store.js';
import { finalize } from '../src/index.js';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const read = f => readFileSync(join(FIX, f), 'utf8');

// ---------- RSS 解析 ----------
test('parseRss 解析 Google News 搜尋 RSS', () => {
  const items = parseRss(read('googlenews.xml'));
  assert.equal(items.length, 5);
  assert.match(items[0].title, /一蘭/);
  assert.equal(items[0].sourceName, 'ETtoday新聞雲');
  assert.match(items[0].link, /^https:\/\/news\.google\.com/);
  assert.ok(!isNaN(new Date(items[0].pubDate)));
});

test('parseRss 解析一般新聞 RSS（CDATA description）', () => {
  const items = parseRss(read('generic_feed.xml'));
  assert.equal(items.length, 3);
  assert.match(items[0].description, /文創市集/);
});

test('decodeEntities / stripTags', () => {
  assert.equal(decodeEntities('A&amp;B &#x4e2d;'), 'A&B 中');
  assert.equal(stripTags('<a href="#">你好</a>&nbsp;<b>世界</b>'), '你好 世界');
  // 編碼過的 HTML（Google News description 的格式）也要能去乾淨
  assert.equal(stripTags('&lt;a href="#"&gt;你好&lt;/a&gt;&amp;nbsp;世界'), '你好 世界');
});

test('Google News 來源不殘留 HTML 於 snippet', () => {
  const items = parseRss(read('googlenews.xml'));
  for (const it of items) assert.ok(!/[<>]/.test(it.description), it.description);
});

// ---------- 判區 ----------
test('extractDistrict：明寫行政區', () => {
  assert.equal(extractDistrict('台南市善化區牛庄文化園區'), '善化區');
  assert.equal(extractDistrict('位於歸仁區的沙崙科學城'), '歸仁區');
});

test('extractDistrict：省略「區」字與地標備援', () => {
  assert.equal(extractDistrict('臺南東區出現新商場'), '東區');
  assert.equal(extractDistrict('台積電宣布擴大南科投資'), '新市區');
  assert.equal(extractDistrict('奇美博物館旁新建飯店'), '仁德區');
  assert.equal(extractDistrict('高雄左營區新開幕'), '');
});

test('extractDistrict：獨特裸名可判區，常見詞不誤判', () => {
  assert.equal(extractDistrict('安平新飯店動工'), '安平區');
  assert.equal(extractDistrict('麻豆老街新店開張'), '麻豆區');
  assert.equal(extractDistrict('市場行情安定 山上空氣好'), '');   // 安定/山上是常見詞
  assert.equal(extractDistrict('將軍出巡 大內高手'), '');
});

test('DISTRICTS 共 37 區且都有座標', () => {
  assert.equal(DISTRICTS.length, 37);
  for (const d of DISTRICTS) assert.ok(DISTRICT_COORDS[d], `缺 ${d} 座標`);
});

// ---------- 分類 ----------
test('classifyCategory 對應舊分類', () => {
  assert.equal(classifyCategory('捷運藍線正式動工'), '新建設');
  assert.equal(classifyCategory('台積電宣布投資設廠'), '新投資案');
  assert.equal(classifyCategory('新拉麵店即將開幕'), '新開店');
  assert.equal(classifyCategory('圖書館新館落成'), '新落成');
  assert.equal(classifyCategory('今天天氣很好'), '');
});

// ---------- 定位 ----------
test('geocode 以區座標加固定偏移', () => {
  const g1 = geocode('中西區', 'abc123');
  const g2 = geocode('中西區', 'abc123');
  const g3 = geocode('中西區', 'zzz999');
  assert.deepEqual(g1, g2);                       // 同 id 結果固定
  assert.notDeepEqual(g1, g3);                     // 不同 id 有偏移
  assert.ok(Math.abs(g1.lat - 22.9927) < 0.02);
  assert.deepEqual(geocode('', 'abc'), { lat: '', lng: '' });
});

// ---------- PTT ----------
test('parseBoardIndex 解析列表、跳過被刪文章、找到上頁', () => {
  const { entries, prevHref } = parseBoardIndex(read('ptt_index.html'));
  assert.equal(entries.length, 4); // 被刪除的那篇沒有連結
  assert.match(entries[0].title, /全聯旗艦店/);
  assert.equal(entries[0].dateMD, '7/01');
  assert.equal(prevHref, '/bbs/Tainan/index7712.html');
});

test('parseArticle 取得時間與內文摘要', () => {
  const { date, snippet } = parseArticle(read('ptt_article.html'));
  assert.ok(date && date.startsWith('2026-07-01'));
  assert.match(snippet, /最後裝潢/);
  assert.ok(!snippet.includes('發信站'));
  assert.ok(!snippet.includes('article-meta'));
});

// ---------- 去重 / 合併 ----------
test('canonicalUrl 去除追蹤參數', () => {
  assert.equal(
    canonicalUrl('https://x.tw/a?id=1&utm_source=fb&fbclid=zzz#top'),
    'https://x.tw/a?id=1'
  );
});

test('normTitle 抹平標點與尾部媒體名', () => {
  assert.equal(normTitle('新店開幕！ - 自由時報'), normTitle('新店開幕'));
});

test('mergeNews 以 id 與標題去重、既有優先、依日期排序、裁上限', () => {
  const existing = [
    { id: makeId('https://a.tw/1'), title: '舊聞A', url: 'https://a.tw/1', date: '2026-06-01T00:00:00Z' },
  ];
  const incoming = [
    { title: '舊聞A', url: 'https://b.tw/copy', date: '2026-06-02T00:00:00Z' },  // 標題重複 → 不收
    { title: '新聞B', url: 'https://a.tw/1?utm_source=x', date: '2026-06-03T00:00:00Z' }, // 同 URL → 不收
    { title: '新聞C', url: 'https://c.tw/3', date: '2026-07-01T00:00:00Z' },
    { title: '新聞D', url: 'https://d.tw/4', date: '2026-05-01T00:00:00Z' },
  ];
  const { news, added } = mergeNews(existing, incoming, 2);
  assert.equal(added, 2);
  assert.deepEqual(news.map(n => n.title), ['新聞C', '舊聞A']); // 排序後裁到 2 筆
});

// ---------- finalize（整條 schema）----------
test('finalize 產出與前端一致的欄位', () => {
  const item = finalize({
    title: '善化區新工廠動工',
    url: 'https://example.tw/n/1',
    source: '測試社',
    date: '2026-06-30T01:00:00.000Z',
    snippet: '預計2027年完工',
  });
  assert.deepEqual(Object.keys(item), ['id', 'title', 'source', 'url', 'category', 'date', 'snippet', 'district', 'lat', 'lng']);
  assert.equal(item.district, '善化區');
  assert.equal(item.category, '新建設');
  assert.equal(item.id.length, 12);
  assert.ok(typeof item.lat === 'number');
});

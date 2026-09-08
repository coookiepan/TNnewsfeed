import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseRss, stripTags, decodeEntities } from '../src/rss.js';
import { extractDistrict, classifyCategory, geocode, DISTRICTS, DISTRICT_COORDS } from '../src/classify.js';
import { parseBoardIndex, parseArticle } from '../src/sources/ptt.js';
import { canonicalUrl, normTitle, makeId, mergeNews } from '../src/store.js';
import { finalize, backfillDistricts } from '../src/index.js';
import { normalizeRecord, taipeiDateStr } from '../src/sources/procurement.js';

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

test('extractDistrict：地標不分大小寫、具體地標優先於裸名', () => {
  assert.equal(extractDistrict('台南三井Outlet新品牌進駐'), '歸仁區');
  assert.equal(extractDistrict('台南機器人創新中心進駐柳科今開幕'), '柳營區');
  assert.equal(extractDistrict('台南雙春濱海遊憩區木棧道完工'), '北門區');
  assert.equal(extractDistrict('台南青年進駐後壁打造備援通訊網'), '後壁區');
  assert.equal(extractDistrict('聯電宣布在台南蓋新晶圓廠'), '新市區');
  assert.equal(extractDistrict('LOPIA台南西門店開幕'), '中西區');
  assert.equal(extractDistrict('安平工業區廠房改建'), '南區');   // 地標比裸名「安平」具體
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

// ---------- 政府電子採購網 ----------
test('normalizeRecord：只留臺南的工程 / 營運招標與決標', () => {
  const recs = JSON.parse(read('procurement.json')).records;
  const out = recs.map(r => normalizeRecord(r)).filter(Boolean);
  const titles = out.map(o => o.title);
  assert.deepEqual(titles, [
    '【招標】臺南市歸仁區公所新辦公廳舍新建工程',
    '【決標】永康區運動公園多功能運動館委託營運移轉（OT）案',
    '【招標】南部科學園區臺南園區標準廠房二期統包工程',
  ]);
  // 影印紙採購、高雄案、無法決標、電梯保養 都被排除
  assert.ok(!titles.some(t => /影印紙|高雄|白河|電梯/.test(t)));
  // 決標帶出得標廠商
  assert.match(out[1].snippet, /得標廠商：某某運動事業股份有限公司/);
  assert.match(out[1].snippet, /機關：臺南市政府體育局/);
  assert.equal(out[0].source, '政府電子採購網');
  assert.equal(out[0].date, '2026-09-07T04:00:00.000Z');
  assert.match(out[0].url, /^https:\/\/web\.pcc\.gov\.tw\//);
});

test('normalizeRecord：沒有 url 時組出 g0v 採購網頁連結', () => {
  const item = normalizeRecord({
    date: 20260901, brief: { type: '公開招標公告', title: '臺南市某某路拓寬工程' },
    unit_id: '3.79.3', job_number: 'A-1', unit_name: '臺南市政府工務局',
  });
  assert.match(item.url, /^https:\/\/pcc\.g0v\.ronny\.tw\/tender\/3\.79\.3\/A-1\?announce=20260901$/);
});

test('taipeiDateStr 以台灣時間換算日期', () => {
  // UTC 2026-09-07 20:00 = 台灣 09-08 04:00
  const now = new Date('2026-09-07T20:00:00Z');
  assert.equal(taipeiDateStr(0, now), '20260908');
  assert.equal(taipeiDateStr(1, now), '20260907');
});

// ---------- 回填判區 ----------
test('backfillDistricts 只補沒有區的、不動已有的', () => {
  const list = [
    { id: 'a', title: '台南青年進駐後壁打造備援通訊網', url: 'https://x/1', district: '', lat: '', lng: '' },
    { id: 'b', title: '安平新飯店動工', url: 'https://x/2', district: '永康區', lat: 1, lng: 2 }, // 已有區，不改
    { id: 'c', title: '台南捷運藍線動工', url: 'https://x/3', district: '', lat: '', lng: '' },        // 判不出，維持空
  ];
  const filled = backfillDistricts(list);
  assert.equal(filled, 1);
  assert.equal(list[0].district, '後壁區');
  assert.ok(typeof list[0].lat === 'number');
  assert.equal(list[1].district, '永康區');
  assert.equal(list[2].district, '');
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

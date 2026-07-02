// =============================================================
// 蒐集器設定 — 要加新來源、新關鍵字，改這個檔就好
// =============================================================

export const CONFIG = {
  // Google News 搜尋（RSS）：情報的主力來源。
  // 每一條是一組搜尋字串，涵蓋「新開店 / 興建 / 投資設廠 / 完工啟用」。
  googleNewsQueries: [
    '台南 開幕 OR 試營運 OR 新開',
    '台南 動工 OR 興建 OR 開工',
    '台南 設廠 OR 投資 OR 擴廠',
    '台南 完工 OR 啟用 OR 落成',
    '台南 進駐 OR 展店 OR 首店',
    '南科 擴廠 OR 投資 OR 動工',
    '台南市政府 招商 OR 建設',
  ],

  // PTT 看板（社群討論）：抓標題含相關關鍵字的文章
  pttBoards: [
    { board: 'Tainan', pages: 2, maxArticleFetch: 10 },
  ],

  // 一般 RSS 來源（新聞網站分區 RSS、RSSHub 路由、rss.app 等都可以加在這裡）
  // requireKeyword: true 表示要含分類關鍵字才收（分區綜合新聞需要過濾）
  rssFeeds: [
    { url: 'https://news.ltn.com.tw/rss/tainan.xml', source: '自由時報', requireKeyword: true },
    // 範例：加 RSSHub 或 rss.app 的來源
    // { url: 'https://rsshub.app/xxxx', source: '來源名稱', requireKeyword: false },
  ],

  maxItemsPerSource: 40,   // 每個來源單次最多收幾則
  maxTotalItems: 1200,     // data/news.json 最多保留幾則（依日期淘汰最舊）
  fetchTimeoutMs: 20000,
  userAgent: 'Mozilla/5.0 (compatible; TNnewsfeedBot/1.0; +https://github.com/coookiepan/TNnewsfeed)',

  dataFile: 'data/news.json',
  reportFile: 'data/report.json',
};

// 至少要提到台南（或南科）或某個行政區才算相關
export const RELEVANT_RE = /台南|臺南|南科/;

// 排除雜訊：球賽開幕戰、藝文活動等「開幕」不是我們要的開幕
export const NEGATIVE_RE = /開幕戰|開幕賽|閉幕|球隊|棒球|籃球|排球|職棒|演唱會|音樂節|藝術節|電影節|燈會|路跑|馬拉松|畫展|特展開幕/;

// 分類關鍵字（沿用舊 Apps Script 的分類，依序比對，先中先贏）
export const CATEGORY_KEYWORDS = [
  { cat: '新落成',     keys: ['落成', '竣工', '正式開放', '正式啟用'] },
  { cat: '新整修完成', keys: ['修復完成', '整修完成', '翻新完成', '修復工程完成'] },
  { cat: '新建設',     keys: ['動工', '開工', '動土', '興建', '都更', '新建工程', '施工'] },
  { cat: '新投資案',   keys: ['投資', '設廠', '擴廠', '購地', '進駐廠房', '砸下', '得標', '簽約'] },
  { cat: '新裝潢',     keys: ['裝潢', '改裝', '改造', '重新裝修'] },
  { cat: '新開店',     keys: [
    '開幕', '試營運', '新開', '進駐', '首店', '快閃', '即將開幕',
    '新店', '新據點', '開張', '新登場', '展店', '旗艦店', '啟用',
  ] },
];

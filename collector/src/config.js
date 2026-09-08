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

  // 加在每組搜尋字串後面，讓 Google News 回傳近期新聞（設成 '' 則回到相關性排序）
  googleNewsRecency: 'when:14d',

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

  // 政府電子採購網（經 g0v 開放 API），抓臺南的工程、營運招標與決標公告
  procurement: {
    enabled: true,
    apiBase: 'https://pcc.g0v.ronny.tw/api',
    siteBase: 'https://pcc.g0v.ronny.tw',
    daysBack: 3,          // 查最近幾天的公告（涵蓋週末與偶發漏跑）
    maxItems: 80,
    // 收哪些公告類型
    announceTypeRe: /招標|決標|取得報價|徵求|評選/,
    excludeTypeRe: /無法決標|撤銷|流標|廢標/,
    // 標題要是工程或營運類
    titleKeywordRe: /工程|新建|興建|改建|整建|修建|擴建|增建|裝修|營運|經營|OT|ROT|BOT|BOO|促參|招商|統包|開發案|規劃設計|設計監造/i,
    // 排除跟建設無關的雜項（維護保養、清潔、保全、耗材等）
    titleExcludeRe: /維護|保養|清潔|保全|巡檢|清運|租賃|購置|採購案$|耗材|文具|印刷|保險|餐盒|便當|勞務派遣|教育訓練|研習/,
  },

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
  { cat: '新建設',     keys: ['動工', '開工', '動土', '興建', '都更', '新建工程', '施工', '統包', '工程'] },
  { cat: '新投資案',   keys: ['投資', '設廠', '擴廠', '購地', '進駐廠房', '砸下', '得標', '簽約'] },
  { cat: '新裝潢',     keys: ['裝潢', '改裝', '改造', '重新裝修'] },
  { cat: '新開店',     keys: [
    '開幕', '試營運', '新開', '進駐', '首店', '快閃', '即將開幕',
    '新店', '新據點', '開張', '新登場', '展店', '旗艦店', '啟用',
  ] },
];

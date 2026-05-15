/**
 * =============================================================
 * 臺南新訊 · Google Apps Script
 * =============================================================
 *
 * 功能：
 *   1. 從 RSS 來源（RSSHub / rss.app / FetchRSS 等）抓取
 *      @tainan_newopen 等 IG 帳號的貼文，每篇貼文轉成獨立新聞
 *      寫入 Google Sheet。
 *   2. 提供 doGet 端點給前端 index.html 呼叫：
 *        ?action=getNews   → 回傳 sheet 中所有新聞
 *        ?action=fetchNew  → 立即抓取 RSS 來源並寫入 sheet
 *   3. 自動偵測中文「分類」與「臺南行政區」。
 *
 * -------------------------------------------------------------
 * 部署步驟
 * -------------------------------------------------------------
 *
 * 1. 建立試算表
 *    ─ 開新試算表，從網址列複製 ID（介於 /d/ 與 /edit 之間那段）
 *      貼到下方 CONFIG.spreadsheetId
 *    ─ 不必預先建分頁，腳本第一次執行會自動建立 News 分頁與 header
 *
 * 2. 建立 RSS 來源（擇一即可，建議先試 A）
 *
 *    A. RSSHub 公開實例（免費，但偶爾不穩）：
 *         https://rsshub.app/instagram/user/tainan_newopen
 *       若該實例擋掉 IG，可改試其他公開 mirror，或自架。
 *
 *    B. rss.app（免費方案有上限，較穩定）：
 *         登入 https://rss.app → New Feed → Instagram → 輸入
 *         tainan_newopen → 複製 RSS URL（形如
 *         https://rss.app/feeds/xxxxx.xml）
 *
 *    C. FetchRSS / Inoreader / Feedly 等其他 IG-to-RSS 服務。
 *
 *    把得到的 URL 加入下方 CONFIG.feeds 陣列。可放多個。
 *
 * 3. 部署為 Web App
 *    ─ Apps Script 編輯器 → 部署 → 新增部署
 *    ─ 類型「網頁應用程式」
 *    ─ 執行身分：「我」
 *    ─ 存取權：「任何人」
 *    ─ 部署後複製 URL，貼到前端 index.html 的 const API_URL
 *
 * 4. 設定每小時自動抓取（可選）
 *    ─ 在編輯器手動執行一次 setupHourlyTrigger()
 *
 * 5. 第一次抓資料
 *    ─ 在編輯器手動執行一次 fetchNew() 確認流程
 *    ─ 或從前端按右上角「付印」按鈕
 *
 * -------------------------------------------------------------
 * 與現有 GAS 整合
 * -------------------------------------------------------------
 * 若你已有舊版的 Code.gs，建議直接整個檔覆蓋（舊資料若也在 sheet
 * 中、欄位相符會被保留並去重）。如果你的舊 sheet 欄位不同，請先
 * 對齊 HEADERS 後再執行 fetchNew，避免欄位錯位。
 *
 */


// =============================================================
// CONFIG  —  使用前先改這裡
// =============================================================

const CONFIG = {
  // 你的試算表 ID（必填）
  spreadsheetId: '',

  // 資料分頁名稱（沒有會自動建立）
  sheetName: 'News',

  // IG → RSS 的橋接 URL 列表，可放多個
  feeds: [
    // 'https://rsshub.app/instagram/user/tainan_newopen',
    // 'https://rss.app/feeds/xxxxxxxx.xml',
  ],

  // 來源顯示名稱：當 RSS item 沒帶作者時，用這個當 source
  defaultSource: 'tainan_newopen',

  // 預設分類（@tainan_newopen 帳號以新開幕情報為主）
  defaultCategory: '新開店',

  // 摘要最大長度（字）
  snippetMaxLen: 220,

  // 預設區域（找不到關鍵字時）
  defaultDistrict: ''
};


// =============================================================
// SCHEMA  —  必須與前端 index.html 的欄位一致
// =============================================================

const HEADERS = [
  'id', 'title', 'source', 'url', 'category',
  'date', 'snippet', 'district', 'lat', 'lng'
];


// =============================================================
// CATEGORY / DISTRICT KEYWORDS  —  自動分類規則
// =============================================================

const CATEGORY_KEYWORDS = [
  { cat: '新落成',     keys: ['落成', '啟用', '正式開放', '完工', '竣工'] },
  { cat: '新整修完成', keys: ['修復完成', '整修完成', '修復', '翻新完成'] },
  { cat: '新建設',     keys: ['動工', '興建', '都更', '開工', '建設', '工程'] },
  { cat: '新投資案',   keys: ['投資', '設廠', '進駐廠房', '宣布投資', '砸下'] },
  { cat: '新裝潢',     keys: ['裝潢', '改裝', '改造', '重新裝修'] },
  { cat: '新開店',     keys: [
    '開幕', '試營運', '新開', '進駐', '首店', '快閃', '即將開幕',
    '新店', '新據點', 'NEW OPEN', 'newopen', 'opening', 'open soon',
    'grand open', '開張', '新登場', '登場'
  ]}
];

const DISTRICT_KEYWORDS = {
  '中西區': ['中西區', '正興街', '神農街', '海安路', '國華街', '友愛街',
            '民族路', '永福路', '赤崁', '銀座', '中正路', '西門商圈'],
  '東區':   ['東區', '崇學路', '崇明路', '東寧路', '林森路', '東門路',
            '勝利路', '長榮路', '裕農路'],
  '南區':   ['南區', '健康路', '夏林路', '金華路', '灣裡', '喜樹', '黃金海岸'],
  '北區':   ['北區', '公園路', '成功路', '西門路三段', '小北', '富北街',
            '北門路', '開元路'],
  '安平區': ['安平', '永華', '安億', '運河', '億載', '安平港', '林默娘',
            '安平樹屋', '夕遊出張所'],
  '安南區': ['安南', '海佃', '台江', '本田', '海尾', '四草'],
  '永康區': ['永康', '中華路', '中正南路', '中山南路', '永大路'],
  '歸仁區': ['歸仁', '高鐵', '沙崙', '保大'],
  '新市區': ['新市', '南科', '南部科學園區'],
  '善化區': ['善化'],
  '仁德區': ['仁德', '中山路二段', '德糖'],
  '關廟區': ['關廟'],
  '佳里區': ['佳里'],
  '麻豆區': ['麻豆'],
  '新化區': ['新化'],
  '玉井區': ['玉井']
};


// =============================================================
// API ENTRY POINTS
// =============================================================

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'getNews';
  try {
    if (action === 'getNews')  return jsonOut_(getNews());
    if (action === 'fetchNew') return jsonOut_(fetchNew());
    return jsonOut_({ error: 'unknown action: ' + action });
  } catch (err) {
    return jsonOut_({ error: String(err && err.message || err), stack: err && err.stack });
  }
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


// =============================================================
// READ  —  回傳目前 sheet 內的所有新聞
// =============================================================

function getNews() {
  const sheet = openSheet_();
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    return { news: [], lastFetched: getLastFetched_() };
  }
  const headers = data[0];
  const news = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[headers.indexOf('url')]) continue;
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = row[idx]; });
    if (obj.date instanceof Date) obj.date = obj.date.toISOString();
    news.push(obj);
  }
  news.sort((a, b) => {
    const da = new Date(a.date), db = new Date(b.date);
    return (isNaN(db) ? 0 : db.getTime()) - (isNaN(da) ? 0 : da.getTime());
  });
  return { news, lastFetched: getLastFetched_() };
}


// =============================================================
// FETCH  —  從 RSS 抓取新貼文，併入 sheet
// =============================================================

function fetchNew() {
  if (!CONFIG.feeds || CONFIG.feeds.length === 0) {
    return {
      added: 0, errors: ['CONFIG.feeds 為空'],
      message: '尚未設定任何 RSS 來源，請編輯 Code.gs 的 CONFIG.feeds',
      lastFetched: getLastFetched_()
    };
  }

  const sheet = openSheet_();
  const existing = getExistingMap_(sheet);
  const newRows = [];
  const errors = [];
  let totalParsed = 0;

  CONFIG.feeds.forEach(url => {
    try {
      const items = fetchFeed_(url);
      totalParsed += items.length;
      items.forEach(item => {
        if (!item.url) return;
        if (existing[item.url] || existing[item.id]) return;
        const row = HEADERS.map(h => item[h] != null ? item[h] : '');
        newRows.push(row);
        existing[item.url] = true;
        existing[item.id] = true;
      });
    } catch (err) {
      errors.push(url + ' → ' + (err && err.message || err));
    }
  });

  if (newRows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, HEADERS.length)
         .setValues(newRows);
  }

  const now = new Date().toISOString();
  PropertiesService.getScriptProperties().setProperty('lastFetched', now);

  let message = '抓取完成 · 解析 ' + totalParsed + ' 則 · 新增 ' + newRows.length + ' 則';
  if (errors.length) message += '（' + errors.length + ' 個來源失敗）';

  return { added: newRows.length, parsed: totalParsed, errors, lastFetched: now, message };
}


// =============================================================
// FEED PARSING  —  支援 RSS 2.0 與 Atom
// =============================================================

function fetchFeed_(url) {
  const resp = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    followRedirects: true,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; TainanChronicleBot/1.0)',
      'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml'
    }
  });
  const code = resp.getResponseCode();
  if (code >= 400) throw new Error('HTTP ' + code);

  const xml = resp.getContentText();
  let doc;
  try {
    doc = XmlService.parse(xml);
  } catch (err) {
    throw new Error('XML 解析失敗：' + (err.message || err));
  }
  const root = doc.getRootElement();

  // RSS 2.0：<rss><channel><item>…
  const channel = root.getChild('channel');
  if (channel) {
    const items = channel.getChildren('item');
    return items.map(mapRSS_);
  }

  // Atom：<feed><entry>…
  const atomNs = XmlService.getNamespace('http://www.w3.org/2005/Atom');
  const entries = root.getChildren('entry', atomNs);
  return entries.map(e => mapAtom_(e, atomNs));
}

function mapRSS_(item) {
  const title  = textOf_(item.getChild('title'));
  const link   = textOf_(item.getChild('link'));
  const desc   = textOf_(item.getChild('description'))
              || textOf_(item.getChild('content'))
              || textOf_(item.getChild('summary'));
  const guid   = textOf_(item.getChild('guid')) || link;
  const pub    = textOf_(item.getChild('pubDate'));
  const author = textOf_(item.getChild('author')) || textOf_(item.getChild('creator'));
  return buildNews_({ title, link, desc, guid, pub, author });
}

function mapAtom_(entry, ns) {
  const title = textOf_(entry.getChild('title', ns));
  let link = '';
  const linkEl = entry.getChild('link', ns);
  if (linkEl) {
    const href = linkEl.getAttribute('href');
    link = href ? href.getValue() : textOf_(linkEl);
  }
  const desc = textOf_(entry.getChild('summary', ns))
            || textOf_(entry.getChild('content', ns));
  const guid = textOf_(entry.getChild('id', ns)) || link;
  const pub  = textOf_(entry.getChild('updated', ns))
            || textOf_(entry.getChild('published', ns));
  let author = '';
  const authorEl = entry.getChild('author', ns);
  if (authorEl) author = textOf_(authorEl.getChild('name', ns));
  return buildNews_({ title, link, desc, guid, pub, author });
}

function textOf_(el) {
  if (!el) return '';
  try { return el.getText ? el.getText() : ''; }
  catch (e) { return ''; }
}


// =============================================================
// BUILD  —  把一筆 RSS item 轉成 sheet row 物件
// =============================================================

function buildNews_(raw) {
  const cleanTitle = stripTags_(raw.title || '').trim();
  const cleanDesc  = stripTags_(raw.desc || '').trim();

  // IG 的 title 常常等於整段內文的前 80 字，這裡若 title 太長就截短
  let title = cleanTitle;
  if (!title) title = cleanDesc.slice(0, 60);
  if (title.length > 110) title = title.slice(0, 108) + '…';

  const snippet = cleanDesc.length > CONFIG.snippetMaxLen
    ? cleanDesc.slice(0, CONFIG.snippetMaxLen) + '…'
    : cleanDesc;

  const text = cleanTitle + ' ' + cleanDesc;
  const date = parseDate_(raw.pub) || new Date().toISOString();
  const source = pickSource_(raw.author, raw.link);

  return {
    id:       hash_(raw.guid || raw.link || (title + '|' + date)),
    title:    title,
    source:   source,
    url:      raw.link || '',
    category: detectCategory_(text),
    date:     date,
    snippet:  snippet,
    district: detectDistrict_(text),
    lat:      '',
    lng:      ''
  };
}

function pickSource_(author, link) {
  if (author && author.trim()) return author.trim();
  // 從 IG URL 抽 username：https://www.instagram.com/p/XXX/ → tainan_newopen
  // 如果有 @ 形式的就用 @，否則用 CONFIG.defaultSource
  return CONFIG.defaultSource;
}


// =============================================================
// HELPERS
// =============================================================

function stripTags_(s) {
  if (!s) return '';
  return String(s)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ');
}

function parseDate_(s) {
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d) ? '' : d.toISOString();
}

function detectCategory_(text) {
  if (!text) return CONFIG.defaultCategory;
  const lower = text.toLowerCase();
  for (const rule of CATEGORY_KEYWORDS) {
    for (const kw of rule.keys) {
      if (lower.indexOf(kw.toLowerCase()) >= 0) return rule.cat;
    }
  }
  return CONFIG.defaultCategory;
}

function detectDistrict_(text) {
  if (!text) return CONFIG.defaultDistrict;
  for (const district of Object.keys(DISTRICT_KEYWORDS)) {
    for (const kw of DISTRICT_KEYWORDS[district]) {
      if (text.indexOf(kw) >= 0) return district;
    }
  }
  return CONFIG.defaultDistrict;
}

function hash_(str) {
  if (!str) return Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(str));
  return bytes.map(b => ((b & 0xff) + 0x100).toString(16).slice(1)).join('').slice(0, 16);
}


// =============================================================
// SHEET HELPERS
// =============================================================

function openSheet_() {
  if (!CONFIG.spreadsheetId) {
    throw new Error('請先在 Code.gs 的 CONFIG.spreadsheetId 填入試算表 ID');
  }
  const ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  let sheet = ss.getSheetByName(CONFIG.sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.sheetName);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    return sheet;
  }
  const lastCol = Math.max(HEADERS.length, sheet.getLastColumn() || HEADERS.length);
  const firstRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const ok = HEADERS.every((h, i) => firstRow[i] === h);
  if (!ok) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getExistingMap_(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return {};
  const headers = data[0];
  const urlIdx = headers.indexOf('url');
  const idIdx  = headers.indexOf('id');
  const map = {};
  for (let i = 1; i < data.length; i++) {
    const u = urlIdx >= 0 ? data[i][urlIdx] : '';
    const k = idIdx  >= 0 ? data[i][idIdx]  : '';
    if (u) map[u] = true;
    if (k) map[k] = true;
  }
  return map;
}

function getLastFetched_() {
  return PropertiesService.getScriptProperties().getProperty('lastFetched') || '';
}


// =============================================================
// SETUP / DEBUG  —  在編輯器手動執行
// =============================================================

/**
 * 建立每小時自動 fetchNew 的觸發器。
 * 重複執行會清除舊觸發器再建立。
 */
function setupHourlyTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'fetchNew') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('fetchNew').timeBased().everyHours(1).create();
  Logger.log('已建立每小時觸發器 ✓');
}

/**
 * 測試 RSS 來源是否正常 — 在編輯器執行後看執行紀錄。
 * 不會寫入 sheet。
 */
function testFetch() {
  if (!CONFIG.feeds.length) { Logger.log('CONFIG.feeds 是空的'); return; }
  CONFIG.feeds.forEach(url => {
    try {
      const items = fetchFeed_(url);
      Logger.log('=== %s ===', url);
      Logger.log('解析到 %s 則', items.length);
      if (items[0]) Logger.log('第一則：\n' + JSON.stringify(items[0], null, 2));
    } catch (err) {
      Logger.log('✗ %s → %s', url, err.message || err);
    }
  });
}

/**
 * 清空整個 sheet（保留 header）— 開發時測試用。
 */
function resetSheet() {
  const sheet = openSheet_();
  const last = sheet.getLastRow();
  if (last > 1) sheet.getRange(2, 1, last - 1, HEADERS.length).clearContent();
  PropertiesService.getScriptProperties().deleteProperty('lastFetched');
  Logger.log('已清空 sheet');
}

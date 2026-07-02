# 臺南新訊 · The Tainan Chronicle

給臺南業務的轄區情報系統：每天清晨自動從**政府網站、新聞、社群討論**蒐集
轄區內的新建工廠、投資案、新開店家消息，自動判區、分類、去重，早上打開
首頁儀表板就能看到「依預定開幕／完工日期排列」的案件清單。

## 系統架構

```
┌─ 來源 ──────────────────────────┐
│  Google News 搜尋 RSS（新聞主力） │      GitHub Actions
│  PTT Tainan 看板（社群討論）      │──▶  每天 05:30（台灣時間）
│  一般 RSS（自由時報台南、可自加）  │      collector/src/index.js
└─────────────────────────────────┘              │
        相關性過濾 → 判區(37區) → 分類 → 座標 → 去重合併
                                                 │
                                        data/news.json（版本控管）
                                                 │
                                    index.html（儀表板 / 列表 / 地圖）
```

- **蒐集器**（`collector/`）：零相依 Node.js，離線可測（`npm test`）。
- **排程**（`.github/workflows/collect.yml`）：每天蒐集並直接 commit 更新
  `data/news.json`，也可以在 GitHub → Actions → 「每日資訊蒐集」→
  Run workflow 手動觸發。
- **前端**（`index.html`）：單一 HTML 檔，直接讀 `data/news.json`；
  資料檔還沒產出時自動退回舊版 Apps Script API，不會斷線。

## 日常維護（不用寫程式）

改 `collector/src/config.js` 就能調整蒐集範圍：

| 想做的事 | 改哪裡 |
|---|---|
| 增加搜尋主題 | `googleNewsQueries` 加一行搜尋字串 |
| 增加 RSS 來源（含 RSSHub / rss.app） | `rssFeeds` 加一筆 `{ url, source }` |
| 增加/調整分類關鍵字 | `CATEGORY_KEYWORDS` |
| 排除雜訊（球賽開幕戰之類） | `NEGATIVE_RE` |
| 地標對應行政區（例如某園區 → 某區） | `collector/src/classify.js` 的 `LANDMARKS` |

改完 push 到 main，下一次排程就生效；急的話手動 Run workflow。

## 本機開發

```bash
# 單元測試（離線，不需網路）
cd collector && npm test

# 用測試資料跑整條管線（離線）
node collector/src/index.js --fixtures collector/test/fixtures --out /tmp/news.json

# 正式蒐集（需要網路，會更新 data/news.json 與 data/report.json）
node collector/src/index.js
```

`data/report.json` 記錄每次蒐集各來源的則數與錯誤，來源掛掉時先看這裡。

## 資料格式

`data/news.json` 的每一則與舊版 Apps Script 試算表欄位相同：

```json
{ "id": "…", "title": "…", "source": "…", "url": "…", "category": "新開店",
  "date": "ISO 8601", "snippet": "…", "district": "中西區", "lat": 22.99, "lng": 120.19 }
```

前端儀表板會再從標題/摘要即時判讀「預定開幕 / 興建中 / 投資案 / 新開幕」
狀態與預定日期，資料端不需要維護這兩個欄位。

## 已知限制與擴充方向

- Google News 的連結是轉址連結、摘要有限；想要全文摘要可以在 `rssFeeds`
  加來源網站自己的 RSS。
- Facebook / Instagram 沒有公開 RSS，需要透過 RSSHub 自架或 rss.app 之類
  的橋接服務，把橋接後的網址加進 `rssFeeds` 即可（舊版曾用此法抓 IG）。
- 政府標案／建照資料（政府電子採購網、內政部建照開放資料）是好的下一步，
  可在 `collector/src/sources/` 加新模組，回傳相同欄位即可。

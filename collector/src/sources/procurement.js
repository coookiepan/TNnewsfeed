// =============================================================
// 來源：政府電子採購網（透過 g0v 的開放 API：pcc.g0v.ronny.tw）
// 找出臺南的工程與營運（OT / BOT / 委託經營）招標、決標公告
// =============================================================
import { CONFIG, RELEVANT_RE } from '../config.js';
import { fetchText } from '../rss.js';

// 台灣時間的 YYYYMMDD（採購網以公告日查詢）
export function taipeiDateStr(offsetDays = 0, now = new Date()) {
  const t = new Date(now.getTime() + 8 * 3600000 - offsetDays * 86400000);
  const y = t.getUTCFullYear(), m = t.getUTCMonth() + 1, d = t.getUTCDate();
  return `${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`;
}

function ymdToISO(ymd) {
  const s = String(ymd || '');
  const m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T04:00:00.000Z`; // 台灣中午
}

// 從 API 的一筆 record 整理成統一欄位；不符合條件回傳 null
export function normalizeRecord(r, cfg = CONFIG.procurement) {
  const brief = r.brief || {};
  const title = String(brief.title || r.title || '').trim();
  const type = String(brief.type || r.type || '').trim();
  const unit = String(r.unit_name || '').trim();
  if (!title) return null;

  // 只要招標 / 決標類公告，排除無法決標、撤銷
  if (!cfg.announceTypeRe.test(type) || cfg.excludeTypeRe.test(type)) return null;
  // 只要工程、營運類（財物採購、勞務雜項不收）
  if (!cfg.titleKeywordRe.test(title)) return null;
  if (cfg.titleExcludeRe.test(title)) return null;
  // 臺南的機關（市府各局處、區公所、市立醫院…），或標題點名臺南 / 南科。
  // 標題只有區名不算——其他縣市也有同名的區（例如高雄也有新興區）。
  const tainanUnit = /臺南|台南/.test(unit);
  const tainanTitle = RELEVANT_RE.test(title) || /南部科學/.test(title);
  if (!tainanUnit && !tainanTitle) return null;

  const isAward = /決標/.test(type);
  const kind = isAward ? '決標' : '招標';
  const winners = [];
  const names = brief.companies && (brief.companies.names || brief.companies.name);
  if (Array.isArray(names)) winners.push(...names.filter(Boolean).slice(0, 3));

  const url = r.url
    ? String(r.url)
    : `${cfg.siteBase}/tender/${encodeURIComponent(r.unit_id || '')}/${encodeURIComponent(r.job_number || '')}?announce=${r.date || ''}`;

  const snippetParts = [type, unit ? `機關：${unit}` : ''];
  if (winners.length) snippetParts.push(`得標廠商：${winners.join('、')}`);

  return {
    title: `【${kind}】${title}`,
    url,
    source: '政府電子採購網',
    date: ymdToISO(r.date),
    snippet: snippetParts.filter(Boolean).join(' · '),
  };
}

export async function collectProcurement(fetchImpl = fetch) {
  const cfg = CONFIG.procurement;
  const items = [];
  const errors = [];
  if (!cfg || cfg.enabled === false) return { name: '政府電子採購網', items, errors };
  const seen = new Set();
  for (let i = 0; i < cfg.daysBack; i++) {
    const date = taipeiDateStr(i);
    try {
      const body = await fetchText(`${cfg.apiBase}/listbydate?date=${date}`, fetchImpl);
      const data = JSON.parse(body);
      const records = Array.isArray(data.records) ? data.records : [];
      for (const r of records) {
        const item = normalizeRecord(r, cfg);
        if (!item || seen.has(item.url)) continue;
        seen.add(item.url);
        items.push(item);
      }
    } catch (err) {
      errors.push(`listbydate ${date}: ${err.message}`);
    }
  }
  return { name: '政府電子採購網', items: items.slice(0, cfg.maxItems || CONFIG.maxItemsPerSource), errors };
}

// =============================================================
// 事件聚合：同一件事被多家媒體報導，標題相近的歸成一個「故事」
// 每則加上 story 欄位（＝代表那則的 id），前端據此合併成一張卡
// =============================================================
import { normTitle } from './store.js';
import { geocode } from './classify.js';

// 比對用的標題：去掉 PTT 的 [新聞]/[情報] 前綴與媒體尾巴、標點、空白
function simKey(title) {
  return normTitle(String(title || '').replace(/^\s*[\[【][^\]】]{1,6}[\]】]\s*/, ''));
}

function bigrams(s) {
  const g = new Set();
  for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2));
  return g;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

// 代表那則：有區、有摘要、不是社群轉貼、標題不太長者優先；同分取最早刊出的（原始報導）
function repScore(n) {
  return (n.district ? 2 : 0) + (n.snippet ? 1 : 0) + (/^PTT/.test(n.source || '') ? 0 : 1)
    + ((n.title || '').length <= 45 ? 1 : 0);
}

/**
 * 對整份清單做聚合（每次執行都重跑，規則改了舊資料也跟著變）。
 * - 只比較刊出日相差 windowDays 內的
 * - 字元 bigram Jaccard ≥ threshold 視為同一件事
 * - 同群裡沒有區的，補上群內其他則的區
 * 回傳統計 { stories, merged }
 */
export function clusterStories(news, { threshold = 0.35, windowDays = 21 } = {}) {
  const items = news.map((n, i) => ({ i, n, t: new Date(n.date || 0).getTime(), g: bigrams(simKey(n.title)) }));
  items.sort((a, b) => b.t - a.t);
  const parent = news.map((_, i) => i);
  const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const win = windowDays * 86400000;

  for (let a = 0; a < items.length; a++) {
    for (let b = a + 1; b < items.length; b++) {
      if (items[a].t - items[b].t > win) break;
      if (jaccard(items[a].g, items[b].g) >= threshold) parent[find(items[a].i)] = find(items[b].i);
    }
  }

  const groups = new Map();
  news.forEach((n, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(n);
  });

  let merged = 0;
  for (const members of groups.values()) {
    members.sort((x, y) => repScore(y) - repScore(x) || new Date(x.date || 0) - new Date(y.date || 0));
    const rep = members[0];
    const district = rep.district || (members.find(m => m.district) || {}).district || '';
    for (const m of members) {
      m.story = rep.id;
      if (!m.district && district) {
        m.district = district;
        const { lat, lng } = geocode(district, m.id);
        m.lat = lat; m.lng = lng;
      }
    }
    if (members.length > 1) merged += members.length - 1;
  }
  return { stories: groups.size, merged };
}

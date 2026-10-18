// 公告：读写 Gist
//
// 读和写走的是**两条完全不同的路**，这是实测出来必须分开的：
//
//   · 读  → gist.githubusercontent.com（CDN），**不限速、不带令牌**。
//           一开始我想用 api.github.com 读，实测未登录只有 **60 次/小时**，
//           玩家一多就废 —— 所以读必须走 CDN。
//   · 写  → api.github.com + 令牌（未登录 60/h，带令牌 5000/h，够用）。
//           浏览器跨域预检已实测通过（PATCH 会返回 401 而不是被浏览器拦）。
//
// 三条失败路径一律静默返回，不往控制台抛红错 —— 上次 countapi 那次的教训：
// 浏览器对失败请求一定会打红错，唯一避免的办法是别让失败发生，
// 以及在真失败时**把话说完再藏起来**，而不是让徽章/公告条挂个错误态。
import {
  GIST_USER,
  GIST_ID,
  GIST_FILE,
  NOTICE_PASSWORD_HASH,
  decodeNoticeToken,
} from './noticeConfig.js';

const RAW_URL = GIST_USER && GIST_ID
  ? `https://gist.githubusercontent.com/${GIST_USER}/${GIST_ID}/raw/${GIST_FILE}`
  : '';
const API_URL = GIST_ID ? `https://api.github.com/gists/${GIST_ID}` : '';

// 没配 Gist 就当功能没开：不发请求、不显示任何东西、也就没有任何报错的可能。
export function isNoticeConfigured() {
  return Boolean(RAW_URL);
}

const MAX_TITLE = 60;
const MAX_BODY = 400;

function str(v, max) {
  const s = typeof v === 'string' ? v : '';
  return max ? s.slice(0, max) : s;
}

// 数据来自外部，可能被人手改坏：一律容错，坏条目直接丢掉而不是抛错。
function normalize(raw) {
  if (!raw || !Array.isArray(raw.notices)) return [];
  const list = raw.notices
    .filter((n) => n && typeof n === 'object' && !Array.isArray(n))
    .map((n) => ({
      id: str(n.id),
      title: str(n.title, MAX_TITLE),
      body: str(n.body, MAX_BODY),
      pinned: Boolean(n.pinned),
      createdAt: str(n.createdAt),
      updatedAt: str(n.updatedAt),
    }))
    .filter((n) => n.id && n.title);

  // 置顶的排最前，其余按修改时间倒序。
  list.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (b.updatedAt || '').localeCompare(a.updatedAt || '');
  });
  return list;
}

export function makeNoticeId() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `n-${Date.now().toString(36)}-${rand}`;
}

async function readJson(url, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// 读公告。返回数组；没配置、超时、失败、文件坏掉，一律返回 null/[]，
// 调用方据此把公告条整个藏起来。
//
// 两段式，这个顺序是实测出来的，不是拍脑袋：
//   · 第一发带时间戳绕开 CDN 缓存，刚发布的公告才不用等缓存过期才露面
//     —— 实测 ~280ms，因为每次都得回源
//   · 第二发不带参数直接吃 CDN —— 实测快的时候只要 4ms，但看到的是旧公告
// 第一发求「新」，超时或失败就退到第二发求「稳」。这样哪怕回源慢到被
// 中止（实测确实撞到过一次 5s），公告条也只是晚几秒出现，不会直接消失。
export async function fetchNotices() {
  if (!RAW_URL) return null;

  let data = await readJson(`${RAW_URL}?t=${Date.now()}`, 3000);
  if (data === null) data = await readJson(RAW_URL, 4000);
  if (data === null) return null;

  return normalize(data);
}

export async function hashPassword(password) {
  if (!globalThis.crypto || !globalThis.crypto.subtle) {
    // crypto.subtle 只在安全上下文里有（https 或 localhost）。
    // Netlify 是 https、本地 dev 是 127.0.0.1，两个都算安全上下文。
    throw new Error('当前环境不是安全上下文（需要 https 或 localhost），无法校验密码');
  }
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifyPassword(password) {
  if (!NOTICE_PASSWORD_HASH) return false;
  try {
    const hash = await hashPassword(password);
    return hash === NOTICE_PASSWORD_HASH.toLowerCase();
  } catch {
    return false;
  }
}

// 发布 / 修改：整份公告覆盖写回 Gist。
// 密码在**这里**校验，而不是在页面上 —— 页面校验只是体验，
// 这一层才是「不满足条件就不发请求」。
export async function saveNotices(notices, password) {
  if (!API_URL) throw new Error('还没配置 Gist');
  const token = decodeNoticeToken();
  if (!token) throw new Error('还没配置发布令牌');

  const ok = await verifyPassword(password);
  if (!ok) throw new Error('密码不正确');

  const payload = {
    version: 1,
    notices: normalize({ notices }),
    updatedAt: new Date().toISOString(),
  };

  const res = await fetch(API_URL, {
    method: 'PATCH',
    headers: {
      Authorization: `token ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ files: { [GIST_FILE]: { content: JSON.stringify(payload, null, 2) } } }),
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error('令牌无效或已过期，去 GitHub 换一个新的');
    if (res.status === 403) throw new Error('令牌权限不足（需要 gist 这一项）');
    if (res.status === 404) throw new Error('找不到这个 Gist，检查 ID 是否正确');
    throw new Error(`写入失败（HTTP ${res.status}）`);
  }

  // 返回真正写进去的那份（已排序、已裁剪）。
  // 不能写完就去重新 fetch —— raw CDN 有缓存，那会儿多半还吐旧数据，
  // 页面看着就像"发布了但没生效"。
  return payload.notices;
}

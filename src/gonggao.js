// /gonggao —— 公告管理页
//
// 这一页**不打包 Phaser**：它有独立入口 gonggao/index.html，
// vite.config.js 里配了多页构建，所以玩家进游戏时不会为此多下载 1.5 MB。
//
// 安全模型，写在这里免得以后自己忘了：
//   · 这一页的密码校验是**前端的纸门**，真正挡住写入的钥匙是令牌
//     （在 noticeConfig 里，混淆存储）。它挡"顺手改"，挡不住会抓包的人。
//   · 所有内容一律用 textContent 落 DOM，**绝不拼 innerHTML**。
//     公告正文是外人能改的，一旦拼进 innerHTML 就等于在自家首页上
//     挂了一个存储型 XSS —— 谁发布谁就能在所有玩家浏览器里跑脚本。
import { decodeNoticeToken } from './data/noticeConfig.js';
import {
  isNoticeConfigured,
  fetchNotices,
  saveNotices,
  verifyPassword,
  makeNoticeId,
} from './data/noticeStore.js';
import './gonggao.css';

const $ = (id) => document.getElementById(id);

const gate = $('gg-gate');
const gateForm = $('gg-gate-form');
const passwordInput = $('gg-password');
const gateMsg = $('gg-gate-msg');

const editor = $('gg-editor');
const noticeForm = $('gg-notice-form');
const formTitle = $('gg-form-title');
const titleInput = $('gg-title');
const bodyInput = $('gg-body');
const pinnedInput = $('gg-pinned');
const submitBtn = $('gg-submit');
const cancelBtn = $('gg-cancel');
const formMsg = $('gg-form-msg');

const listEl = $('gg-list');
const emptyEl = $('gg-empty');
const listMsg = $('gg-list-msg');
const reloadBtn = $('gg-reload');

// 通过密码门之后，密码就放在这个模块变量里，会话内不用反复输入。
// 页面一关就没了（模块作用域，不会写进 localStorage）。
let sessionPassword = '';
let notices = [];
let editingId = null;
let busy = false;

function showMsg(el, text, kind = 'ok') {
  if (!el) return;
  if (!text) {
    el.hidden = true;
    el.textContent = '';
    el.classList.remove('is-error');
    return;
  }
  el.hidden = false;
  el.textContent = text;
  el.classList.toggle('is-error', kind === 'error');
}

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderList() {
  listEl.textContent = '';
  emptyEl.hidden = notices.length > 0;

  for (const n of notices) {
    const item = el('li', 'gg-item');

    const head = el('div', 'gg-item-head');
    head.appendChild(el('span', 'gg-item-title', n.title));
    if (n.pinned) head.appendChild(el('span', 'gg-pill', '置顶'));
    const time = el('span', 'gg-item-time', fmtTime(n.updatedAt || n.createdAt));
    if (time.textContent) head.appendChild(time);
    item.appendChild(head);

    if (n.body) item.appendChild(el('p', 'gg-item-body', n.body));

    const actions = el('div', 'gg-item-actions');
    const edit = el('button', 'gg-link', editingId === n.id ? '正在改…' : '修改');
    edit.type = 'button';
    edit.addEventListener('click', () => startEdit(n.id));
    actions.appendChild(edit);

    const del = el('button', 'gg-link gg-link--danger', '删除');
    del.type = 'button';
    del.addEventListener('click', () => removeNotice(n.id));
    actions.appendChild(del);

    item.appendChild(actions);
    listEl.appendChild(item);
  }
}

async function loadList() {
  showMsg(listMsg, '');
  reloadBtn.disabled = true;
  try {
    const data = await fetchNotices();
    if (data === null) {
      // 还没发布过、CDN 还没吐出来、或者网络断了。
      // 空列表是完全正常的初始状态，不该用红字吓人。
      showMsg(listMsg, '暂时读不到公告（可能是还没发布过，或网络没通），稍后再点「刷新」。');
      return;
    }
    notices = data;
    renderList();
  } finally {
    reloadBtn.disabled = false;
  }
}

function resetForm() {
  noticeForm.reset();
  editingId = null;
  formTitle.textContent = '发布新公告';
  submitBtn.textContent = '发布';
  cancelBtn.hidden = true;
  showMsg(formMsg, '');
}

function startEdit(id) {
  const target = notices.find((n) => n.id === id);
  if (!target) return;
  editingId = id;
  titleInput.value = target.title;
  bodyInput.value = target.body;
  pinnedInput.checked = target.pinned;
  formTitle.textContent = '修改公告';
  submitBtn.textContent = '保存修改';
  cancelBtn.hidden = false;
  showMsg(formMsg, '');
  titleInput.focus();
  titleInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function removeNotice(id) {
  const target = notices.find((n) => n.id === id);
  if (!target) return;
  const ok = window.confirm(`确定删除「${target.title}」？删除后玩家首页就看不到了。`);
  if (!ok) return;
  void commit(notices.filter((n) => n.id !== id), '已删除');
}

// 发布 / 修改 / 删除最终都走这一个函数 —— 整份覆盖写回 Gist。
async function commit(nextNotices, doneText) {
  if (busy) return;
  busy = true;
  submitBtn.disabled = true;
  reloadBtn.disabled = true;
  try {
    const saved = await saveNotices(nextNotices, sessionPassword);
    notices = saved;
    renderList();
    resetForm();
    showMsg(formMsg, doneText);
  } catch (err) {
    // 这里的错误是要给人看的（密码错、令牌过期、网络断），
    // 所以显示出来，而不是像读取那样静默。
    showMsg(formMsg, err && err.message ? err.message : '发布失败，请重试', 'error');
  } finally {
    busy = false;
    submitBtn.disabled = false;
    reloadBtn.disabled = false;
  }
}

async function handleGateSubmit(event) {
  event.preventDefault();
  if (busy) return;

  const value = passwordInput.value;
  if (!value) {
    showMsg(gateMsg, '请输入密码', 'error');
    return;
  }

  busy = true;
  submitBtn.disabled = true;
  try {
    const ok = await verifyPassword(value);
    if (!ok) {
      showMsg(gateMsg, '密码不正确', 'error');
      passwordInput.select();
      return;
    }
    sessionPassword = value;
    passwordInput.value = '';
    gate.hidden = true;
    editor.hidden = false;
    showMsg(gateMsg, '');
    await loadList();
    titleInput.focus();
  } catch (err) {
    showMsg(gateMsg, err && err.message ? err.message : '无法校验密码', 'error');
  } finally {
    busy = false;
    submitBtn.disabled = false;
  }
}

function handleNoticeSubmit(event) {
  event.preventDefault();
  const title = titleInput.value.trim();
  if (!title) {
    showMsg(formMsg, '标题不能为空', 'error');
    titleInput.focus();
    return;
  }

  const body = bodyInput.value.trim();
  const pinned = pinnedInput.checked;
  const now = new Date().toISOString();

  if (editingId) {
    const existing = notices.find((n) => n.id === editingId);
    const next = {
      id: editingId,
      title,
      body,
      pinned,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };
    void commit(notices.map((n) => (n.id === editingId ? next : n)), '已保存');
    return;
  }

  const next = {
    id: makeNoticeId(),
    title,
    body,
    pinned,
    createdAt: now,
    updatedAt: now,
  };
  void commit([next, ...notices], '已发布');
}

function boot() {
  // 先把"还没配好"的情况说明白，而不是让人输了密码才发现发不出去。
  if (!isNoticeConfigured()) {
    showMsg(gateMsg, '还没配置 Gist —— 请先在 src/data/noticeConfig.js 里填 GIST_USER 和 GIST_ID。', 'error');
    passwordInput.disabled = true;
    gateForm.querySelector('button').disabled = true;
    return;
  }
  if (!decodeNoticeToken()) {
    showMsg(gateMsg, '还没配置发布令牌 —— 用 scripts/notice-secret.js 生成后填进 noticeConfig.js。', 'error');
    passwordInput.disabled = true;
    gateForm.querySelector('button').disabled = true;
  }
}

gateForm.addEventListener('submit', handleGateSubmit);
noticeForm.addEventListener('submit', handleNoticeSubmit);
cancelBtn.addEventListener('click', resetForm);
reloadBtn.addEventListener('click', () => { void loadList(); });

boot();

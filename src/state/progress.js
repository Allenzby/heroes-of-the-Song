import { CHAPTERS, CHOICE_AT, getChapter, BIG_CHAPTERS, getChaptersByBigChapter } from '../data/chapters.js';

const STORAGE_KEY = 'song-heroes-progress';

// 隐藏的教师模式：网址加 ?unlock=all 就能解锁全部章节，方便课堂上直接演示某一章。
// 它只影响本次访问的解锁判定，不会写进存档，也不会污染学生的正常进度。
function readTeacherMode() {
  try {
    return new URLSearchParams(window.location.search).get('unlock') === 'all';
  } catch {
    return false;
  }
}

export const teacherMode = readTeacherMode();

// 自动演练模式：网址后面加 /auto，进关就由电脑自己打，玩家不用动手。
// 课堂上用来演示"这一关该怎么摆塔"（见 src/game/AutoPlayer.js）。
//
// 三种写法都认，因为它们各有各的用处，而且**不是**每种环境都支持 /auto：
//
//   路径  .../starter-2d-phaser/auto   ← 用户要的写法，开发服务器上能用
//   查询  ...?auto                     ← 静态托管上唯一稳的写法
//   锚点  ...#auto                     ← 同上，而且不会碰服务器一下
//
// 为什么要留后两种：/auto 是**服务器**要认的东西。Vite 的开发服务器
// 默认会把认不出的路径回退到 index.html，所以本地开发时 /auto 能用；
// 但把 dist 传到 GitHub Pages 那种纯静态托管上，/auto 是一个不存在的
// 文件，服务器直接回 404，页面压根打不开。那种场合只能用 ?auto 或 #auto。
//
// 路径判定用 endsWith('/auto') 而**不是** includes('auto')：
// 后者会把任何带 auto 字样的路径（比如某天有个 /autosave）也算进来。
// 顺便去掉结尾的斜杠 —— /auto 和 /auto/ 用户都可能打出来。
//
// 注意 /auto/（带斜杠）在开发服务器上会**加载失败**，这不是这里能修的：
// index.html 里的资源路径是相对的（vite.config.js 设了 base: './'），
// 相对 /auto 解析出来是 /src/main.js（对），相对 /auto/ 是
// /auto/src/main.js（错）。所以下面虽然认了带斜杠的写法，
// 真正打得开的还是不带斜杠的 /auto。
function readAutoMode() {
  try {
    const { pathname, search, hash } = window.location;
    const path = pathname.replace(/\/+$/, '');
    return path.endsWith('/auto')
      || new URLSearchParams(search).has('auto')
      || hash === '#auto';
  } catch {
    return false;
  }
}

export const autoMode = readAutoMode();

const VALID_ROUTES = ['amnesty', 'righteous'];

const emptyProgress = () => ({
  cleared: [],
  hp: {},
  route: null,
});

function load() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return emptyProgress();
    }

    const parsed = JSON.parse(raw);
    const known = new Set(CHAPTERS.map((chapter) => chapter.id));

    return {
      cleared: Array.isArray(parsed.cleared) ? parsed.cleared.filter((id) => known.has(id)) : [],
      hp: parsed.hp && typeof parsed.hp === 'object' ? parsed.hp : {},
      route: VALID_ROUTES.includes(parsed.route) ? parsed.route : null,
    };
  } catch {
    // 存档损坏或浏览器禁用 localStorage 时，退回空进度而不是直接崩掉。
    return emptyProgress();
  }
}

function save(state) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 无痕模式下写入会失败。这里静默忽略：游戏仍可玩，只是不保存。
  }
}

let state = load();

export function getChosenRoute() {
  return state.route;
}

export function isCleared(id) {
  return state.cleared.includes(id);
}

// 判断某章能不能进。
export function isUnlocked(id) {
  if (teacherMode) {
    return true;
  }

  const chapter = getChapter(id);
  if (!chapter) {
    return false;
  }

  // 序章没有前置条件，永远可以进。
  if (chapter.requires === null) {
    return true;
  }

  // 前置章节必须先通关。
  if (!isCleared(chapter.requires)) {
    return false;
  }

  // 第四章两条路线共用，但必须先在方腊最终战做出选择。
  if (chapter.needsRoute && state.route === null) {
    return false;
  }

  return true;
}

// 通过方腊最终战但还没做选择时，需要先做选择才能继续。
export function needsChoice() {
  return isCleared(CHOICE_AT) && state.route === null;
}

// 记录通关。hp 为防线剩余血量。
export function markCleared(id, hp) {
  if (!getChapter(id)) {
    return;
  }

  if (!state.cleared.includes(id)) {
    state.cleared = [...state.cleared, id];
  }
  if (hp !== undefined) {
    state.hp = { ...state.hp, [id]: hp };
  }
  save(state);
}

// 获取某章通关时的防线血量。
export function getClearedHp(id) {
  return state.hp[id];
}

// 记录方腊最终战的选择。
// 两条路线都汇入第四章，所以换选择不影响关卡解锁，只改变剧情与阵容。
export function chooseRoute(route) {
  if (!VALID_ROUTES.includes(route)) {
    return;
  }

  state.route = route;
  save(state);
}

// 下一个该玩的章节，用于「继续游戏」。
export function getNextChapter() {
  return CHAPTERS.find((chapter) => isUnlocked(chapter.id) && !isCleared(chapter.id)) || null;
}

export function resetProgress() {
  state = emptyProgress();
  save(state);
}

// 判断大章节是否解锁。
// 有 locked: true 标记的永远锁定（以后开放）。
// 没有 locked 标记的：只要里面有任一关卡可解锁，大章节就解锁。
export function isBigChapterUnlocked(bigChapter) {
  if (teacherMode) return true;
  if (bigChapter.locked) return false;

  const levels = getChaptersByBigChapter(bigChapter.id);
  return levels.some((ch) => isUnlocked(ch.id));
}

// 获取大章节的通关进度。
export function getBigChapterProgress(bigChapterId) {
  const levels = getChaptersByBigChapter(bigChapterId);
  const cleared = levels.filter((ch) => isCleared(ch.id)).length;
  return { cleared, total: levels.length };
}

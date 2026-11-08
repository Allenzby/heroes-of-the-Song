// 银两钱包：跨关卡的永久资产。
//
// 和 src/state/progress.js 分开存两个 key：
//   song-heroes-progress  解锁状态（哪一关通了、剩多少血、选了哪条路线）
//   song-heroes-wallet    资产（银两、买了什么、首通记录）
//
// 为什么不塞进同一个存档：进度是「游戏结构」，钱包是「玩家财产」。
// 以后改解锁链、加关卡、清进度重来时，混在一起很容易顺手把玩家的钱也清了。
//
// 存档坏了 / 浏览器禁了 localStorage 时一律退回默认值，游戏照样能玩，
// 只是这一局不保存 —— 和 progress.js 的处理方式一致。
import { CHAPTERS } from '../data/chapters.js';
import { getLevel } from '../data/levels.js';
import { SHOP_ITEMS, getItemPrice } from '../data/shopItems.js';
import { isCleared, getClearedHp, teacherMode, autoMode } from './progress.js';

const STORAGE_KEY = 'song-heroes-wallet';
const WALLET_VERSION = 1;

// 开局安家费：第一次进商铺不能全是买不起的，否则玩家不知道这东西怎么玩。
const START_COINS = 100;

// 重复通关的补贴。给一点，但设上限 —— 不然卡关的人反复刷序章就能买空商店，
// 难度设计就失去意义了。
const REPEAT_REWARD = 5;
const REPEAT_LIMIT = 5;

// 满血通关额外 30%。用整数百分比算，避免出现 30 * 0.3 = 8.999… 的四舍五入问题。
const FULL_HP_BONUS_PERCENT = 30;

// 首通赏金。跟着 levels.js 的总血量排队：
// 2300 / 4260 / 4880 / 9180 / 12140 → 30 / 50 / 70 / 95 / 130。
// 加新关卡时顺手核一遍这一行，别让后面的关比前面的给得少。
const FIRST_CLEAR_BOUNTY = {
  prologue: 30,
  ch1: 50,
  ch2: 70,
  ch3: 95,
  ch4: 130,
};

function emptyOwned() {
  const owned = {};
  SHOP_ITEMS.forEach((item) => {
    owned[item.id] = 0;
  });
  return owned;
}

function defaultState() {
  return {
    version: WALLET_VERSION,
    coins: START_COINS,
    owned: emptyOwned(),
    // 拿过首通赏金的关卡。重复通关只看这里 —— 不看 progress 的 cleared，
    // 这样「先通关、后来钱包被重置」之类的边界情况也能自圆其说。
    firstClear: [],
    // 已经拿过几次重复通关补贴。上限 REPEAT_LIMIT。
    repeatCount: {},
  };
}

const KNOWN_CHAPTERS = new Set(CHAPTERS.map((chapter) => chapter.id));

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

// 把读到的存档修成合法形状。
// 原则：缺字段补默认值，多了/错了的字段忽略 —— 旧版本存档不该让新版本崩掉。
function normalize(parsed) {
  const base = defaultState();
  if (!parsed || typeof parsed !== 'object') {
    return base;
  }

  const state = base;
  state.coins = clampInt(parsed.coins, 0, Number.MAX_SAFE_INTEGER, START_COINS);

  if (parsed.owned && typeof parsed.owned === 'object') {
    SHOP_ITEMS.forEach((item) => {
      state.owned[item.id] = clampInt(parsed.owned[item.id], 0, item.max, 0);
    });
  }

  if (Array.isArray(parsed.firstClear)) {
    state.firstClear = [...new Set(parsed.firstClear.filter((id) => KNOWN_CHAPTERS.has(id)))];
  }

  if (parsed.repeatCount && typeof parsed.repeatCount === 'object') {
    Object.keys(parsed.repeatCount).forEach((id) => {
      if (!KNOWN_CHAPTERS.has(id)) return;
      state.repeatCount[id] = clampInt(parsed.repeatCount[id], 0, REPEAT_LIMIT, 0);
    });
  }

  return state;
}

function save() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 无痕模式下写入会失败。静默忽略，本局仍可正常花钱。
  }
}

// 老玩家一次性补发。
//
// 2.12.0 之前没有钱包，通关记录只存在 progress 里。如果直接给 100 安家费，
// 已经打穿大章一的人会发现自己白打了 —— 所以第一次创建钱包时，
// 按「已通关」补一遍首通赏金（满血的还多给 30%）。
//
// 只在 wallet key 不存在时走这里。玩家主动重置钱包后不会再补，
// 那是他自己的选择，不该一刷新又冒出一笔钱。
function createFromLegacy() {
  const state = defaultState();

  CHAPTERS.forEach((chapter) => {
    if (!isCleared(chapter.id)) return;

    const bounty = FIRST_CLEAR_BOUNTY[chapter.id];
    if (!bounty) return;

    const level = getLevel(chapter.map);
    const maxHp = level ? level.lives : 0;
    const hp = getClearedHp(chapter.id);
    const fullHp = maxHp > 0 && typeof hp === 'number' && hp >= maxHp;

    state.firstClear.push(chapter.id);
    state.coins += bounty;
    if (fullHp) {
      state.coins += Math.round((bounty * FULL_HP_BONUS_PERCENT) / 100);
    }
  });

  return state;
}

function load() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const migrated = createFromLegacy();
      // 立刻落盘：否则每刷新一次都会重新扫一遍 progress，虽然结果一样，
      // 但玩家之后花掉的钱会被下一次刷新"复活"回来。
      // 这里不能调 save() —— 那要用到下面才声明的 state，会撞上 TDZ。
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      } catch {
        // 写不进去就算了，本次仍按补发后的数字玩。
      }
      return migrated;
    }
    return normalize(JSON.parse(raw));
  } catch {
    return defaultState();
  }
}

let state = load();

// ---------- 查询 ----------

export function getCoins() {
  return state.coins;
}

export function getOwned(id) {
  return state.owned[id] || 0;
}

// 开局要叠加的增益。GameScene 每关 create 时取一次。
// 免死金牌返回的是「库存数量」，真正消耗发生在触发的那一刻。
export function getRunModifiers() {
  const mods = { gold: 0, lives: 0, revive: 0 };

  SHOP_ITEMS.forEach((item) => {
    const level = state.owned[item.id] || 0;
    if (item.effect.goldPerLevel) {
      mods.gold += level * item.effect.goldPerLevel;
    }
    if (item.effect.livesPerLevel) {
      mods.lives += level * item.effect.livesPerLevel;
    }
    if (item.effect.revive) {
      mods.revive += level * item.effect.revive;
    }
  });

  return mods;
}

// ---------- 购买 ----------

// 返回 { ok, reason, price, level }。
// reason: 'unknown' 没这个商品 / 'max' 已满 / 'coins' 银两不够。
export function buy(id) {
  const item = SHOP_ITEMS.find((entry) => entry.id === id);
  if (!item) {
    return { ok: false, reason: 'unknown' };
  }

  const current = state.owned[id] || 0;
  const price = getItemPrice(item, current);
  if (price === null) {
    return { ok: false, reason: 'max' };
  }
  if (state.coins < price) {
    return { ok: false, reason: 'coins' };
  }

  state.coins -= price;
  state.owned[id] = current + 1;
  save();

  return { ok: true, price, level: current + 1 };
}

// 消耗一张免死金牌。GameScene 里触发后调用。
// 返回剩余张数；没库存就直接返回 0，不会扣成负数。
export function consumeRevive() {
  const current = state.owned.revive || 0;
  if (current <= 0) {
    return 0;
  }
  state.owned.revive = current - 1;
  save();
  return state.owned.revive;
}

// ---------- 通关结算 ----------

// 记录一次通关，返回给结算界面显示的结果。
//
// 教师模式（?unlock=all）和自动演练（/auto）不结算，也不写 firstClear ——
// 演示一次不该白拿赏金，更不该占掉玩家自己打首通的机会。
//
// repeatCount 只在真正发了钱的时候才 +1；上限用完后就一直返回 0。
export function recordClear(chapterId, hp, maxLives) {
  if (teacherMode || autoMode) {
    return { skipped: true, amount: 0, first: false, fullHp: false, capped: false };
  }

  const base = FIRST_CLEAR_BOUNTY[chapterId];
  if (!base) {
    return { skipped: true, amount: 0, first: false, fullHp: false, capped: false };
  }

  const first = !state.firstClear.includes(chapterId);
  let amount = 0;
  let fullHp = false;
  let capped = false;

  if (first) {
    amount = base;
    state.firstClear.push(chapterId);

    if (maxLives > 0 && hp >= maxLives) {
      fullHp = true;
      amount += Math.round((base * FULL_HP_BONUS_PERCENT) / 100);
    }
  } else {
    const used = state.repeatCount[chapterId] || 0;
    if (used < REPEAT_LIMIT) {
      state.repeatCount[chapterId] = used + 1;
      amount = REPEAT_REWARD;
    } else {
      capped = true;
    }
  }

  state.coins += amount;
  save();

  return { skipped: false, amount, first, fullHp, capped };
}

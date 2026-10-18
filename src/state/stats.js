// 游戏统计数据。
//
// 记录玩家的整体游戏数据，显示在"关于"页面。
const STORAGE_KEY = 'song-heroes-stats';

const DEFAULTS = {
  totalKills: 0,
  totalPlayTime: 0,    // 秒
  totalRebuilds: 0,    // 重建次数
  totalGamesPlayed: 0, // 进入关卡次数
  totalWavesCleared: 0, // 通关波次数
};

function load() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULTS };
    }
    const parsed = JSON.parse(raw);
    return {
      totalKills: typeof parsed.totalKills === 'number' ? parsed.totalKills : 0,
      totalPlayTime: typeof parsed.totalPlayTime === 'number' ? parsed.totalPlayTime : 0,
      totalRebuilds: typeof parsed.totalRebuilds === 'number' ? parsed.totalRebuilds : 0,
      totalGamesPlayed: typeof parsed.totalGamesPlayed === 'number' ? parsed.totalGamesPlayed : 0,
      totalWavesCleared: typeof parsed.totalWavesCleared === 'number' ? parsed.totalWavesCleared : 0,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(state) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

let state = load();

// ---------- 更新函数 ----------

export function addKills(count = 1) {
  state.totalKills += count;
  save(state);
}

export function addPlayTime(seconds) {
  if (seconds > 0) {
    state.totalPlayTime += seconds;
    save(state);
  }
}

export function addRebuild() {
  state.totalRebuilds += 1;
  save(state);
}

export function addGamePlayed() {
  state.totalGamesPlayed += 1;
  save(state);
}

export function addWavesCleared(count = 1) {
  state.totalWavesCleared += count;
  save(state);
}

// ---------- 查询函数 ----------

export function getStats() {
  return { ...state };
}

export function formatPlayTime(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  if (hours > 0) {
    return `${hours} 小时 ${minutes} 分钟`;
  }
  if (minutes > 0) {
    return `${minutes} 分钟 ${seconds} 秒`;
  }
  return `${seconds} 秒`;
}

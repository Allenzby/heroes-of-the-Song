// 玩家的设置。
//
// 和进度存档（src/state/progress.js）分开存两个 key，不合并成一个：
// 「设置」和「打到第几关」是两件不相干的事 —— 清存档重打不该把音量也重置掉，
// 反过来存档格式改了也不该把玩家调好的音量弄丢。
const STORAGE_KEY = 'song-heroes-settings';

// 默认值。
const DEFAULTS = {
  sfx: 1,
  bgm: 0.25,
  autoPause: true,
  soundPreview: true,
  thumbnails: false,
};

// 音量夹到 0~1。存档被手改过、或者以后加了别的输入来源时兜底。
function clamp01(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return 1;
  }
  return Math.min(1, Math.max(0, num));
}

function load() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULTS };
    }
    const parsed = JSON.parse(raw);
    return {
      sfx: parsed.sfx === undefined ? DEFAULTS.sfx : clamp01(parsed.sfx),
      bgm: parsed.bgm === undefined ? DEFAULTS.bgm : clamp01(parsed.bgm),
      autoPause: parsed.autoPause === undefined ? DEFAULTS.autoPause : Boolean(parsed.autoPause),
      soundPreview: parsed.soundPreview === undefined ? DEFAULTS.soundPreview : Boolean(parsed.soundPreview),
      thumbnails: parsed.thumbnails === undefined ? DEFAULTS.thumbnails : Boolean(parsed.thumbnails),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function save() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

let state = load();

export function getSfxVolume() {
  return state.sfx;
}

export function getBgmVolume() {
  return state.bgm;
}

export function isAutoPause() {
  return state.autoPause;
}

export function isSoundPreview() {
  return state.soundPreview;
}

export function isThumbnails() {
  return state.thumbnails;
}

export function storeSfxVolume(value) {
  state.sfx = clamp01(value);
  save();
}

export function storeBgmVolume(value) {
  state.bgm = clamp01(value);
  save();
}

export function setAutoPause(enabled) {
  state.autoPause = enabled;
  save();
}

export function setSoundPreview(enabled) {
  state.soundPreview = enabled;
  save();
}

export function setThumbnails(enabled) {
  state.thumbnails = enabled;
  save();
}

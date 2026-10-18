// 设置弹框：音效音量 + 背景音乐音量。
//
// 从菜单里的「⚙ 设置」打开（见 src/ui/hud.js）。
//
// 为什么是 DOM 而不是画在画布上：和确认弹框同理（见 confirmDialog.js 的开头）——
// 滑块这种控件用原生 <input type="range"> 一行就有键盘操作、触摸拖动
// 和读屏支持，画在 Canvas 上全都得自己实现一遍。
//
// 音量值存在 src/state/settings.js（localStorage），
// 真正让声音变响变轻的是 src/game/sfx.js 的 setSfxVolume / setBgmVolume ——
// 这里只负责"滑块动了就告诉它们"。
import {
  setSfxVolume, setBgmVolume, getSfxVolume, getBgmVolume, playUiClick,
} from '../game/sfx.js';
import {
  isAutoPause, isSoundPreview, isThumbnails,
  setAutoPause, setSoundPreview, setThumbnails,
} from '../state/settings.js';
import { getStats, formatPlayTime } from '../state/stats.js';
import { showConfirm } from './confirmDialog.js';
import { showChangelog, CURRENT_VERSION } from './changelog.js';

const dialog = document.getElementById('settings-dialog');
const panel = dialog.querySelector('.settings-panel');
const closeButton = document.getElementById('settings-close');

const sfxSlider = document.getElementById('sfx-slider');
const sfxValue = document.getElementById('sfx-value');
const bgmSlider = document.getElementById('bgm-slider');
const bgmValue = document.getElementById('bgm-value');

const autoPauseToggle = document.getElementById('auto-pause-toggle');
const soundPreviewToggle = document.getElementById('sound-preview-toggle');
const thumbnailsToggle = document.getElementById('thumbnails-toggle');

const tabs = dialog.querySelectorAll('.settings-tab');
const tabContents = dialog.querySelectorAll('.settings-tab-content');

// 统计数据元素
const statKills = document.getElementById('stat-kills');
const statTime = document.getElementById('stat-time');
const statRebuilds = document.getElementById('stat-rebuilds');
const statGames = document.getElementById('stat-games');

// 关于页的「更新日志」按钮 + 版本号。
// 版本号从 changelog.json 读，别写死在 HTML 里 —— 三处对不上是迟早的事。
const changelogButton = document.getElementById('about-changelog-button');
const versionEl = document.querySelector('.about-version');

if (versionEl) versionEl.textContent = `版本 ${CURRENT_VERSION}`;
if (changelogButton) {
  changelogButton.addEventListener('click', () => {
    playUiClick();
    showChangelog();
  });
}

function renderStats() {
  const stats = getStats();
  if (statKills) statKills.textContent = stats.totalKills.toLocaleString();
  if (statTime) statTime.textContent = formatPlayTime(stats.totalPlayTime);
  if (statRebuilds) statRebuilds.textContent = stats.totalRebuilds.toLocaleString();
  if (statGames) statGames.textContent = stats.totalGamesPlayed.toLocaleString();
}

function switchTab(tabName) {
  tabs.forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.tab === tabName);
  });
  tabContents.forEach((content) => {
    content.classList.toggle('is-active', content.id === `tab-${tabName}`);
  });

  // 切到关于页时刷新统计数据
  if (tabName === 'about') {
    renderStats();
  }
}

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    switchTab(tab.dataset.tab);
  });
});

// 关掉之后要调的回调（把游戏恢复回打开设置之前的状态）。
// 同时当"开着没开"的标志用，和 confirmDialog.js 一个套路。
let onClosed = null;
let isOpen = false;

export function isSettingsOpen() {
  return isOpen;
}

// 0~1 的小数 ↔ 滑块的 0~100 整数。
//
// 滑块用整数百分比而不是 0~1 的小数：step 是 5，拖起来有档位感，
// 小朋友不会拖出 0.37 这种数；显示成「35%」也比「0.35」直观。
const toPercent = (value) => Math.round(value * 100);
const fromPercent = (percent) => Number(percent) / 100;

function renderSfx(percent) {
  sfxValue.textContent = `${percent}%`;
}

function renderBgm(percent) {
  bgmValue.textContent = `${percent}%`;
}

// input 事件（拖动过程中连续触发）就应用，不等松手。
//
// 拖着滑块时立刻听到音量变化，这是唯一能让人确认"调对了"的反馈 ——
// 等 change 事件（松手才触发）的话，玩家得来回试好几次。
// 每次都写一遍 localStorage 也没关系：拖一次几十下写入，
// localStorage 是同步的但这点量完全无感。
sfxSlider.addEventListener('input', () => {
  const percent = Number(sfxSlider.value);
  renderSfx(percent);
  setSfxVolume(fromPercent(percent));
});

// 音效滑块松手时播一声，让玩家听到调完之后是多大。
//
// 只在松手（change）时播，不在拖动（input）时播 —— 拖动一次会触发几十次
// input，每次都播就是一串"咔咔咔"。
//
// 用按钮点击音来试听：它走原生 Audio（不需要 Phaser 的 scene），
// 所以在任何界面都能响，而且它本来就跟着音效音量走。
// 注意 main.js 那个全局 click 监听只管 <button>，滑块不是按钮，
// 所以拖它不会自动响 —— 这一声得自己播。
//
// 背景音乐那个滑块不需要这一下：它本身就一直响着，拖的时候就听见了。
sfxSlider.addEventListener('change', () => {
  playUiClick();
});

bgmSlider.addEventListener('input', () => {
  const percent = Number(bgmSlider.value);
  renderBgm(percent);
  setBgmVolume(fromPercent(percent));
});

// 切换开关状态
function renderToggle(toggle, isOn) {
  toggle.classList.toggle('is-on', isOn);
  toggle.setAttribute('aria-checked', isOn ? 'true' : 'false');
}

autoPauseToggle.addEventListener('click', () => {
  const newValue = !isAutoPause();
  setAutoPause(newValue);
  renderToggle(autoPauseToggle, newValue);
});

soundPreviewToggle.addEventListener('click', () => {
  const newValue = !isSoundPreview();
  setSoundPreview(newValue);
  renderToggle(soundPreviewToggle, newValue);
});

thumbnailsToggle.addEventListener('click', () => {
  const newValue = !isThumbnails();

  if (newValue) {
    // 开启缩略图时显示警告
    showConfirm({
      title: '加载缩略图',
      message: '开启后将使用低分辨率图片，画质会明显下降，但加载速度会加快。开启后页面会自动刷新。',
      confirmText: '确定开启',
      cancelText: '取消',
      onConfirm: () => {
        setThumbnails(true);
        renderToggle(thumbnailsToggle, true);
        // 自动刷新页面使设置生效
        setTimeout(() => window.location.reload(), 300);
      },
    });
  } else {
    setThumbnails(false);
    renderToggle(thumbnailsToggle, false);
    // 关闭缩略图也需要刷新才能加载原图
    showConfirm({
      title: '关闭缩略图',
      message: '关闭后将恢复高分辨率图片，画质会提升。页面会自动刷新。',
      confirmText: '确定关闭',
      cancelText: '取消',
      onConfirm: () => {
        window.location.reload();
      },
    });
  }
});

// 音效试听：拖动音效滑块时自动播放一声
sfxSlider.addEventListener('input', () => {
  if (isSoundPreview()) {
    playUiClick();
  }
});

function close() {
  if (!isOpen) {
    return;
  }

  const callback = onClosed;
  // 先清状态再回调：回调里会恢复游戏（可能还会动别的界面），
  // 那时状态必须已经是"关上了"。
  isOpen = false;
  onClosed = null;

  dialog.classList.add('dialog-closing');
  setTimeout(() => {
    dialog.hidden = true;
    dialog.classList.remove('dialog-open', 'dialog-closing');
    if (callback) {
      callback();
    }
  }, 200);
}

// 打开设置。onClose 用来在关闭时恢复游戏 —— 打开设置会顺带暂停，
// 谁暂停的谁负责恢复，这个弹框自己不碰 runtime。
export function showSettings({ onClose = null } = {}) {
  if (isOpen) {
    return;
  }

  isOpen = true;
  onClosed = onClose;

  const sfxPercent = toPercent(getSfxVolume());
  const bgmPercent = toPercent(getBgmVolume());
  sfxSlider.value = String(sfxPercent);
  bgmSlider.value = String(bgmPercent);
  renderSfx(sfxPercent);
  renderBgm(bgmPercent);

  renderToggle(autoPauseToggle, isAutoPause());
  renderToggle(soundPreviewToggle, isSoundPreview());
  renderToggle(thumbnailsToggle, isThumbnails());

  switchTab('volume');
  dialog.hidden = false;
  dialog.classList.remove('dialog-closing');
  dialog.classList.add('dialog-open');

  closeButton.focus();
}

// 主动关掉（不触发 onClose 回调）。退出关卡时用 ——
// 场景都销毁了，屏幕上不能还盖着一个针对那一关的弹框。
export function hideSettings() {
  isOpen = false;
  onClosed = null;
  dialog.hidden = true;
  dialog.classList.remove('dialog-open', 'dialog-closing');
}

closeButton.addEventListener('click', close);

// 点框外面就关。设置没有"确定/取消"—— 拖动时已经生效并存下来了，
// 所以关闭这个动作没有任何代价，点哪儿关都行。
dialog.addEventListener('click', (event) => {
  if (!panel.contains(event.target)) {
    close();
  }
});

// 弹框开着的时候把键盘截下来。
//
// 用捕获阶段，理由和 confirmDialog.js 里那段一样：window 上挂着 hud.js 的
// 按键处理（Esc 开菜单、空格暂停），不截的话按 Esc 会"关掉设置的同时
// 又把菜单打开了"，按空格会在设置界面里把游戏恢复掉。
//
// 但**方向键要放过去**：那是滑块自己要用的（左右箭头调音量），
// 截掉的话键盘用户就没法调了。hud.js 不监听方向键，放过去是安全的。
window.addEventListener('keydown', (event) => {
  if (!isOpen) {
    return;
  }

  if (event.key.startsWith('Arrow')) {
    return;
  }

  event.stopPropagation();

  if (event.key === 'Escape') {
    event.preventDefault();
    close();
  }
}, true);

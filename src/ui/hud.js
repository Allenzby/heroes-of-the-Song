import { SPEEDS } from '../game/LevelRuntime.js';
import { playSfx } from '../game/sfx.js';
import { showConfirm, hideConfirm, isConfirmOpen } from './confirmDialog.js';
import { showSettings, hideSettings, isSettingsOpen } from './settingsDialog.js';
import { isAutoPause } from '../state/settings.js';

const hudEl = document.getElementById('hud');
const goldEl = document.getElementById('gold-display');
const goldValue = document.getElementById('gold-value');
const waveEl = document.getElementById('wave-display');
const pauseButton = document.getElementById('pause-button');
const speedButtons = Array.from(document.querySelectorAll('.speed-button'));

const menuWrap = document.querySelector('.hud-menu');
const menuButton = document.getElementById('menu-button');
const menuPanel = document.getElementById('menu-panel');
const menuRetry = document.getElementById('menu-retry');
const menuSettings = document.getElementById('menu-settings');
const menuBack = document.getElementById('menu-back');

// 当前接管 HUD 的关卡运行时。切关或返回选章时置空，
// 避免旧关卡的按钮事件打到已经销毁的场景上。
let runtime = null;

// 菜单项的动作由 main.js 注入 —— 重试和返回都要动屏幕和游戏实例，
// 那是 main.js 的职责，HUD 只负责按钮。
let handlers = { onRetry: null, onBack: null };

export function setMenuHandlers(next) {
  handlers = { ...handlers, ...next };
}

function setButtonsEnabled(enabled) {
  pauseButton.disabled = !enabled;
  speedButtons.forEach((button) => {
    button.disabled = !enabled;
  });
  // 全屏按钮不在这里 —— 它和菜单按钮一样，
  // 倒计时期间、结算之后都该能用，因为它和关卡内容无关。
}

function setMenuOpen(open) {
  if (open) {
    menuPanel.hidden = false;
    menuPanel.classList.remove('dialog-closing');
    menuPanel.classList.add('dialog-open');
  } else {
    menuPanel.classList.add('dialog-closing');
    setTimeout(() => {
      menuPanel.hidden = true;
      menuPanel.classList.remove('dialog-open', 'dialog-closing');
    }, 150);
  }
  menuButton.setAttribute('aria-expanded', open ? 'true' : 'false');
  menuButton.classList.toggle('is-open', open);
}

function renderPauseButton() {
  if (!runtime) {
    return;
  }
  pauseButton.textContent = runtime.paused ? '▶ 继续' : '⏸ 暂停';
  pauseButton.classList.toggle('is-paused', runtime.paused);
}

function renderSpeedButtons() {
  if (!runtime) {
    return;
  }
  speedButtons.forEach((button) => {
    const speed = Number(button.dataset.speed);
    button.classList.toggle('is-active', speed === runtime.speed);
  });
}

// 金币显示。原来画在画布右上角，正好被 HUD 这排按钮压住，
// 所以搬到 HUD 里当第一个元素，和按钮排成一行。
// 由 GameScene 通过 TowerManager 的 onGoldChange 回调驱动。
export function setGold(gold) {
  goldValue.textContent = gold;
}

export function setWave(current, total) {
  waveEl.textContent = `第 ${current} / ${total} 波`;
  waveEl.hidden = false;
}

export function hideWave() {
  waveEl.hidden = true;
}

// 收到击杀奖励时让金币数字跳一下（动画在 style.css 的 .hud-gold.is-gaining 里）。
//
// 地图上的 "+10" 飘字（src/game/GoldPopup.js）和这里是一对：
// 一个说"这个敌人给了多少"，一个说"总数变了"，
// 玩家一眼能把两者对上。
//
// 连着击杀时要先摘掉 class 再重新加，否则 CSS 动画不会重头播 ——
// 中间必须强制一次重排（读 offsetWidth）浏览器才认。
export function pulseGold() {
  goldEl.classList.remove('is-gaining');
  void goldEl.offsetWidth;
  goldEl.classList.add('is-gaining');
}

// 关卡开始时由 GameScene 调用，把 HUD 接到这一关的运行时上。
export function attachHud(levelRuntime) {
  runtime = levelRuntime;
  setButtonsEnabled(false);   // 倒计时期间不可操作
  setMenuOpen(false);
  renderPauseButton();
  renderSpeedButtons();
}

// 倒计时结束后开放按钮。
export function enableHud() {
  if (!runtime) {
    return;
  }
  setButtonsEnabled(true);
  renderPauseButton();
  renderSpeedButtons();
}

export function detachHud() {
  runtime = null;
  setButtonsEnabled(false);
  setMenuOpen(false);
  hideWave();
  hideConfirm();
  // 设置弹框同理。它比确认框更可能真的开着 —— 玩家在结算画面上
  // 开着设置调音量，等倒计时归零就自动回选章界面了，
  // 弹框不收的话会一直盖在选章界面上，而且它是模态的（点框外只会关自己，
  // 但底下的章节卡片点不到），看着就是卡住了。
  hideSettings();
  // HUD 是全局共用的一份 DOM，退出关卡要把金币清零，
  // 否则下一关开场的一瞬间会闪出上一关的数字。
  setGold(0);
  goldEl.classList.remove('is-gaining');
  pauseButton.textContent = '⏸ 暂停';
  pauseButton.classList.remove('is-paused');
}

// 暂停音效。
//
// 只在"暂停"这一下响，继续游戏时不响 —— 这个音效本来就是暂停的提示音，
// 恢复的时候再响一遍会让人分不清刚才到底是停了还是走了。
//
// HUD 拿不到 scene，从 runtime 里取（LevelRuntime 构造时存了 scene）。
function playPauseSfx() {
  if (runtime && runtime.paused && runtime.scene) {
    playSfx(runtime.scene, 'pause');
  }
}

pauseButton.addEventListener('click', () => {
  if (!runtime || !runtime.started) {
    return;
  }
  runtime.togglePaused();
  renderPauseButton();
  playPauseSfx();
});

speedButtons.forEach((button) => {
  button.addEventListener('click', () => {
    if (!runtime || !runtime.started) {
      return;
    }
    const speed = Number(button.dataset.speed);
    if (!SPEEDS.includes(speed)) {
      return;
    }
    runtime.setSpeed(speed);
    renderSpeedButtons();
  });
});

menuButton.addEventListener('click', () => {
  setMenuOpen(menuPanel.hidden);
});

menuRetry.addEventListener('click', () => {
  setMenuOpen(false);
  if (handlers.onRetry) {
    handlers.onRetry();
  }
});

menuSettings.addEventListener('click', () => {
  setMenuOpen(false);

  // 开设置的同时把游戏暂停掉，理由和底下退出确认框那段一样：
  // 调音量得试听、得拖滑块，这几秒里敌人还在走的话就是在逼着玩家快点。
  //
  // 记下原来是不是暂停着 —— 玩家自己按了暂停再来开设置的话，
  // 关掉设置后应该还是暂停状态，不能替他恢复。
  //
  // 倒计时期间（!started）不能动 runtime：那时暂停还没有意义，
  // setPaused 会把 Clock 停掉，倒计时的 setTimeout 不受影响照样走完，
  // 结果是关卡"开始"了但时间是停的。所以这种情况只开弹框，不碰暂停。
  const canPause = runtime && runtime.started;
  const wasPaused = canPause ? runtime.paused : true;
  if (canPause && !wasPaused) {
    runtime.setPaused(true);
    renderPauseButton();
  }

  showSettings({
    onClose: () => {
      // 弹框开着的时候玩家可能已经从别的路径离开了关卡
      // （比如胜利倒计时归零），那时 detachHud() 已经把 runtime 置空。
      if (runtime && !wasPaused) {
        runtime.setPaused(false);
        renderPauseButton();
      }
    },
  });
});

menuBack.addEventListener('click', () => {
  setMenuOpen(false);
  if (!handlers.onBack) {
    return;
  }

  // 关卡还没打完就退出的话，塔、金币、打到第几波全都没了，
  // 而且没通关也不会记进存档 —— 这个代价不小，先问一句。
  //
  // 已经通关或失守（runtime.settled）就直接走：那时候胜利记录已经存下来了，
  // 再说"进度不会保存"是假话；失守的话也没什么可丢的。
  // 倒计时期间（!started）同理 —— 还什么都没建，退出不损失任何东西。
  if (!runtime || !runtime.started || runtime.settled) {
    handlers.onBack();
    return;
  }

  // 弹框弹出来的同时把游戏暂停掉。
  //
  // 不暂停的话玩家在读提示的这几秒里敌人还在走、防线还在掉血 ——
  // 一个"要不要退出"的问题不该让人有时间压力。
  // 记下原来是不是暂停着：如果玩家自己就按了暂停，
  // 点「继续游戏」之后应该还是暂停状态，不能替他恢复。
  const wasPaused = runtime.paused;
  if (!wasPaused) {
    runtime.setPaused(true);
    renderPauseButton();
  }

  const resume = () => {
    // 弹框还开着的时候玩家可能从别的路径离开了关卡（比如胜利倒计时归零），
    // 那时 detachHud() 已经把 runtime 置空，这里不能再碰它。
    if (runtime && !wasPaused) {
      runtime.setPaused(false);
      renderPauseButton();
    }
  };

  showConfirm({
    title: '确定要退出本关吗？',
    message: '本次游戏进度不会保存。已经建好的塔、攒下的金币和打到第几波都会清空，'
      + '重新进入这一关要从头再来。',
    confirmText: '退出本关',
    cancelText: '继续游戏',
    danger: true,
    onConfirm: () => {
      // 这里**不**恢复暂停：马上就要离开关卡了，
      // 场景 shutdown 之后 GameScene.create() 会重新复位 time.paused。
      handlers.onBack();
    },
    onCancel: resume,
  });
});

// 点菜单外面就收起来。用捕获阶段之外的普通冒泡即可，
// 上面的按钮回调已经先执行过了。
document.addEventListener('click', (event) => {
  if (menuPanel.hidden || menuWrap.contains(event.target)) {
    return;
  }
  setMenuOpen(false);
});

window.addEventListener('keydown', (event) => {
  // HUD 不可见（不在游戏画面）时不响应任何快捷键。
  if (hudEl.offsetParent === null) {
    return;
  }

  // 确认框开着的时候键盘归它。它在捕获阶段就 stopPropagation 了，
  // 正常情况下事件根本传不到这儿，这里只是双保险。
  if (isConfirmOpen() || isSettingsOpen()) {
    return;
  }

  if (event.code === 'Escape') {
    setMenuOpen(menuPanel.hidden);
    return;
  }

  // 空格键暂停/继续，课堂上讲解时比点按钮方便。
  if (event.code !== 'Space' || !runtime || !runtime.started) {
    return;
  }
  event.preventDefault();
  runtime.togglePaused();
  renderPauseButton();
  playPauseSfx();
});

// 自动暂停：切到后台时自动暂停游戏。
document.addEventListener('visibilitychange', () => {
  if (!isAutoPause() || !runtime || !runtime.started || runtime.settled) {
    return;
  }
  if (document.hidden && !runtime.paused) {
    runtime.setPaused(true);
    renderPauseButton();
    playPauseSfx();
  }
});

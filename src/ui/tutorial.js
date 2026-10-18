// 新手引导：在序章（isTutorial）关卡中按步骤显示提示。
//
// 只在序章生效，通过 GameScene 的回调驱动步骤推进。
// 提示用 DOM 实现（和 HUD 同层），不走 Canvas ——
// 这样关卡销毁时不用清理 Phaser 对象，也不影响游戏深度排序。
const STORAGE_KEY = 'song-heroes-tutorial-done';

let hintEl = null;
let currentStep = -1;
let active = false;
let onComplete = null;

function ensureElement() {
  if (hintEl) {
    return;
  }
  hintEl = document.createElement('div');
  hintEl.className = 'tutorial-hint';
  hintEl.hidden = true;
  document.body.appendChild(hintEl);
}

// 引导步骤定义。
//
// 每一步有：
//   text   — 显示的文字
//   trigger — 触发下一步的条件（由 GameScene 回调调用 advance()）
//
// 触发时机由 GameScene 控制，这里只管显示。
const STEPS = [
  { text: '点击蓝色圆圈，建造你的第一座塔' },
  { text: '选择一个武将，就能在该位置建塔' },
  { text: '敌人来了！塔会自动攻击' },
  { text: '点击已建好的塔，可以升级或拆除' },
  { text: '继续防守，消灭所有敌人即可通关！' },
];

export function isTutorialDone() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markTutorialDone() {
  try {
    window.localStorage.setItem(STORAGE_KEY, '1');
  } catch { /* ignore */ }
}

export function startTutorial({ onDone = null } = {}) {
  ensureElement();
  currentStep = -1;
  active = true;
  onComplete = onDone;
  advance();
}

function advance() {
  if (!active) {
    return;
  }
  currentStep += 1;
  if (currentStep >= STEPS.length) {
    finish();
    return;
  }
  hintEl.textContent = STEPS[currentStep].text;
  hintEl.hidden = false;
}

export function onBuild() {
  // 建了第一座塔后推进两步（跳过"选择武将"那步，因为已经选了）
  if (currentStep === 0 || currentStep === 1) {
    currentStep = 1;
    advance();
  }
}

export function onFirstEnemy() {
  if (currentStep === 2) {
    advance();
  }
}

export function onUpgradeOrDemolish() {
  if (currentStep === 3) {
    advance();
  }
}

export function onWave4() {
  if (currentStep === 4) {
    advance();
  }
}

function finish() {
  active = false;
  hintEl.hidden = true;
  markTutorialDone();
  if (onComplete) {
    onComplete();
  }
}

export function hideTutorial() {
  active = false;
  if (hintEl) {
    hintEl.hidden = true;
  }
}

import Phaser from 'phaser';
import { gameConfig } from './config/game.js';
import { initChapterSelect, renderChapterSelect, backToBigChapters } from './ui/chapterSelect.js';
import { initRotateHint } from './ui/rotateHint.js';
import { attachForcedLandscape } from './ui/forcedLandscape.js';
import { markCleared } from './state/progress.js';
import { setMenuHandlers } from './ui/hud.js';
import { showSettings } from './ui/settingsDialog.js';
import { stopBgm, playUiClick } from './game/sfx.js';
import { cachedVisitorCount, hitVisitorCount } from './ui/visitorCounter.js';
import { hideTutorial } from './ui/tutorial.js';
import { showCodex } from './ui/codex.js';
import { showTransferDialog } from './ui/transfer.js';
// 全屏按钮（首页 / 选关页 / 关卡 HUD 各一个，共用一份逻辑）。
// 必须在 main 里 import：hud.js 只负责关卡那一个，
// 另外两个按钮在 HUD 加载前就已经存在于 DOM。
import './ui/fullscreen.js';
// 首页公告条。import 它只是为了让模块被拉进来 ——
// 真正的初始化在下面调 initNoticeTicker()，因为那三个 DOM 元素
// 要等到 main.js 执行到那一行才拿得到。
import { initNoticeTicker } from './ui/noticeTicker.js';
import './style.css';

const startScreen = document.getElementById('start-screen');
const selectScreen = document.getElementById('select-screen');
const gameScreen = document.getElementById('game-screen');

const startButton = document.getElementById('start-button');
const codexButton = document.getElementById('codex-button');
const selectBackButton = document.getElementById('select-back-button');
const selectSettingsButton = document.getElementById('select-settings-button');
const selectTransferButton = document.getElementById('select-transfer-button');

let game = null;
let currentChapter = null;
let isAnimating = false;

const ANIM_DURATION = 300;

function showScreen(target, animation = 'none') {
  if (isAnimating) return;

  const screens = [startScreen, selectScreen, gameScreen];
  const current = screens.find((s) => !s.hidden);

  if (animation === 'none' || !current || current === target) {
    screens.forEach((s) => { s.hidden = s !== target; });
    syncVisitorBadge(target);
    return;
  }

  isAnimating = true;

  // 动画逻辑：
  //   forward (进入下一级)：当前屏幕向左滑出，新屏幕从右侧滑入
  //   backward (返回上一级)：当前屏幕向右滑出，新屏幕从左侧滑入
  //   fade (跨级/特殊)：淡出 + 淡入
  const animMap = {
    'select-from-start':  { out: 'anim-slide-out-left',  in: 'anim-slide-in-right' },
    'start-from-select':  { out: 'anim-slide-out-right', in: 'anim-slide-in-left' },
    'game-from-select':   { out: 'anim-slide-out-left',  in: 'anim-slide-in-right' },
    'select-from-game':   { out: 'anim-slide-out-right', in: 'anim-slide-in-left' },
    'start-from-game':    { out: 'anim-fade-out',        in: 'anim-fade-in' },
    'game-from-start':    { out: 'anim-fade-out',        in: 'anim-fade-in' },
  };

  const anim = animMap[animation] || { out: 'anim-fade-out', in: 'anim-fade-in' };

  current.classList.add(anim.out);
  target.hidden = false;
  target.classList.add(anim.in);
  syncVisitorBadge(target);

  setTimeout(() => {
    current.hidden = true;
    current.classList.remove(anim.out);
    target.classList.remove(anim.in);
    isAnimating = false;
  }, ANIM_DURATION);
}

function showStartScreen() {
  const heroShowcase = document.querySelector('.hero-showcase');
  if (heroShowcase) {
    heroShowcase.classList.remove('is-leaving');
  }
  showScreen(startScreen, 'start-from-select');
  sleepGame();
}

function showSelectScreen(fromGame = false) {
  if (!fromGame) {
    const heroShowcase = document.querySelector('.hero-showcase');
    if (heroShowcase && !heroShowcase.classList.contains('is-leaving')) {
      heroShowcase.classList.add('is-leaving');
      setTimeout(() => {
        renderChapterSelect();
        showScreen(selectScreen, 'select-from-start');
        sleepGame();
      }, 350);
      return;
    }
  }
  renderChapterSelect();
  showScreen(selectScreen, fromGame ? 'select-from-game' : 'select-from-start');
  sleepGame();
}

// 没做好地图的章节先给个提示，避免点进去看到空画布。
function enterChapter(chapter) {
  if (!chapter.map) {
    window.alert(`${chapter.label}《${chapter.enemy}》的地图还在制作中。`);
    return;
  }

  currentChapter = chapter;
  showScreen(gameScreen, 'game-from-select');
  launchGame(chapter);
}

function launchGame(chapter) {
  if (!game) {
    game = new Phaser.Game(gameConfig);

    // 强制横屏要给这个 game 实例打两个补丁（父容器尺寸 + 手指坐标）。
    // 必须在这儿接 —— 补丁挂在实例的 scale/input 上，
    // game 建好之后才有得挂。不旋转时补丁原样走 Phaser 的逻辑。
    attachForcedLandscape(game);

    // 场景需要知道当前是哪一章，用 registry 传递（跨场景可读）。
    game.registry.set('chapter', chapter);
    // 通关回调和「返回选关」也走 registry，避免 GameScene 反过来
    // import main.js 造成循环依赖（main → config → GameScene → main）。
    game.registry.set('onChapterClear', completeCurrentChapter);
    game.registry.set('onGoToSelect', showSelectScreen);
    return;
  }

  game.registry.set('chapter', chapter);

  // 容器刚从 display:none 恢复，Phaser 缓存的父容器尺寸还是 0x0。
  // 必须先用 getParentBounds() 重新测量 DOM，再 refresh() 应用新尺寸，
  // 否则画布会保持 0 像素，看起来就像"进不去游戏"。
  requestAnimationFrame(() => {
    game.scale.getParentBounds();
    game.scale.refresh();
    game.loop.wake();
    game.scene.start('GameScene');
  });
}

// 容器隐藏后游戏循环仍会运行，并把画布尺寸缩成 0。
// 暂停它既省 CPU，也避免这次多余的缩放。
//
// 顺便把还在响的音效掐掉。这里是**必须**掐的地方 ——
// 离开关卡走的是 loop.sleep()，场景并没有关闭，
// 所以 GameScene 的 shutdown 事件不会触发（那条路只有「重试本关」会走）。
// 不掐的话失守那段 7 秒的音乐会一路盖到选章界面上。
//
// 背景音乐也要在这里销毁。sound.stopAll() 只是让它停下来，
// 对象还在 SoundManager 里，下次进关 startBgm 会先 stopBgm() 再新建 ——
// 但 sfx.js 里的 bgm 引用得清掉，否则 resumeBgm 可能把一段
// 已经离开关卡的音乐重新拉起来。
//
// 挂起的倒计时也要在这里停掉，而且要在 stopBgm() **之前** ——
// 倒计时用的是 window.setTimeout，它不受 loop.sleep() 影响，
// 玩家在 3、2、1 还没数完就退出的话，那串 setTimeout 会照样走到底，
// 把关卡「开始」起来：背景音乐于是响在选章界面上，HUD 也被启用了。
// 顺序反了的话先停的音乐会被后触发的 startBgm 重新拉起来。
function sleepGame() {
  if (game) {
    hideTutorial();
    const scene = game.scene.getScene('GameScene');
    if (scene && scene.runtime) {
      scene.runtime.destroy();
    }
    // 结算界面那个「返回选关」倒计时也要停掉，理由和上面的倒计时一样：
    // 它用的是 window.setInterval，loop.sleep() 管不到它。
    //
    // 走到这里的情形：打完一关（胜利/失守横幅底下挂着 10 或 14 秒的倒计时），
    // 玩家没等它走完，自己从菜单退回了选章界面。不停的话它照样会走到零，
    // 然后调 goToSelect() —— 那时玩家可能已经翻到标题界面了，
    // 会被莫名拽回选章界面。（scene.isActive() 在 sleep 之后仍是 true，挡不住。）
    if (scene && scene.clearSelectCountdown) {
      scene.clearSelectCountdown();
    }
    stopBgm();
    game.sound.stopAll();
    game.loop.sleep();
  }
}

// 菜单里的「重试本关」：重启 GameScene，倒计时会重新走一遍。
// 画面没有隐藏过，父容器尺寸是有效的，所以不需要 refresh()。
function retryChapter() {
  if (game && currentChapter) {
    game.scene.start('GameScene');
  }
}

// 通关时记录进度，解锁下一章。由 GameScene 通过 registry 调用。
function completeCurrentChapter(hp) {
  if (currentChapter) {
    markCleared(currentChapter.id, hp);
  }
}

initChapterSelect(enterChapter);
setMenuHandlers({ onRetry: retryChapter, onBack: () => showSelectScreen(true) });

// 竖屏提示。要在这里初始化 —— 它自己会挂 resize / orientationchange 监听，
// 而且要立刻量一次当前方向（用户可能一开始就是竖着打开的）。
initRotateHint();

startButton.addEventListener('click', showSelectScreen);
codexButton.addEventListener('click', showCodex);
selectBackButton.addEventListener('click', () => {
  const levelListView = document.getElementById('level-list-view');
  const bigChapterView = document.getElementById('big-chapter-view');
  if (bigChapterView.style.display === 'none') {
    backToBigChapters();
  } else {
    showStartScreen();
  }
});
selectSettingsButton.addEventListener('click', () => showSettings());
selectTransferButton.addEventListener('click', showTransferDialog);

// 按钮点击音。一处监听管住所有 DOM 按钮 ——
// 界面上的按钮散在 index.html、chapterSelect.js、routeDialog.js、
// confirmDialog.js 和 hud.js 里，一个个去加监听不但啰嗦，
// 以后新加的按钮还容易忘。
//
// 用捕获阶段：有些按钮的处理函数会把自己所在的界面隐藏掉，
// 冒泡阶段再走到这里时 event.target 可能已经从文档里摘掉了。
//
// closest('button') 是因为按钮里常套着别的元素（选章卡片里有好几层
// 文字和标签），点在子元素上时 target 不是按钮本身。
// 禁用的按钮不响：它压根没反应，配个音会让人以为点上了。
document.addEventListener('click', (event) => {
  const button = event.target.closest && event.target.closest('button');
  if (button && !button.disabled) {
    playUiClick();
  }
}, true);

// 首页访客计数：全站累计，接口回来才显示。
const visitorBadge = document.getElementById('visitor-badge');
const visitorCountHome = document.getElementById('visitor-count-home');

// 徽章只在首页、且确实拿到过数字时才露出来。
// 还是 '--' 就等于没数据，此时无论在哪个界面都该继续藏着 ——
// 否则从选关页返回首页时（showScreen 会走到这里），
// 角落会凭空挂出一个 "浏览次数：--"。
function syncVisitorBadge(target = null) {
  const onHome = target ? target === startScreen : !startScreen.hidden;
  const hasNumber = visitorCountHome && visitorCountHome.textContent !== '--';
  visitorBadge.hidden = !(onHome && hasNumber);
}

function renderVisitorCount(count) {
  if (!visitorCountHome || typeof count !== 'number') return;
  visitorCountHome.textContent = count.toLocaleString();
  syncVisitorBadge();
}

async function loadVisitorCount() {
  // 先垫上上一次成功取回的全站数字 —— 这数仍是全站累计，只是停在上次那一刻。
  // 这服务实测延迟不稳（1.1s / >3s / 1.3s），不垫的话接口一慢，
  // 徽章就整局不出现，等于白接。
  renderVisitorCount(cachedVisitorCount());

  const fresh = await hitVisitorCount();
  // 拿不到新的就维持现状：有垫底的数继续显示，没有就继续藏着。
  if (fresh !== null) {
    renderVisitorCount(fresh);
  }
}

loadVisitorCount();

// 公告条。放在模块最末尾执行：startScreen 等元素此时早已就绪，
// 而且它只做一件事 —— 拿到公告就转起来，拿不到就什么都不发生。
initNoticeTicker();

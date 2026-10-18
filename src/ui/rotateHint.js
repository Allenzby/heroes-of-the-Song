// 竖屏提示的显隐判定。
//
// ---- 为什么不是纯 CSS ----
//
// 这块原来是 @media (orientation: portrait) and (pointer: coarse) 做的，
// 一行 JS 都没有。真机上出的毛病是：**横过来了，提示还在**。
//
// 原因是 CSS 的 orientation 只看视口的宽高比，而"屏幕转了"和
// "视口变横了"是两件事。至少这几种情况下人转了、视口没变：
//
//   1. 手机开着**屏幕旋转锁定**（最常见）—— 系统压根不转，
//      网页拿到的宽高一直是瘦高的。CSS 对此完全无解。
//   2. 安卓上有些浏览器在 orientationchange 之后要过一两帧
//      才更新 innerWidth/innerHeight，转的一瞬间量到的还是旧值。
//   3. 分屏 / 悬浮小窗里，窗口是瘦高的，但手机本身是横的。
//
// 改成 JS 之后能做两件 CSS 做不到的事：
//   - 在 orientationchange / resize 之后**重新量一次**（还补一次延迟重量，
//     对付第 2 种情况）；
//   - 给一个"我已经横过来了"的按钮，让判错的时候玩家自己能出去。
//
// ---- 那个按钮点完之后会发生什么 ----
//
// **不是**直接竖着进游戏 —— 那样开了旋转锁定的人只能竖着看一张横向地图，
// 建塔位挤成一排，等于没解决问题。
//
// 点完之后走 forcedLandscape.js：把整个界面**转 90 度**摆着。
// 屏幕锁不锁都一样是横的，玩家自然会把手机转过来看。
// 用画面本身代替那句"请横过来"，比再多写一行字管用。
//
// ---- 判定用宽高比，不用 window.orientation ----
//
// window.orientation 早就废弃了（Chrome 已经不给），
// screen.orientation 在旋转锁定时报的是"锁着的那个方向"，
// 正好是我们最需要判对的那种情况下最不可信的东西。
// 视口的宽高比反而是最实在的：**能不能横着放下这张地图**，
// 本来就只取决于视口的形状。

import { setForcedLandscape } from './forcedLandscape.js';

// 视口宽高比的门槛。低于这个数才提示转屏。
//
// 1.2 是怎么来的：画布是 960x540（16:9 ≈ 1.78，见 src/config/game.js），
// Phaser 用 Scale.FIT 按短边缩放。宽高比到 1.2 的时候画面已经能
// 占到屏幕不小一块了，勉强能玩；再方一点（比如 iPad 竖屏的 0.75）
// 地图就只有屏幕三分之一高，十个建塔位挤成一排小点。
//
// 不写 1.78：那等于要求视口和画布一样瘦，很多手机横屏都到不了
// （iPhone SE 横屏是 667/375 = 1.78 刚好，但加上地址栏就不到了），
// 会变成"横过来了还提示你横过来"—— 就是这次要修的毛病本身。
const MIN_ASPECT = 1.2;

// 旋转之后补量一次的延迟。
//
// 安卓上部分浏览器在 orientationchange 事件里量到的还是旋转前的尺寸,
// 隔一帧甚至隔几十毫秒才更新。300ms 是给得比较宽的一个值 ——
// 反正只是多量一次，量对了就不动，代价只有一次读 DOM。
const RECHECK_MS = 300;

const hintEl = document.getElementById('rotate-hint');
const enterButton = document.getElementById('rotate-enter');

// 玩家点过"直接进入"就不再拦他，改成把界面转过来显示。
//
// 只存在内存里，**不写 localStorage**：这是对"此刻拿着手机的姿势"
// 做的一次性豁免，不是一条长期偏好。存下来的话，横屏点过一次之后
// 下次真的竖着打开也不提示了，那就白做这个提示了。
let dismissed = false;

// 手指设备才提示。用 pointer: coarse 而不是屏幕宽度 ——
// 电脑上把窗口拉成瘦高条时鼠标点得很准，照样能玩，不该拦。
//
// 只查一次：设备的指针类型不会在一次会话里变。
// （matchMedia 在极老的浏览器上可能没有，取不到就当是鼠标 —— 宁可不拦。）
const isTouch = typeof window.matchMedia === 'function'
  && window.matchMedia('(pointer: coarse)').matches;

function isPortrait() {
  // 用 innerWidth/innerHeight 而不是 screen.width/height：
  // 前者是**当前可见区域**，地址栏、分屏、小窗都算在里面，
  // 这正是画布实际能用的空间。screen 那一对是整块屏幕的物理尺寸，
  // 分屏时会骗人。
  const { innerWidth: w, innerHeight: h } = window;
  if (!w || !h) {
    return false;   // 量不到就别拦
  }
  return w / h < MIN_ASPECT;
}

function update() {
  const portrait = isPortrait();

  // 提示只在"还没豁免的竖屏手机"上出现。
  const show = isTouch && !dismissed && portrait;
  hintEl.classList.toggle('is-visible', show);

  // 强制横屏只在"豁免过 + 视口还是竖的"时候开。
  //
  // 后半个条件是**取消**的机制，很关键：玩家点了按钮、界面转过来了，
  // 之后他真的把手机转过来（或者关掉了旋转锁定），视口一变横，
  // 这里就把强制模式撤掉，回到正常显示 —— 否则会转两次变成倒的。
  setForcedLandscape(isTouch && dismissed && portrait);
}

export function initRotateHint() {
  enterButton.addEventListener('click', () => {
    dismissed = true;
    update();
  });

  // resize 就够覆盖绝大多数情况了（旋转必然带来 resize），
  // orientationchange 是补给那些先发事件后改尺寸的浏览器。
  // 两个都监听，重复触发无所谓 —— update() 只是量宽高加切一个 class。
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', () => {
    update();
    // 见上面 RECHECK_MS 的注释：这次补量才是真正解决
    // "转了但尺寸还没更新"的那一下。
    window.setTimeout(update, RECHECK_MS);
  });

  update();
}

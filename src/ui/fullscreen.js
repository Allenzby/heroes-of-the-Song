// 全屏按钮。
//
// 页面上一共有三个，都带 .fullscreen-trigger，逻辑共用这一份：
//   首页右上角    .fullscreen-corner（钉在 start-screen 里）
//   选关页右上角  .select-actions 里的第一个
//   关卡 HUD      原来那个
//
// 为什么首页和选关页也要有：全屏**有用**的场景不只是关卡 ——
// 手机上在选关页就想看满屏，进关卡之后再点一次是多余的两步。
// 放进各自的 .screen 里而不是页面顶层：父级 hidden 时按钮跟着一起
// 隐掉，不需要 JS 去监听切屏。
//
// 手机横屏时地址栏能吃掉一两成屏幕高度，而画布是按短边等比缩放的
// （Scale.FIT，见 src/config/game.js），所以少一截高度 = 整个画面都变小。
// 全屏能把那一截拿回来。
//
// 全屏的是 documentElement 而**不是**画布（也不用 Phaser 的
// scale.toggleFullscreen()）：HUD 这排按钮是画布外面的 DOM，
// 只让画布全屏的话金币和暂停按钮会跑到全屏窗口外面去，直接看不见。
//
// 加 webkit 前缀那一路是为了老 Safari；iOS Safari 要到 16.4 才支持
// 元素全屏，更早的版本只能全屏 <video>。两个都没有就把三个按钮
// **全部**藏掉 —— 留一个点了没反应的按钮比没有这个按钮更让人困惑。
const fullscreenSupported = typeof document.documentElement.requestFullscreen === 'function'
  || typeof document.documentElement.webkitRequestFullscreen === 'function';

const buttons = Array.from(document.querySelectorAll('.fullscreen-trigger'));

if (!fullscreenSupported) {
  buttons.forEach((button) => {
    button.hidden = true;
  });
}

function isFullscreen() {
  return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
}

// 三个按钮一起变 —— 同一时刻只有一个露在外面，但切屏有 300ms 动画，
// 动画中途会短暂看到两个，只更新可见的那个会留下一个状态不对的。
function renderFullscreenButtons() {
  const on = isFullscreen();
  buttons.forEach((button) => {
    button.textContent = on ? '⛗' : '⛶';
    button.title = on ? '退出全屏' : '全屏';
    button.setAttribute('aria-label', button.title);
  });
}

function toggleFullscreen() {
  const root = document.documentElement;

  if (isFullscreen()) {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (exit) {
      // 有的浏览器返回 Promise、有的返回 undefined，
      // 所以用 Promise.resolve() 包一层再吞异常。
      Promise.resolve(exit.call(document)).catch(() => {});
    }
    return;
  }

  const request = root.requestFullscreen || root.webkitRequestFullscreen;
  if (request) {
    // 请求可能被拒（比如不是在用户手势里触发的）。
    // 吞掉就好 —— 全屏失败只是画面小一点，不该在控制台报红。
    Promise.resolve(request.call(root)).catch(() => {});
  }
}

if (fullscreenSupported) {
  buttons.forEach((button) => {
    button.addEventListener('click', toggleFullscreen);
  });

  // 图标跟着**实际**的全屏状态走，不是点一下翻一下 ——
  // 用户按 Esc 或者用系统手势退出全屏时按钮也要变回来。
  document.addEventListener('fullscreenchange', renderFullscreenButtons);
  document.addEventListener('webkitfullscreenchange', renderFullscreenButtons);

  renderFullscreenButtons();
}

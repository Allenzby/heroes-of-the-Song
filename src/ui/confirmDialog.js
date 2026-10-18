// 通用确认弹框。
//
// 为什么是 DOM 而不是画在 Canvas 上：README 的「界面方法论」讲过 ——
// 普通按钮和文字用 HTML 排版更省事，也更容易做键盘操作和无障碍。
// 画布只负责游戏本体。
//
// 目前只有一个地方用它（菜单里中途退出关卡），但做成通用的：
// 以后「重试本关」「清空存档」这类会丢东西的操作也该问一句，
// 到时候直接调 showConfirm() 就行，不用再写一遍弹框。

const dialog = document.getElementById('confirm-dialog');
const panel = dialog.querySelector('.confirm-panel');
const titleEl = document.getElementById('confirm-title');
const messageEl = document.getElementById('confirm-message');
const cancelButton = document.getElementById('confirm-cancel');
const okButton = document.getElementById('confirm-ok');

// 关掉弹框时要调的那两个回调。同时也当"开着没开"的标志用。
let pending = null;

export function isConfirmOpen() {
  return pending !== null;
}

function close(which) {
  if (!pending) {
    return;
  }

  const callback = pending[which];
  // 先清空再回调：回调里可能会切界面甚至再弹一个框，
  // 那时状态必须已经是"关上了"。
  pending = null;

  dialog.classList.add('dialog-closing');
  setTimeout(() => {
    dialog.hidden = true;
    dialog.classList.remove('dialog-open', 'dialog-closing');
    if (callback) {
      callback();
    }
  }, 200);
}

export function showConfirm({
  title,
  message,
  confirmText = '确定',
  cancelText = '取消',
  danger = false,
  onConfirm = null,
  onCancel = null,
} = {}) {
  // 已经开着就不再叠一层。正常流程走不到（弹框是模态的，
  // 底下的按钮点不动），这里只是兜底。
  if (pending) {
    return;
  }

  pending = { onConfirm, onCancel };

  titleEl.textContent = title;
  messageEl.textContent = message;
  okButton.textContent = confirmText;
  cancelButton.textContent = cancelText;
  okButton.classList.toggle('is-danger', danger);

  dialog.hidden = false;
  dialog.classList.remove('dialog-closing');
  dialog.classList.add('dialog-open');

  // 焦点默认落在"取消"上。危险操作不能让玩家一按回车就执行掉，
  // 顺手敲空格/回车时应该是"什么也没发生"，而不是"进度没了"。
  cancelButton.focus();
}

// 主动关掉（不触发任何回调）。场景销毁时用，避免退出关卡之后
// 屏幕上还盖着一个点不掉的弹框。
export function hideConfirm() {
  pending = null;
  dialog.hidden = true;
}

cancelButton.addEventListener('click', () => close('onCancel'));
okButton.addEventListener('click', () => close('onConfirm'));

// 点框外面 = 取消。取消是安全的那一边，误点也没有代价。
dialog.addEventListener('click', (event) => {
  if (!panel.contains(event.target)) {
    close('onCancel');
  }
});

// 弹框开着的时候把键盘全部截下来。
//
// 用捕获阶段（第三个参数 true）而不是普通冒泡：window 上还挂着
// hud.js 的按键处理（Esc 开菜单、空格暂停）。捕获阶段比冒泡阶段先跑，
// 在这里 stopPropagation() 就能让事件根本传不到那些处理器上，
// 否则会出现"按 Esc 关掉弹框、同时又把菜单打开了"这种怪事。
window.addEventListener('keydown', (event) => {
  if (!pending) {
    return;
  }

  event.stopPropagation();

  if (event.key === 'Escape') {
    event.preventDefault();
    close('onCancel');
    return;
  }

  // 焦点困在弹框里：只有两个按钮，Tab 就在这两个之间来回跳，
  // 不会跑到底下 HUD 的按钮上（那些现在根本点不动，
  // 焦点跳过去玩家会以为卡住了）。
  if (event.key === 'Tab') {
    event.preventDefault();
    const next = document.activeElement === cancelButton ? okButton : cancelButton;
    next.focus();
  }
}, true);

// 存档导入导出功能。
//
// 将进度、设置和银两钱包合并成一个 JSON 文件，方便跨设备同步。
const PROGRESS_KEY = 'song-heroes-progress';
const SETTINGS_KEY = 'song-heroes-settings';
const WALLET_KEY = 'song-heroes-wallet';

const dialog = document.getElementById('transfer-dialog');
const closeBtn = document.getElementById('transfer-close');
const exportBtn = document.getElementById('transfer-export');
const importBtn = document.getElementById('transfer-import');

// ---------- 导出 ----------

function exportSave() {
  const progress = localStorage.getItem(PROGRESS_KEY);
  const settings = localStorage.getItem(SETTINGS_KEY);
  // 钱包单独一个 key（见 src/state/wallet.js）。老版本导出的文件没有这个字段，
  // 导入时按「没有钱包」处理，见下面 importSave。
  const wallet = localStorage.getItem(WALLET_KEY);

  const data = {
    version: '1.5.0',
    exportedAt: new Date().toISOString(),
    progress: progress ? JSON.parse(progress) : null,
    settings: settings ? JSON.parse(settings) : null,
    wallet: wallet ? JSON.parse(wallet) : null,
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `大宋英雄传_存档_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  hideDialog();
}

// ---------- 导入 ----------

function importSave() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';

  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.addEventListener('load', () => {
      try {
        const data = JSON.parse(reader.result);

        // 校验格式
        if (!data.version || data.progress === undefined || data.settings === undefined) {
          window.alert('存档文件格式不正确，无法导入。');
          return;
        }

        // 确认覆盖
        const confirmed = window.confirm(
          `确定要导入这个存档吗？\n\n`
          + `导出时间：${new Date(data.exportedAt).toLocaleString('zh-CN')}\n`
          + `存档版本：${data.version}\n\n`
          + `当前存档将被覆盖！`
        );

        if (!confirmed) {
          return;
        }

        // 写入 localStorage
        if (data.progress) {
          localStorage.setItem(PROGRESS_KEY, JSON.stringify(data.progress));
        }
        if (data.settings) {
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(data.settings));
        }
        // 有新钱包就整包写入。**老版本导出的存档没有 wallet 字段**，
        // 这时要删掉本机的钱包 —— 否则会变成「进度退回去了、银两还留着」。
        // 删掉之后页面刷新，wallet.js 会按新导入的通关记录重新补发首通赏金。
        if (data.wallet) {
          localStorage.setItem(WALLET_KEY, JSON.stringify(data.wallet));
        } else {
          localStorage.removeItem(WALLET_KEY);
        }

        // 刷新页面使存档生效
        window.location.reload();
      } catch {
        window.alert('存档文件读取失败，文件可能已损坏。');
      }
    });

    reader.readAsText(file);
  });

  input.click();
  hideDialog();
}

// ---------- 弹框控制 ----------

function showDialog() {
  dialog.hidden = false;
  dialog.classList.remove('dialog-closing');
  dialog.classList.add('dialog-open');
}

function hideDialog() {
  dialog.classList.add('dialog-closing');
  setTimeout(() => {
    dialog.hidden = true;
    dialog.classList.remove('dialog-open', 'dialog-closing');
  }, 200);
}

// ---------- 事件绑定 ----------

exportBtn.addEventListener('click', exportSave);
importBtn.addEventListener('click', importSave);
closeBtn.addEventListener('click', hideDialog);

dialog.addEventListener('click', (event) => {
  if (event.target === dialog) {
    hideDialog();
  }
});

window.addEventListener('keydown', (event) => {
  if (!dialog.hidden && event.key === 'Escape') {
    event.preventDefault();
    hideDialog();
  }
});

export { showDialog as showTransferDialog };

// 更新日志：从 src/data/changelog.json 读取，渲染到关于页的弹窗里。
//
// 数据单独放 JSON 而不是写在 js 里，是为了让 `scripts/bump-version.js`
// 能直接改它 —— 以后升版本号时一条命令同时改 package.json 和这份日志。
import changelogData from '../data/changelog.json';

const dialog = document.getElementById('changelog-dialog');
const closeBtn = document.getElementById('changelog-close');
const content = document.getElementById('changelog-content');

// 版本号：取日志第一条（最新）。关于页的「版本 x.y.z」也从这里读，
// 免得 package.json、about 文案、日志三处对不上。
export const CURRENT_VERSION = changelogData.entries[0]?.version || '0.0.0';

function render() {
  const rows = changelogData.entries.map((entry) => {
    const items = entry.items.map((t) => `<li>${t}</li>`).join('');
    const latest = entry === changelogData.entries[0];
    return `
      <article class="changelog-entry${latest ? ' is-latest' : ''}">
        <header class="changelog-entry-head">
          <span class="changelog-ver">v${entry.version}</span>
          ${latest ? '<span class="changelog-badge">最新</span>' : ''}
          <time class="changelog-date">${entry.date}</time>
        </header>
        <ul class="changelog-list">${items}</ul>
      </article>
    `;
  });

  content.innerHTML = rows.join('');
}

export function showChangelog() {
  if (!content.innerHTML) render();
  dialog.hidden = false;
  dialog.classList.remove('dialog-closing');
  dialog.classList.add('dialog-open');
  closeBtn.focus();
}

export function hideChangelog() {
  dialog.classList.add('dialog-closing');
  setTimeout(() => {
    dialog.hidden = true;
    dialog.classList.remove('dialog-open', 'dialog-closing');
  }, 200);
}

closeBtn.addEventListener('click', hideChangelog);

dialog.addEventListener('click', (event) => {
  if (event.target === dialog) hideChangelog();
});

window.addEventListener('keydown', (event) => {
  if (!dialog.hidden && event.key === 'Escape') {
    event.preventDefault();
    hideChangelog();
  }
});

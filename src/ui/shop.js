// 商铺弹窗。
//
// 入口在选关页顶部那一排（index.html 的 #select-shop-button），
// 商品数据在 src/data/shopItems.js，钱和购买逻辑在 src/state/wallet.js ——
// 这里只负责把状态画出来、把点击转成 buy()。
//
// 为什么用 DOM 而不是画在 Canvas 上：和设置弹框同理（见 settingsDialog.js），
// 卡片式布局、滚动、按钮禁用状态用原生元素几行就写完，
// 画到 Canvas 上得自己算坐标、还要跟着 scale 变，不值。
import { SHOP_ITEMS, getItemPrice } from '../data/shopItems.js';
import { getCoins, getOwned, buy } from '../state/wallet.js';

const dialog = document.getElementById('shop-dialog');
const itemsEl = document.getElementById('shop-items');
const closeBtn = document.getElementById('shop-close');
const shopCoinsEl = document.getElementById('shop-coins');
const walletCoinsEl = document.getElementById('wallet-coins');
const openBtn = document.getElementById('select-shop-button');
const messageEl = document.getElementById('shop-message');

// 选关页顶部那个「🪙 N 银两」和商铺里的余额都刷一遍。
// 通关回到选关页时也要调（见 chapterSelect.js 的 renderChapterSelect）。
export function refreshWalletDisplay() {
  const coins = getCoins();
  if (walletCoinsEl) walletCoinsEl.textContent = coins.toLocaleString();
  if (shopCoinsEl) shopCoinsEl.textContent = coins.toLocaleString();
}

function buyLabel(item, owned) {
  const price = getItemPrice(item, owned);
  if (price === null) {
    return '已满';
  }
  const action = item.id === 'revive' || owned === 0 ? '购买' : '升级';
  return `${action} · 🪙 ${price}`;
}

function renderItems() {
  const coins = getCoins();
  itemsEl.innerHTML = '';

  SHOP_ITEMS.forEach((item) => {
    const owned = getOwned(item.id);
    const price = getItemPrice(item, owned);
    const maxed = price === null;
    const affordable = !maxed && coins >= price;

    const card = document.createElement('div');
    card.className = 'shop-card';
    if (maxed) card.classList.add('is-maxed');
    if (!maxed && !affordable) card.classList.add('is-poor');

    const levelText = item.id === 'revive'
      ? `持有 ${owned} / ${item.max}`
      : `等级 ${owned} / ${item.max}`;

    card.innerHTML = `
      <div class="shop-card-head">
        <span class="shop-card-icon" aria-hidden="true">${item.icon}</span>
        <span class="shop-card-name">${item.name}</span>
      </div>
      <p class="shop-card-desc">${item.effectText}</p>
      <div class="shop-card-foot">
        <span class="shop-card-level">${levelText}</span>
        <button type="button" class="shop-buy" ${maxed || !affordable ? 'disabled' : ''}>
          ${buyLabel(item, owned)}
        </button>
      </div>
    `;

    if (!maxed && !affordable) {
      card.querySelector('.shop-buy').title = '银两不足';
    }

    if (!maxed) {
      card.querySelector('.shop-buy').addEventListener('click', () => {
        const result = buy(item.id);
        // 反馈写在卡片区下方单独一行 —— 放进卡片里会被下一次 innerHTML 清掉。
        if (messageEl) {
          messageEl.textContent = result.ok
            ? `已${owned === 0 ? '购买' : '升级'}「${item.name}」`
            : '银两不足。再打几关就有了。';
          messageEl.classList.toggle('is-error', !result.ok);
        }
        renderItems();
        refreshWalletDisplay();
      });
    }

    itemsEl.appendChild(card);
  });
}

function openShop() {
  if (messageEl) {
    messageEl.textContent = '';
    messageEl.classList.remove('is-error');
  }
  renderItems();
  refreshWalletDisplay();
  dialog.hidden = false;
  dialog.classList.remove('dialog-closing');
  dialog.classList.add('dialog-open');
}

function closeShop() {
  if (dialog.hidden) return;
  dialog.classList.add('dialog-closing');
  window.setTimeout(() => {
    dialog.hidden = true;
    dialog.classList.remove('dialog-open', 'dialog-closing');
  }, 200);
}

export function initShop() {
  if (!dialog || !openBtn) return;

  openBtn.addEventListener('click', openShop);
  closeBtn.addEventListener('click', closeShop);

  // 点遮罩空白处关闭。点在面板里不算 —— closest 判断的是事件目标
  // 还在不在 .shop-panel 里。
  dialog.addEventListener('click', (event) => {
    if (!event.target.closest('.shop-panel')) {
      closeShop();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeShop();
  });

  refreshWalletDisplay();
}

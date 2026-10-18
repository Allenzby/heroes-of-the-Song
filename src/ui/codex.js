// 图鉴：展示敌人和英雄信息。
import { ENEMY_TYPES } from '../data/enemies.js';
import { TOWER_TYPES } from '../data/towers.js';
import { isCleared } from '../state/progress.js';

// 敌人立绘
import tufeiImg from '../../assets/art/enemies/tufei.png';
import gunmuImg from '../../assets/art/enemies/gunmu.png';
import zhongjiaImg from '../../assets/art/enemies/zhongjia_1.png';
import kuaichuanImg from '../../assets/art/enemies/kuaichuan_2.png';
import huogongchuanImg from '../../assets/art/enemies/huogongchuan_2.png';
import bingImg from '../../assets/art/enemies/bing_3.png';
import xintuImg from '../../assets/art/enemies/xintu_3.png';
import dijiangImg from '../../assets/art/enemies/bing_4.png';

// 英雄立绘
import linchongImg from '../../assets/art/towers/linchong_jin.png';
import wusongImg from '../../assets/art/towers/wusong_jin.png';
import huarongImg from '../../assets/art/towers/huarong_yuan_1.png';
import shiqianImg from '../../assets/art/towers/shiqian_jin_2.png';

const ENEMY_IMAGES = {
  tufei: tufeiImg,
  gunmu: gunmuImg,
  zhongjia: zhongjiaImg,
  kuaichuan: kuaichuanImg,
  huogongchuan: huogongchuanImg,
  bing: bingImg,
  xintu: xintuImg,
  dijiang: dijiangImg,
};

const HERO_IMAGES = {
  linchong_jin: linchongImg,
  wusong_jin: wusongImg,
  huarong_yuan: huarongImg,
  shiqian_jin: shiqianImg,
};

// 敌人登场章节
const ENEMY_CHAPTER = {
  tufei: 'prologue',
  gunmu: 'prologue',
  zhongjia: 'ch1',
  kuaichuan: 'ch2',
  huogongchuan: 'ch2',
  bing: 'ch3',
  xintu: 'ch3',
  dijiang: 'ch4',
};

// 英雄解锁章节
const HERO_CHAPTER = {
  linchong_jin: 'prologue',
  wusong_jin: 'prologue',
  huarong_yuan: 'ch1',
  shiqian_jin: 'ch2',
};

// 章节 ID → 显示名称
const CHAPTER_LABEL = {
  prologue: '序章',
  ch1: '第一章',
  ch2: '第二章',
  ch3: '第三章',
  ch4: '第四章',
};

const dialog = document.getElementById('codex-dialog');
const closeBtn = document.getElementById('codex-close');
const content = document.getElementById('codex-content');
const tabs = dialog.querySelectorAll('.codex-tab');

let currentTab = 'enemies';

function switchTab(tab) {
  currentTab = tab;
  tabs.forEach((t) => t.classList.toggle('is-active', t.dataset.tab === tab));
  render();
}

tabs.forEach((tab) => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

function render() {
  if (currentTab === 'enemies') {
    renderEnemies();
  } else {
    renderHeroes();
  }
}

function renderEnemies() {
  const entries = Object.entries(ENEMY_TYPES);
  const rows = entries.map(([key, type]) => {
    const chapterId = ENEMY_CHAPTER[key];
    const unlocked = !chapterId || chapterId === 'prologue' || isCleared(chapterId);

    if (!unlocked) {
      const label = CHAPTER_LABEL[chapterId] || chapterId;
      return `
        <div class="codex-item" style="opacity: 0.4">
          <div style="width:4rem;height:4rem;background:rgb(51 65 85 / 50%);border-radius:0.5rem;margin-bottom:0.5rem"></div>
          <span class="codex-item-name">???</span>
          <span class="codex-item-info">通过${label}解锁</span>
        </div>
      `;
    }

    const img = ENEMY_IMAGES[key] || '';
    return `
      <div class="codex-item">
        <img src="${img}" alt="${type.name}" />
        <span class="codex-item-name">${type.name}</span>
        <span class="codex-item-info">
          血量 ${type.hp} ・ 速度 ${type.speed}<br/>
          奖励 ${type.reward} 金币 ・ 伤害 ${type.damage}
        </span>
      </div>
    `;
  });

  content.innerHTML = `<div class="codex-grid">${rows.join('')}</div>`;
}

function renderHeroes() {
  const entries = Object.entries(TOWER_TYPES);
  const rows = entries.map(([key, type]) => {
    const chapterId = HERO_CHAPTER[key];
    const unlocked = !chapterId || chapterId === 'prologue' || isCleared(chapterId);

    if (!unlocked) {
      const label = CHAPTER_LABEL[chapterId] || chapterId;
      return `
        <div class="codex-item" style="opacity: 0.4">
          <div style="width:4rem;height:4rem;background:rgb(51 65 85 / 50%);border-radius:0.5rem;margin-bottom:0.5rem"></div>
          <span class="codex-item-name">???</span>
          <span class="codex-item-info">通过${label}解锁</span>
        </div>
      `;
    }

    const img = HERO_IMAGES[key] || '';
    const lvl = type.levels[0];
    return `
      <div class="codex-item">
        <img src="${img}" alt="${type.name}" />
        <span class="codex-item-name">${type.name}</span>
        <span class="codex-item-info">
          ${type.weapon} ・ ${type.range > 140 ? '远程' : '近战'}<br/>
          伤害 ${lvl.damage} ・ 射程 ${type.range} ・ 费用 ${lvl.cost}
        </span>
      </div>
    `;
  });

  content.innerHTML = `<div class="codex-grid">${rows.join('')}</div>`;
}

export function showCodex() {
  render();
  dialog.hidden = false;
  dialog.classList.remove('dialog-closing');
  dialog.classList.add('dialog-open');
  closeBtn.focus();
}

export function hideCodex() {
  dialog.classList.add('dialog-closing');
  setTimeout(() => {
    dialog.hidden = true;
    dialog.classList.remove('dialog-open', 'dialog-closing');
  }, 200);
}

closeBtn.addEventListener('click', hideCodex);

dialog.addEventListener('click', (event) => {
  if (event.target === dialog) {
    hideCodex();
  }
});

window.addEventListener('keydown', (event) => {
  if (!dialog.hidden && event.key === 'Escape') {
    event.preventDefault();
    hideCodex();
  }
});

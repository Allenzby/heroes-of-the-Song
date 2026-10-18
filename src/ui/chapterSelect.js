import { CHAPTERS, ROUTES, CHOICE_AT, BIG_CHAPTERS, getChaptersByBigChapter, getBigChapter } from '../data/chapters.js';
import { getLevelEnemies, getLevel } from '../data/levels.js';
import {
  autoMode,
  chooseRoute,
  getChosenRoute,
  isCleared,
  isUnlocked,
  isBigChapterUnlocked,
  getBigChapterProgress,
  needsChoice,
  teacherMode,
  getClearedHp,
} from '../state/progress.js';

import iceMap from '../../assets/art/ice_map.png';
import iceMap1 from '../../assets/art/ice_map1.png';
import iceMap2 from '../../assets/art/ice_map2.png';
import iceMap3 from '../../assets/art/ice_map3.png';
import iceMap4 from '../../assets/art/ice_map4.png';

const bigChapterView = document.getElementById('big-chapter-view');
const levelListView = document.getElementById('level-list-view');
const levelListEl = document.getElementById('level-list');
const listEl = document.getElementById('chapter-list');
const hintEl = document.getElementById('select-hint');
const titleEl = document.getElementById('select-title');
const dialogEl = document.getElementById('route-dialog');
const routeOptionsEl = document.getElementById('route-options');
const routeCancelEl = document.getElementById('route-cancel');
const prevBtn = document.getElementById('chapter-prev');
const nextBtn = document.getElementById('chapter-next');
const counterEl = document.getElementById('chapter-counter');

let onPick = () => {};
let bigChapterIndex = 0;
let currentBigChapter = null;

const VISIBLE_BIG_CHAPTERS = BIG_CHAPTERS;

export function initChapterSelect(handler) {
  onPick = handler;
  renderRouteDialog();

  routeCancelEl.addEventListener('click', () => {
    closeRouteDialog();
  });

  prevBtn.addEventListener('click', () => navigate(-1));
  nextBtn.addEventListener('click', () => navigate(1));

  document.addEventListener('keydown', (e) => {
    if (document.getElementById('select-screen').hidden) return;
    if (e.key === 'ArrowLeft') navigate(-1);
    if (e.key === 'ArrowRight') navigate(1);
    if (e.key === 'Escape' && currentBigChapter) backToBigChapters();
  });
}

function closeRouteDialog() {
  dialogEl.classList.add('dialog-closing');
  setTimeout(() => {
    dialogEl.hidden = true;
    dialogEl.classList.remove('dialog-open', 'dialog-closing');
  }, 200);
}

function openRouteDialog() {
  dialogEl.hidden = false;
  dialogEl.classList.remove('dialog-closing');
  dialogEl.classList.add('dialog-open');
}

// ========== 第一层：大章节轮播 ==========

export function renderChapterSelect() {
  currentBigChapter = null;
  bigChapterIndex = 0;

  bigChapterView.hidden = false;
  bigChapterView.style.display = '';
  counterEl.style.display = '';
  levelListView.hidden = true;
  titleEl.textContent = '选择章节';

  renderBigChapterCard();
  updateHint();
  updateArrows();

  if (needsChoice()) {
    openRouteDialog();
  } else {
    dialogEl.hidden = true;
  }

  routeCancelEl.hidden = getChosenRoute() === null;
}

function renderBigChapterCard() {
  listEl.innerHTML = '';
  const bc = VISIBLE_BIG_CHAPTERS[bigChapterIndex];
  const progress = getBigChapterProgress(bc.id);
  const unlocked = isBigChapterUnlocked(bc);

  const card = document.createElement('div');
  card.className = `big-chapter-card ${unlocked ? '' : 'is-locked'}`;
  if (bc.mapKey) {
    card.style.backgroundImage = `url(${getMapImage(bc.mapKey)})`;
  }

  let statusText;
  if (bc.locked) {
    statusText = '🔒 未开放';
  } else if (!unlocked) {
    statusText = '🔒 未解锁';
  } else if (progress.cleared === progress.total) {
    statusText = '★ 全部通关';
  } else {
    statusText = `进度 ${progress.cleared} / ${progress.total}`;
  }

  card.innerHTML = `
    <div class="big-chapter-header">
      <span class="big-chapter-name">${bc.name}</span>
      <span class="big-chapter-status">${statusText}</span>
    </div>
    <p class="big-chapter-desc">${bc.desc}</p>
    ${unlocked ? '<span class="big-chapter-enter">点击进入 ›</span>' : ''}
  `;

  if (unlocked && !bc.locked) {
    card.addEventListener('click', () => enterBigChapter(bc));
  }

  listEl.appendChild(card);
  counterEl.textContent = `${bigChapterIndex + 1} / ${VISIBLE_BIG_CHAPTERS.length}`;
}

function navigate(delta) {
  if (currentBigChapter) return;

  const next = bigChapterIndex + delta;
  if (next < 0 || next >= VISIBLE_BIG_CHAPTERS.length) return;

  const direction = delta > 0 ? 'left' : 'right';
  listEl.style.animation = `cardSlideOut${direction === 'left' ? 'Left' : 'Right'} 0.2s ease-in forwards`;

  setTimeout(() => {
    bigChapterIndex = next;
    renderBigChapterCard();
    updateArrows();

    const inDirection = delta > 0 ? 'right' : 'left';
    listEl.style.animation = `cardSlideIn${inDirection === 'right' ? 'Right' : 'Left'} 0.2s ease-out`;
  }, 200);
}

function updateArrows() {
  prevBtn.disabled = bigChapterIndex === 0;
  nextBtn.disabled = bigChapterIndex === VISIBLE_BIG_CHAPTERS.length - 1;
}

// ========== 第二层：关卡列表 ==========

function enterBigChapter(bc) {
  currentBigChapter = bc;
  bigChapterView.style.display = 'none';
  counterEl.style.display = 'none';
  levelListView.removeAttribute('hidden');
  titleEl.textContent = bc.name;

  renderLevelList();
}

export function backToBigChapters() {
  currentBigChapter = null;
  bigChapterView.style.display = '';
  counterEl.style.display = '';
  levelListView.hidden = true;
  titleEl.textContent = '选择章节';

  renderBigChapterCard();
  updateArrows();
}

function renderLevelList() {
  levelListEl.innerHTML = '';
  const levels = getChaptersByBigChapter(currentBigChapter.id);

  levels.forEach((chapter) => {
    const state = chapterState(chapter);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `level-card is-${state}`;
    card.disabled = state === 'locked';

    let badge;
    if (state === 'cleared') {
      const hp = getClearedHp(chapter.id);
      const level = chapter.map ? getLevel(chapter.map) : null;
      const maxHp = level ? level.lives : null;
      if (hp !== undefined && maxHp !== null && hp >= maxHp) {
        badge = '★ 完美通关';
      } else if (hp !== undefined) {
        badge = `✓ 防线 ${hp} / ${maxHp}`;
      } else {
        badge = '✓ 已通关';
      }
    } else if (state === 'locked') {
      badge = '🔒 未解锁';
    } else {
      badge = '可挑战';
    }

    const enemyText = state === 'locked'
      ? '敌情未知'
      : getLevelEnemies(chapter.map).map((e) => `${e.name}×${e.count}`).join('、');

    card.innerHTML = `
      <div class="level-map-preview">
        <img src="${getMapImage(chapter.map)}" alt="${chapter.enemy}" />
      </div>
      <div class="level-info">
        <span class="level-top">
          <span class="level-label">${chapter.label}</span>
          <span class="level-difficulty diff-${difficultyClass(chapter.difficulty)}">${chapter.difficulty}</span>
        </span>
        <span class="level-name">${chapter.enemy}</span>
        <span class="level-scene">${chapter.scene}</span>
        <span class="level-enemies-text">${enemyText}</span>
        <span class="level-badge">${badge}</span>
      </div>
    `;

    if (state !== 'locked') {
      card.addEventListener('click', () => onPick(chapter));
    }

    levelListEl.appendChild(card);
  });
}

function chapterState(chapter) {
  if (isCleared(chapter.id)) return 'cleared';
  if (isUnlocked(chapter.id)) return 'unlocked';
  return 'locked';
}

function difficultyClass(difficulty) {
  if (difficulty === '教学') return 'tutorial';
  if (difficulty === '困难') return 'hard';
  return 'normal';
}

const MAP_URLS = {
  iceMap,
  mountainPass: iceMap1,
  huaixiWaters: iceMap2,
  jiangnanJungle: iceMap3,
  centralPlains: iceMap4,
};

function getMapImage(mapKey) {
  return MAP_URLS[mapKey] || iceMap;
}

function updateHint() {
  const clearedCount = CHAPTERS.filter((c) => isCleared(c.id)).length;
  const parts = [`进度 ${clearedCount} / ${CHAPTERS.length}`];

  if (teacherMode) {
    parts.push('教师模式：已解锁全部章节');
  } else {
    parts.push('通过一章才会解锁下一章');
  }

  const chosen = getChosenRoute();
  if (chosen) {
    parts.push(`路线：${ROUTES[chosen].name}`);
  }

  if (autoMode) {
    parts.push('🤖 自动演练模式：进关自动打');
  }

  hintEl.textContent = parts.join(' ・ ');
}

function renderRouteDialog() {
  routeOptionsEl.innerHTML = '';

  Object.values(ROUTES).forEach((route) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'route-option';
    option.innerHTML = `
      <span class="route-option-head">
        <span class="route-option-tag">${route.tag}</span>
        <strong>${route.action}</strong>
        <span class="route-option-name">（${route.name}）</span>
      </span>
      <ul class="route-option-detail">
        ${route.detail.map((line) => `<li>${line}</li>`).join('')}
      </ul>
    `;
    option.addEventListener('click', () => {
      chooseRoute(route.id);
      closeRouteDialog();
      renderChapterSelect();
    });
    routeOptionsEl.appendChild(option);
  });
}

// 首页公告条：轮播所有公告的标题，右侧显示「当前/总数」。
//
// 三条铁律（前两条都是被 countapi 教训换来的）：
//   1. **没配置 Gist → 根本不发请求**，直接 return。不发就不会有失败，
//      控制台自然也就没有红错。
//   2. **请求失败或没公告 → 什么都不做**。容器 HTML 里本来就是 hidden，
//      不去动它，绝不会出现一条空壳横幅。
//   3. **异常绝不能冒泡到控制台** —— 所有外部交互都在 try/catch 里，
//      或者在 noticeStore 内部就已经被吞成 null。
//
// 轮播只在首页：公告条是 #start-screen 的后代，切到选关页时整个屏幕
// 会 hidden，它跟着一起藏，不需要额外管理。
import { fetchNotices, isNoticeConfigured } from '../data/noticeStore.js';

// 每条停多久。选 4.5s 是因为：短了来不及读完一个中文标题，
// 长了标题多的时候要转很久才轮回来。
const ROTATE_MS = 4500;
const FADE_MS = 220;

function startCarousel(box, notices) {
  const titleEl = box.querySelector('.notice-ticker__title');
  const countEl = box.querySelector('.notice-ticker__count');
  if (!titleEl || !countEl) return;

  let index = 0;
  let timer = null;

  const paint = () => {
    const notice = notices[index];
    titleEl.textContent = notice.title;
    countEl.textContent = `${index + 1}/${notices.length}`;
    titleEl.title = notice.body || notice.title;
  };

  const advance = () => {
    if (notices.length < 2) return;
    box.classList.add('is-swapping');
    window.setTimeout(() => {
      index = (index + 1) % notices.length;
      paint();
      box.classList.remove('is-swapping');
    }, FADE_MS);
  };

  paint();
  box.hidden = false;

  if (notices.length < 2) return;

  // 页面切到后台时暂停轮播 —— 省电，也避免回前台时
  // 一瞬间连跳好几条让人眼花。
  const start = () => {
    if (timer === null) timer = window.setInterval(advance, ROTATE_MS);
  };
  const stop = () => {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });
  start();
}

export function initNoticeTicker() {
  const box = document.getElementById('notice-ticker');
  if (!box || !isNoticeConfigured()) return;

  fetchNotices()
    .then((notices) => {
      // null = 请求没成功；[] = 一个公告都没有。两种都直接不显示。
      if (!notices || notices.length === 0) return;
      startCarousel(box, notices);
    })
    .catch(() => {
      // 理论上 fetchNotices 已经吞了所有异常，这里再兜一次，
      // 保证任何情况下都不会有一条报错的红字飘在玩家面前。
    });
}

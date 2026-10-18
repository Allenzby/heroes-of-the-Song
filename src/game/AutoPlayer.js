import Phaser from 'phaser';
import { TOWER_TYPES, isTowerUnlocked } from '../data/towers.js';

// 自动演练模式的"电脑玩家"。网址加 /auto 时启用（见 src/state/progress.js）。
//
// 它做的事和一个真人玩家完全一样 —— 调 TowerManager 的 build / upgrade，
// 没有任何特权：钱不够就建不了，没解锁的武将也用不了。
// 所以它演出来的是"这一关真的能这么打"，而不是作弊通关。
//
// 课堂上它有两个用处：老师不用一边讲一边点，学生也能看到
// "塔该往哪儿摆" —— 每一步都会在画面左上角写出来为什么。
//
// ---- 它怎么决定往哪儿摆 ----
//
// 核心是一个能算出来的量：**这座塔一辈子能打出多少伤害**。
//
//   伤害 = DPS × 敌人待在射程里的时间
//        = DPS × (被射程罩住的那段路的长度 ÷ 敌人速度)
//
// 敌人速度对所有塔位都一样，所以比较不同摆法时可以把它约掉，剩下：
//
//   分数 = DPS × 被罩住的路的长度
//
// 这就是下面 valueAt() 算的东西。它比"离路近不好近"之类的直觉靠谱得多：
// 一座罩住回头弯的塔能同时罩住来回两段路，分数自然就是别处的两倍，
// 不用专门写"要放在弯道内侧"这种规则。
//
// 每次有钱时，把所有能做的事（在空位上建某个武将 / 升级某座已有的塔）
// 都算一遍分数，挑**每块钱换来的分数**最高的那个做。
// 挑性价比而不是挑绝对分数，是因为前期钱少：先用 60 块建一座武松、
// 让它去赚钱，比攒到 130 块建时迁要划算。
export class AutoPlayer {
  constructor(scene, {
    slots, path, towers, chapterIndex = 0, teacher = false, onAction,
  } = {}) {
    this.scene = scene;
    this.slots = slots || [];
    this.towers = towers;
    this.chapterIndex = chapterIndex;
    this.teacher = teacher;
    // 每做一件事就报一句给 GameScene 显示出来。
    this.onAction = onAction || (() => {});

    // 把路线折线打散成一串等距的点，用来数"射程罩住了多长的路"。
    this.samples = samplePath(path || []);

    // 射程覆盖的缓存。key 是 `槽位:射程`。
    //
    // 射程只有十几个固定取值（4 个武将 × 3 级），槽位最多 10 个，
    // 所以整局下来最多算几十次，之后全是查表。
    // 不缓存的话每 600 毫秒要跑 10 个槽位 × 4 个武将 × 几百个采样点。
    this.coverageCache = new Map();

    this.timer = null;
    // 做过的事的件数，只用来在提示里标个序号。
    this.actionCount = 0;
  }

  // 由 GameScene 在倒计时结束后调用。
  //
  // 用 scene.time 而不是 window.setInterval：这样暂停和倍速自动生效 ——
  // LevelRuntime 改的就是 time.timeScale（见那个文件的说明）。
  // 老师按暂停讲两句，电脑玩家也跟着停手，不会讲完发现塔已经建满了。
  start() {
    if (this.timer) {
      return;
    }
    this.timer = this.scene.time.addEvent({
      delay: TICK_MS,
      loop: true,
      callback: () => this.tick(),
    });
  }

  stop() {
    if (this.timer) {
      this.timer.remove(false);
      this.timer = null;
    }
  }

  // 一个决策周期：看看现在最该做什么，能做就做一件。
  //
  // 一次只做一件事（不是把钱一口气花完），这样画面上是一座一座冒出来的，
  // 看得清顺序 —— 顺序本身就是这个模式要教的东西。
  tick() {
    if (!this.towers) {
      this.stop();
      return;
    }

    const best = this.pickBest();
    if (!best) {
      // 钱不够，或者位置全占满且都满级了。等下一个周期。
      return;
    }

    this.actionCount += 1;

    if (best.kind === 'build') {
      const slot = this.slots[best.index];
      if (this.towers.build(best.index, best.typeKey, slot.x, slot.y)) {
        this.onAction(`建造 ${best.type.name}（${best.index + 1} 号位）`, best.index);
      }
      return;
    }

    if (this.towers.upgrade(best.tower)) {
      const stars = '★'.repeat(best.tower.level);
      this.onAction(`升级 ${best.tower.type.name} ${stars}（${best.index + 1} 号位）`, best.index);
    }
  }

  // 把所有"现在做得起"的选项列出来，挑性价比最高的一个。
  //
  // 返回 null 表示这一轮什么都做不了。
  pickBest() {
    const candidates = [];

    this.slots.forEach((slot, index) => {
      const tower = this.towers.towerAt(index);

      // 空位：考虑在这儿建每一个已解锁、买得起的武将。
      if (!tower) {
        Object.entries(TOWER_TYPES).forEach(([typeKey, type]) => {
          if (!isTowerUnlocked(type, this.chapterIndex, this.teacher)) {
            return;
          }
          const stats = type.levels[0];
          if (!this.towers.canAfford(stats.cost)) {
            return;
          }
          candidates.push({
            kind: 'build',
            index,
            typeKey,
            type,
            cost: stats.cost,
            gain: this.valueAt(index, stats),
          });
        });
        return;
      }

      // 已有塔：考虑升级。满级或钱不够就跳过。
      if (tower.isMaxLevel) {
        return;
      }
      const cost = tower.upgradeCost;
      if (!this.towers.canAfford(cost)) {
        return;
      }

      // 升级的收益是**差值**，不是升完的总分 ——
      // 塔已经在打了，花这笔钱买到的只是多出来的那部分。
      // 不算差值的话升级会永远比新建划算（分数基数高），
      // 电脑玩家会把一座塔顶满级，剩下九个位空着。
      const next = tower.type.levels[tower.level + 1];
      candidates.push({
        kind: 'upgrade',
        index,
        tower,
        cost,
        gain: this.valueAt(index, next) - this.valueAt(index, tower.stats),
      });
    });

    if (!candidates.length) {
      return null;
    }

    // 按"每块钱换来多少分"排。分数相同（比如两个位子对称）时选绝对分数高的，
    // 这样至少是确定的选择，不会因为遍历顺序变来变去。
    let best = null;
    let bestRatio = -Infinity;
    for (const c of candidates) {
      const ratio = c.gain / c.cost;
      if (ratio > bestRatio || (ratio === bestRatio && best && c.gain > best.gain)) {
        best = c;
        bestRatio = ratio;
      }
    }

    // 收益为零或负的不做。会发生在射程完全罩不到路的位置上 ——
    // 那种位子建了塔纯粹是浪费钱，宁可攒着。
    if (!best || best.gain <= 0) {
      return null;
    }

    return best;
  }

  // 一座塔摆在 index 号位、拿着 stats 这组数值，值多少分。
  //
  // 分数 = DPS × 被射程罩住的采样点数。采样点是等距的，
  // 点数就正比于路的长度，所以不用再乘步长。
  valueAt(index, stats) {
    const dps = stats.damage / stats.cooldown;
    return dps * this.coverage(index, stats.range);
  }

  // index 号位、半径 range 的圆罩住了多少个采样点。
  coverage(index, range) {
    const key = `${index}:${range}`;
    const cached = this.coverageCache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const slot = this.slots[index];
    let count = 0;

    for (const point of this.samples) {
      // 距离要按敌人的**躯干**算，不是脚底。
      //
      // Tower.findTarget() 判定射程时用的是 container.y - displayHeight * 0.5
      // （见 src/game/Tower.js），路线上的点是脚底位置，所以这里要把
      // 目标点抬高一截，否则正上方/正下方的塔位会算错 ——
      // 差的这 30 像素在武松 100 的射程上是三成。
      const dy = point.y - TORSO_LIFT - slot.y;
      const dx = point.x - slot.x;
      if (dx * dx + dy * dy <= range * range) {
        count += 1;
      }
    }

    this.coverageCache.set(key, count);
    return count;
  }

  destroy() {
    this.stop();
    this.towers = null;
    this.samples = [];
    this.coverageCache.clear();
  }
}

// 决策周期。600 毫秒是游戏时间，2 倍速时实际是 300 毫秒。
//
// 不做得更快是故意的：一座一座冒出来才看得清先后顺序。
// 一口气建满的话画面上"啪"一下全是塔，等于什么也没演。
const TICK_MS = 600;

// 采样步长（画布像素）。8 像素在 960x540 上够细了 ——
// 最小的射程是武松的 100，也能落进十几个点，比较起来不会因为
// 采样太粗而分不出高下。再细只是白算。
const PATH_STEP = 8;

// 路线上的点是敌人**脚底**的位置，射程判定按躯干中心算。
// 30 是几种敌人 displayHeight * 0.5 的中间值（见 src/data/enemies.js）——
// 每种敌人身高不同，这里取一个折中值就够了，反正是用来排序的。
const TORSO_LIFT = 30;

// 把路线折线打散成一串间隔约 PATH_STEP 的点。
//
// 直接用折线的顶点是不行的：顶点之间可能隔着两百像素，
// 数"罩住几个顶点"等于在拿三四个点做统计，噪声比信号大。
function samplePath(path, step = PATH_STEP) {
  if (path.length === 0) {
    return [];
  }
  if (path.length === 1) {
    return [{ x: path[0].x, y: path[0].y }];
  }

  const points = [];

  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    const length = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
    // 至少放一个点，否则重复的顶点（长度 0）会整段被跳过。
    const steps = Math.max(1, Math.round(length / step));

    // 每段只放 [0, steps) 个点，段末那个点留给下一段的开头，
    // 免得在每个折点上重复计一次 —— 折点多的地图会被算得偏高。
    for (let k = 0; k < steps; k += 1) {
      const t = k / steps;
      points.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
      });
    }
  }

  // 最后一个顶点单独补上（上面的循环把每段末尾都让给了下一段）。
  points.push({ ...path[path.length - 1] });

  return points;
}

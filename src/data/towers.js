// 炮塔（武将）种类定义。改数值就能调平衡，不用动 Tower.js 的代码。
//
// 立绘文件名的命名规则：`人物名_远或近战_第几章解锁`。
//   linchong_jin.png      林冲，近战，没有章节号 = 一开始就有
//   huarong_yuan_1.png    花荣，远战，第一章解锁
//   shiqian_jin_2.png     时迁，近战，第二章解锁
//
// 这三段信息在代码里的落点不一样，加新武将时三处都要对上：
//   人物名 → 下面的 key（`huarong_yuan`），以及 BootScene 里 load.image 的 key
//   近战/远战 → 由 key 里的 `jin`/`yuan` 推导（见下面的 isMelee），不写字段
//   第几章解锁 → 写成 unlockAt 字段，**不留在 key 里**
//
// key 里不带章节号，是照 src/data/enemies.js 的做法（`zhongjia_1.png` → `zhongjia`）：
// 章节号是"什么时候能用"，属于会变的平衡参数，写进 key 就等于把它焊死了 ——
// 以后想把花荣提前到序章，只用改 unlockAt 那一行，不用连着改 BootScene 的 key。
//
// unlockAt 是 src/data/chapters.js 里 CHAPTERS 数组的下标：
//   0 = 序章   1 = 第一章   2 = 第二章   3 = 第三章   4 = 第四章
// 打某一关时，unlockAt 大于这一关的武将会在建造面板里灰着、标上「第N章解锁」，
// 不是藏起来 —— 让玩家看得见后面有什么可期待的（见 src/game/BuildPanel.js）。
// 网址加 ?unlock=all（教师模式）时全部可用，方便课上直接演示。
//
// displayHeight 和 contentRatio 的含义与 src/data/enemies.js 里完全一样：
// 前者是在 960x540 画布上的高度，后者用来补偿原图四周的透明留白
// （数值是扫描 alpha 通道量出来的）。
//
// levels 是三级数值表，摊开写而不是用倍率公式算 ——
// 想调某一级直接改那一行，比读 damage * 1.4 ** level 直观。
// levels[0].cost 是建造费，之后每级的 cost 是从上一级升上来的费用。
//
// 四个武将的分工（一级数值，DPS = damage / cooldown * 1000）：
//   武松  近战  射程 100  DPS 41   造价 60    最便宜，弯道内侧的爆发点
//   林冲  近战  射程 135  DPS 37   造价 80    覆盖长直道
//   花荣  远战  射程 175  DPS 33   造价 110   射程换输出，唯一打得到远处的
//   时迁  近战  射程 118  DPS 54   造价 130   第二章之后的主力输出
// 越贵的不是单纯越强：花荣 DPS 最低但罩得最远，时迁 DPS 最高但要等到第二章。
import { CHAPTERS } from './chapters.js';

export const TOWER_TYPES = {
  // 林冲・丈八蛇矛。长柄武器，够得远、出手快，但单下伤害不高。
  // 适合放在长直道旁边，用覆盖范围换输出时间。
  linchong_jin: {
    key: 'tower_linchong_jin',   // 要和 BootScene 里 load.image 的 key 对上
    name: '林冲',
    weapon: '丈八蛇矛',
    unlockAt: 0,                 // 序章就有
    displayHeight: 88,
    contentRatio: 903 / 1024,
    // 射程原来是 95/105/118，罩住的路太短、敌人一晃就过去了，
    // 统一放大约四成。画布只有 960x540，135 的圈已经能盖住一整个回头弯。
    levels: [
      { damage: 26, range: 135, cooldown: 700, cost: 80 },
      { damage: 38, range: 150, cooldown: 700, cost: 70 },
      { damage: 54, range: 168, cooldown: 700, cost: 110 },
    ],
  },

  // 武松・朴刀。短兵，够不远但一刀很重。
  // 便宜好上手，适合放在回头弯的内侧 —— 敌人在那儿会绕很久。
  wusong_jin: {
    key: 'tower_wusong_jin',
    name: '武松',
    weapon: '朴刀',
    unlockAt: 0,                 // 序章就有
    displayHeight: 88,
    contentRatio: 937 / 1024,
    // 原来是 70/78/88，短兵本来就该比林冲窄，但 70 实在太憋 ——
    // 敌人常常从圈边上擦过去一刀都挨不到。同样放大约四成，
    // 仍然明显小于林冲，两个武将的分工没变。
    levels: [
      { damage: 45, range: 100, cooldown: 1100, cost: 60 },
      { damage: 64, range: 112, cooldown: 1100, cost: 55 },
      { damage: 90, range: 126, cooldown: 1100, cost: 90 },
    ],
  },

  // ↓ 花荣・铁胎弓（huarong_yuan_1.png）。**第一章解锁，全游戏第一个远战武将。**
  //
  // 远战和近战在代码里是两条完全不同的路：近战当帧结算伤害 + 画一道挥砍弧光，
  // 远战生成一颗弹丸、飞到目标身上才结算（见 src/game/Tower.js 的 attack()
  // 和 src/game/Projectile.js）。弹丸那条路以前一直写着但没人走过 ——
  // 前两个武将都是 _jin，花荣是第一个真正触发它的。
  //
  // 数值上是"射程换输出"：175 的圈是全场最大（武松 100 的一倍七），
  // 但 DPS 只有 33，四个武将里最低。它的价值不在打得疼，在于
  // 一座就能罩住别人罩不到的那一段路 —— 特别是第二章的河道，
  // 竹筏塔位离水面有距离，近战常常够不着船。
  //
  // 冷却 900ms 而不是更快：弹丸飞过 175 像素要 0.4 秒（Projectile 的 SPEED 是 420），
  // 射得太密的话画面上会挂一串箭，看不清哪一箭打的哪个。
  huarong_yuan: {
    key: 'tower_huarong_yuan',
    name: '花荣',
    weapon: '铁胎弓',
    unlockAt: 1,                 // 第一章解锁
    // 内容 650x963，是四张里最瘦高的一张（弓是竖着的），
    // 所以给和其他人一样的 88 也不会显得胖。
    displayHeight: 88,
    contentRatio: 963 / 1024,
    levels: [
      { damage: 30, range: 175, cooldown: 900, cost: 110 },
      { damage: 44, range: 195, cooldown: 900, cost: 95 },
      { damage: 62, range: 218, cooldown: 900, cost: 140 },
    ],
  },

  // ↓ 时迁・大砍刀（shiqian_jin_2.png）。**第二章解锁。**
  //
  // 定位是"后期主力"：DPS 54 是全场最高，射程 118 介于武松和林冲之间。
  // 造价 130 也是全场最高 —— 第二章开始敌人的血翻了好几倍
  // （快船 200、火攻船 520，见 src/data/enemies.js），这时候需要一个
  // 单点能压住硬目标的选项，武松那 45 一刀已经跟不上了。
  //
  // 冷却 950ms 比武松的 1100 快一点，但仍然是"重刀"的手感 ——
  // 想调它的强度，改 damage 比改 cooldown 好：cooldown 一动，
  // 挥砍弧光的节奏跟着变，看着就不像大刀了。
  shiqian_jin: {
    key: 'tower_shiqian_jin',
    name: '时迁',
    weapon: '大砍刀',
    unlockAt: 2,                 // 第二章解锁
    // 内容 952x958 几乎是正方形（一手横举大刀、一手甩披风撑得很宽），
    // 按 88 的高度算出来约 87 像素宽，是四张里最宽的 ——
    // 立在石台上会稍微盖住旁边一点，这是想要的：它就该看着比别人壮。
    displayHeight: 88,
    contentRatio: 958 / 1024,
    levels: [
      { damage: 51, range: 118, cooldown: 950, cost: 130 },
      { damage: 72, range: 130, cooldown: 950, cost: 115 },
      { damage: 101, range: 145, cooldown: 950, cost: 175 },
    ],
  },
};

// 拆除时返还已投入金币的比例。建错了能改，但要付一点学费。
export const REFUND_RATE = 0.6;

// 近战还是远战，看 key 里有没有 `jin` 那一段。
//
// 原来写的是 typeKey.endsWith('_jin')，只在 key 正好以 _jin 结尾时成立。
// 现在按 `_` 拆开找那一段，这样 key 后面再接别的东西也不会认错 ——
// 加时迁时差点在这儿栽了：要是当初把 key 写成 `shiqian_jin_2`
// （照文件名原样搬），endsWith 会返回 false，时迁就被判成远战、
// 挥着大砍刀往外射箭了。现在 key 里不带章节号（章节号走 unlockAt），
// 但判定还是改稳一点，免得以后谁又照文件名起 key。
export function isMelee(typeKey) {
  return typeKey.split('_').includes('jin');
}

export function getTowerType(typeKey) {
  return TOWER_TYPES[typeKey] || null;
}

// 满级是第几级（从 0 数）。三级表就是 2。
export function maxLevel(type) {
  return type.levels.length - 1;
}

// ---- 解锁 ----

// unlockAt 是 CHAPTERS 的下标，这里换成能显示的中文标签（「第一章」）。
// 越界就退回 `第${n}章`，正常不会发生，但数据写错时面板上会显示一个
// 看得懂的字符串而不是 undefined。
export function unlockLabel(type) {
  const chapter = CHAPTERS[type.unlockAt];
  return chapter ? chapter.label : `第${type.unlockAt}章`;
}

// 打第 chapterIndex 关（CHAPTERS 的下标）时，这个武将能不能用。
// teacher 为 true（教师模式）时全部可用。
export function isTowerUnlocked(type, chapterIndex, teacher = false) {
  if (teacher) {
    return true;
  }
  // unlockAt 没写就当成一开始就有 —— 漏写一个字段不该让武将整个消失。
  const at = typeof type.unlockAt === 'number' ? type.unlockAt : 0;
  return chapterIndex >= at;
}

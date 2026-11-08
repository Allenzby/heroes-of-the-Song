// 商铺商品表。
//
// 三条设计原则，改价格前先读一遍：
//
// 1. 只卖「更从容」，不卖「一定能过关」。
//    商品只加开局金币和防线血量，不改攻击力、不改敌人，玩家还是得摆塔。
//
// 2. 价格按「要攒一阵」定。
//    大章一全清约 487 银两（首通 + 满血奖励），大章二上线后再加约 700。
//    核心项买满 1280 —— 打完还得多打几把重复关，不会几十秒就买空。
//
// 3. 效果只在开局叠加，绝不改 src/data/levels.js 里的基准值。
//    levels.js 里的 gold / lives 是难度曲线的依据，被玩家的等级污染之后，
//    以后再调关卡平衡就说不清「基准到底是多少」了。

export const SHOP_ITEMS = [
  {
    id: 'pack',
    name: '出征盘缠',
    icon: '🐴',
    // effectText 是卡片上那句效果说明，写「每级」而不是当前等级，
    // 这样同一张卡在任何等级下看都通顺。
    effectText: '每关开局金币 +20',
    max: 3,
    prices: [80, 180, 320],
    effect: { goldPerLevel: 20 },
  },
  {
    id: 'wall',
    name: '加固城防',
    icon: '🏯',
    effectText: '每关防线血量 +2',
    max: 3,
    prices: [100, 220, 380],
    effect: { livesPerLevel: 2 },
  },
  {
    id: 'revive',
    name: '免死金牌',
    icon: '🏅',
    effectText: '防线失守时自动救回 3 点血，每关只能触发一次',
    max: 3,
    // 消耗品：价格表写三遍 150，买到第几个都是同一个价。
    prices: [150, 150, 150],
    effect: { revive: 1 },
  },
];

export function getShopItem(id) {
  return SHOP_ITEMS.find((item) => item.id === id) || null;
}

// 已持有 n 个时，再买一个要多少钱；买满了返回 null。
export function getItemPrice(item, ownedCount) {
  if (!item || ownedCount >= item.max) {
    return null;
  }
  return item.prices[ownedCount];
}

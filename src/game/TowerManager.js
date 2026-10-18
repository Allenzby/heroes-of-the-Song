import { Tower } from './Tower.js';
import { TOWER_TYPES, REFUND_RATE } from '../data/towers.js';

// 管所有的塔、弹丸和金币。
//
// 和 WaveManager 是对称的角色：WaveManager 管敌人这一堆，
// 这里管塔这一堆，都由 GameScene 的 update 每帧驱动。
//
// 敌人列表通过 getEnemies() 回调拿，不直接持有 WaveManager ——
// 这样两个 Manager 互不依赖，谁先创建都行。
export class TowerManager {
  constructor(scene, { gold = 0, getEnemies, onGoldChange } = {}) {
    this.scene = scene;
    this.getEnemies = getEnemies || (() => []);
    this.onGoldChange = onGoldChange || (() => {});

    this.gold = gold;
    this.towers = [];
    this.projectiles = [];

    // 槽位序号 -> 塔。用来判断某个槽位是不是已经被占了。
    this.bySlot = new Map();
  }

  // ---- 金币 ----

  canAfford(cost) {
    return cost !== null && this.gold >= cost;
  }

  spend(cost) {
    if (!this.canAfford(cost)) {
      return false;
    }
    this.gold -= cost;
    this.onGoldChange(this.gold);
    return true;
  }

  earn(amount) {
    this.gold += amount;
    this.onGoldChange(this.gold);
  }

  // ---- 建造 / 升级 / 拆除 ----

  towerAt(slotIndex) {
    return this.bySlot.get(slotIndex) || null;
  }

  // 建塔。钱不够或槽位已占用就返回 null。
  build(slotIndex, typeKey, x, y) {
    const type = TOWER_TYPES[typeKey];
    if (!type || this.bySlot.has(slotIndex)) {
      return null;
    }

    const cost = type.levels[0].cost;
    if (!this.spend(cost)) {
      return null;
    }

    const tower = new Tower(this.scene, type, typeKey, x, y, {
      onSpawnProjectile: (projectile) => this.projectiles.push(projectile),
    });
    tower.slotIndex = slotIndex;

    this.towers.push(tower);
    this.bySlot.set(slotIndex, tower);
    return tower;
  }

  upgrade(tower) {
    const cost = tower.upgradeCost;
    if (cost === null || !this.spend(cost)) {
      return false;
    }
    return tower.upgrade();
  }

  // 拆除，按 REFUND_RATE 返还累计投入。
  demolish(tower) {
    const refund = this.refundFor(tower);

    this.bySlot.delete(tower.slotIndex);
    const index = this.towers.indexOf(tower);
    if (index >= 0) {
      this.towers.splice(index, 1);
    }
    tower.destroy();

    this.earn(refund);
    return refund;
  }

  // 拆这座塔能拿回多少钱。面板要先显示出来，所以单独一个方法。
  refundFor(tower) {
    return Math.floor(tower.investedGold * REFUND_RATE);
  }

  // ---- 每帧 ----

  // delta 已经过 runtime.scaleDelta() 缩放，所以暂停时这里收到的是 0，
  // GameScene 那边会直接跳过不调用。
  update(delta) {
    for (const tower of this.towers) {
      tower.update(delta, this.getEnemies());
    }

    // 倒着遍历，方便边走边删。
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      if (!this.projectiles[i].update(delta)) {
        this.projectiles.splice(i, 1);
      }
    }
  }

  destroy() {
    this.towers.forEach((tower) => tower.destroy());
    this.towers = [];
    this.projectiles.forEach((projectile) => projectile.destroy());
    this.projectiles = [];
    this.bySlot.clear();
  }
}

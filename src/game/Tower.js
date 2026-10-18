import Phaser from 'phaser';
import { isMelee, maxLevel } from '../data/towers.js';
import { Projectile } from './Projectile.js';

// 一座塔（武将）。结构和 Enemy 很像：用 Container 装阴影和立绘，
// 区别是塔不会走，只会转身、挥砍/放箭。
//
// 攻击冷却用的 delta 必须是经过 runtime.scaleDelta() 缩放的 ——
// 见 LevelRuntime.js 里的说明。TowerManager 负责传对的值进来。
export class Tower {
  constructor(scene, type, typeKey, x, y, { onSpawnProjectile } = {}) {
    this.scene = scene;
    this.type = type;
    this.typeKey = typeKey;
    this.melee = isMelee(typeKey);
    this.onSpawnProjectile = onSpawnProjectile || (() => {});

    this.level = 0;
    // 累计投入的金币，拆除时按比例返还。
    this.invested = type.levels[0].cost;
    // 距离下一次能开火还差多少毫秒。
    this.cooldownLeft = 0;
    // 面朝哪边：1 朝右，-1 朝左。
    //
    // 单独记一个字段，不去读 sprite.scaleX 的正负 —— 出手和升级都会
    // tween scaleX，读到的可能是动画中间值，而且 tween 结束时会把 scaleX
    // 设成正数，朝左的塔会莫名转回朝右。所以朝向由这个字段说了算。
    this.facing = 1;

    this.container = scene.add.container(x, y);

    // 射程圈。平时藏着，选中这座塔（或悬停建造选项）时才显示。
    this.rangeCircle = scene.add.circle(0, 0, this.stats.range, 0x60a5fa, 0.1)
      .setStrokeStyle(2, 0x60a5fa, 0.7)
      .setVisible(false);

    // 脚下阴影，和敌人同一个做法，免得人像飘在地图上。
    this.shadow = scene.add.ellipse(0, 0, type.displayHeight * 0.5, type.displayHeight * 0.15, 0x000000, 0.32);

    // 立绘。原图四周有透明留白，按 contentRatio 放大补偿，
    // 让人物实际高度等于 displayHeight。
    const targetHeight = type.displayHeight / type.contentRatio;
    this.sprite = scene.add.image(0, 0, type.key);
    this.baseScale = targetHeight / this.sprite.height;
    this.sprite.setScale(this.baseScale);
    // 原点在脚底，人物是"站"在槽位上的。
    this.sprite.setOrigin(0.5, 1);

    // 挥砍弧光画在这上面，每次攻击重画一遍。
    this.slash = scene.add.graphics();

    // 等级标记（★），1 级时不显示。
    this.levelText = scene.add.text(0, 6, '', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#fde68a',
      stroke: '#0f172a',
      strokeThickness: 3,
    }).setOrigin(0.5, 0.5);

    this.container.add([this.rangeCircle, this.shadow, this.sprite, this.slash, this.levelText]);

    // 和敌人同一个深度公式：越靠下越靠前，避免上下位置的角色互相遮挡。
    this.container.setDepth(5 + y / 1000);

    // 建造时冒出来的动画。
    //
    // 暂停中建的塔不能用 tween：TweenManager 暂停时新建的 tween 也不更新，
    // 塔会永远停在 0.6 倍大小上。所以暂停中就直接是最终大小。
    if (!scene.tweens.paused) {
      this.sprite.setScale(this.baseScale * 0.6);
      scene.tweens.add({
        targets: this.sprite,
        scaleX: this.baseScale,
        scaleY: this.baseScale,
        duration: 260,
        ease: 'Back.easeOut',
      });
    }
  }

  // 把立绘的朝向应用到 scaleX 上。
  // 所有改 scaleX 的地方都要经过这里，否则朝左的塔会被 tween 掰回朝右。
  applyFacing() {
    this.sprite.scaleX = Math.abs(this.sprite.scaleX) * this.facing;
  }

  // 当前等级的数值。升级后自动指向新的一行。
  get stats() {
    return this.type.levels[this.level];
  }

  get isMaxLevel() {
    return this.level >= maxLevel(this.type);
  }

  // 升到下一级要花多少钱。满级返回 null。
  get upgradeCost() {
    if (this.isMaxLevel) {
      return null;
    }
    return this.type.levels[this.level + 1].cost;
  }

  // 拆除返还多少。比例由 towers.js 的 REFUND_RATE 决定，
  // 这里只负责报出累计投入，具体换算交给 TowerManager。
  get investedGold() {
    return this.invested;
  }

  // delta 是毫秒（已缩放）。暂停时 TowerManager 根本不会调进来，
  // 所以这里不用再判断暂停。
  update(delta, enemies) {
    if (this.cooldownLeft > 0) {
      this.cooldownLeft -= delta;
    }

    if (this.cooldownLeft > 0) {
      return;
    }

    const target = this.findTarget(enemies);
    if (!target) {
      return;
    }

    this.attack(target);
    this.cooldownLeft = this.stats.cooldown;
  }

  // 射程内挑一个目标。
  //
  // 挑"沿路径走得最远的那个"，不是最近的 —— 快要突破防线的威胁最大，
  // 应该优先打。走了多远直接看 Enemy 维护的 segment / segmentProgress。
  findTarget(enemies) {
    const range = this.stats.range;
    let best = null;
    let bestProgress = -1;

    for (const enemy of enemies) {
      if (enemy.dead || enemy.escaped || !enemy.container) {
        continue;
      }

      // 距离按躯干中心算，而不是脚底 —— 脚底离得远但人已经进射程了。
      const ex = enemy.container.x;
      const ey = enemy.container.y - enemy.type.displayHeight * 0.5;
      if (Phaser.Math.Distance.Between(this.container.x, this.container.y, ex, ey) > range) {
        continue;
      }

      const progress = enemy.segment * 100000 + enemy.segmentProgress;
      if (progress > bestProgress) {
        bestProgress = progress;
        best = enemy;
      }
    }

    return best;
  }

  attack(target) {
    const tx = target.container.x;
    const ty = target.container.y - target.type.displayHeight * 0.5;
    const angle = Math.atan2(ty - this.container.y, tx - this.container.x);

    // 转身朝向目标。立绘原图都是朝右的，往左打就把 scaleX 取负。
    // 和 Enemy 翻转立绘是同一个套路，只是朝向记在 this.facing 里。
    this.facing = tx < this.container.x ? -1 : 1;
    this.applyFacing();

    if (this.melee) {
      // 近战：立刻结算伤害，同时播一道挥砍弧光。
      target.takeDamage(this.stats.damage);
      this.playSlash(angle);
    } else {
      // 远战：生成弹丸，命中时才结算伤害。
      // 出手点抬到胸口高度，不然箭是从脚底射出来的。
      const originY = this.container.y - this.type.displayHeight * 0.6;
      this.onSpawnProjectile(new Projectile(
        this.scene,
        this.container.x,
        originY,
        target,
        this.stats.damage,
      ));
    }

    // 出手时轻微前倾，给一点用力的感觉。
    // 只 tween scaleY —— 碰 scaleX 会和朝向打架。
    this.scene.tweens.add({
      targets: this.sprite,
      scaleY: this.baseScale * 0.94,
      duration: 90,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  // 朝目标方向甩一道扇形刀光。
  // 用 tween 做淡出，所以暂停和倍速会自动生效（tweens.timeScale 已被 LevelRuntime 接管）。
  playSlash(angle) {
    const reach = this.type.displayHeight * 0.62;
    const spread = Phaser.Math.DegToRad(52);

    this.slash.clear();
    this.slash.fillStyle(0xfef9c3, 0.85);
    this.slash.slice(
      0,
      -this.type.displayHeight * 0.5,
      reach,
      angle - spread / 2,
      angle + spread / 2,
      false,
    );
    this.slash.fillPath();

    this.slash.setAlpha(0.85);
    this.slash.setScale(0.7);

    this.scene.tweens.add({
      targets: this.slash,
      alpha: 0,
      scale: 1.15,
      duration: 180,
      ease: 'Quad.easeOut',
      onComplete: () => {
        if (this.slash) {
          this.slash.clear();
          this.slash.setScale(1);
        }
      },
    });
  }

  upgrade() {
    if (this.isMaxLevel) {
      return false;
    }

    this.level += 1;
    this.invested += this.stats.cost;

    // 射程圈跟着变大。
    this.rangeCircle.setRadius(this.stats.range);
    this.levelText.setText('★'.repeat(this.level));

    // 一下放大回弹，让玩家看到升级生效了。
    // scaleX 的目标值要带上朝向，否则朝左的塔会被掰回朝右。
    //
    // 暂停中升级就跳过特效 —— tween 不会跑，塔会卡在放大状态、
    // 金圈也会一直留在屏幕上不消失。
    if (this.scene.tweens.paused) {
      this.applyFacing();
      return true;
    }

    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: this.baseScale * 1.18 * this.facing,
      scaleY: this.baseScale * 1.18,
      duration: 140,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => this.applyFacing(),
    });

    // 一圈金色扩散。
    const ring = this.scene.add.circle(0, 0, this.type.displayHeight * 0.3, 0xfde68a, 0)
      .setStrokeStyle(3, 0xfde68a, 1);
    this.container.add(ring);
    this.scene.tweens.add({
      targets: ring,
      scale: 2.2,
      alpha: 0,
      duration: 420,
      ease: 'Sine.easeOut',
      onComplete: () => ring.destroy(),
    });

    return true;
  }

  setRangeVisible(visible) {
    if (this.rangeCircle) {
      this.rangeCircle.setVisible(visible);
    }
  }

  destroy() {
    if (this.container) {
      this.container.destroy();
      this.container = null;
    }
  }
}

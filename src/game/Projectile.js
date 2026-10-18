import Phaser from 'phaser';

// 远战武将发射的弹丸（箭矢/飞石）。
//
// 逐帧朝目标当前位置追踪，不是 tween 到一个固定点 ——
// 目标一直在走，追踪看着更自然，风格也和 Enemy 的逐帧移动一致。
// 代价是必须自己算移动，所以 delta 同样要经过 runtime.scaleDelta()，
// 由 TowerManager 统一传进来。
const SPEED = 420;      // 画布像素 / 秒
const HIT_RADIUS = 12;  // 距目标躯干中心多近算命中

export class Projectile {
  constructor(scene, x, y, target, damage) {
    this.scene = scene;
    this.target = target;
    this.damage = damage;
    this.done = false;

    // 目标最后出现的位置。目标中途死了就朝这里继续飞完，
    // 而不是让弹丸凭空消失。
    this.lastX = target.container.x;
    this.lastY = target.container.y - target.type.displayHeight * 0.5;

    this.sprite = scene.add.ellipse(x, y, 9, 5, 0xfde68a, 1)
      .setStrokeStyle(1.5, 0x92400e, 0.9)
      .setDepth(20);
  }

  // delta 是毫秒（已经过 runtime.scaleDelta 缩放）。
  // 返回 false 表示这颗弹丸已经结束了，该被清理掉。
  update(delta) {
    if (this.done) {
      return false;
    }

    // 目标还活着就更新追踪点；死了就用最后记下的位置。
    const alive = this.target && !this.target.dead && this.target.container;
    if (alive) {
      this.lastX = this.target.container.x;
      this.lastY = this.target.container.y - this.target.type.displayHeight * 0.5;
    }

    const dx = this.lastX - this.sprite.x;
    const dy = this.lastY - this.sprite.y;
    const dist = Math.hypot(dx, dy);

    // 弹丸头朝飞行方向。
    this.sprite.rotation = Math.atan2(dy, dx);

    const step = (SPEED * delta) / 1000;

    // 到了。活着就结算伤害，死了就只是消失。
    if (dist <= Math.max(step, HIT_RADIUS)) {
      if (alive) {
        this.target.takeDamage(this.damage);
      }
      this.destroy();
      return false;
    }

    this.sprite.x += (dx / dist) * step;
    this.sprite.y += (dy / dist) * step;

    // 飞出画面就别留着了（目标逃脱后可能出现这种情况）。
    const { width, height } = this.scene.scale;
    if (!Phaser.Geom.Rectangle.Contains(
      new Phaser.Geom.Rectangle(-40, -40, width + 80, height + 80),
      this.sprite.x,
      this.sprite.y,
    )) {
      this.destroy();
      return false;
    }

    return true;
  }

  destroy() {
    this.done = true;
    if (this.sprite) {
      this.sprite.destroy();
      this.sprite = null;
    }
  }
}

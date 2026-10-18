import Phaser from 'phaser';
import { playSfx } from './sfx.js';

// 一个敌人。用 Container 装立绘和血条，这样移动时两者一起走。
//
// 走路方式：不用物理引擎，直接沿航点列表插值。塔防的敌人是"轨道上的车"，
// 路径是固定的，用物理反而要处理转向、加速这些用不上的东西。
export class Enemy {
  constructor(scene, type, path) {
    this.scene = scene;
    this.type = type;
    this.path = path;

    this.hp = type.hp;
    this.maxHp = type.hp;
    this.speed = type.speed;

    // 立绘原图朝哪边。默认朝右（土匪、滚木、重甲都是），
    // 两条船的美术是朝左的，在 enemies.js 里标了 facesLeft。
    //
    // 存成 +1 / -1，往右走时 scaleX 就乘这个数：
    // 朝右的图不翻（+1），朝左的图要翻过来（-1）。
    // 只在这里判断一次，后面 update 和 die 都用它，
    // 免得两处各写一遍 if 又对不上。
    this.artFacing = type.facesLeft ? -1 : 1;
    // 当前朝着哪边走（+1 右 / -1 左）。die() 要用它决定往哪边倒 ——
    // 不能像以前那样看 sprite.scaleX 的正负，朝左的图那个符号是反的。
    this.facing = 1;

    // 当前走到第几段（从 path[segment] 走向 path[segment + 1]）
    this.segment = 0;
    this.segmentProgress = 0;
    this.dead = false;
    this.escaped = false;

    const start = path[0];
    this.container = scene.add.container(start.x, start.y).setDepth(5);

    // 立绘。原图四周有透明留白，所以按 contentRatio 放大补偿，
    // 让人物的实际高度等于 displayHeight。
    const targetHeight = type.displayHeight / type.contentRatio;
    this.sprite = scene.add.image(0, 0, type.key);
    const scale = targetHeight / this.sprite.height;
    this.sprite.setScale(scale);
    // 朝左的原图先翻成朝右，因为所有路线都是从左往右起步的。
    // 不在这里翻的话，出生的第一帧会朝反方向（update 里才纠正过来）。
    this.sprite.scaleX = scale * this.artFacing;
    // 原点放在脚底，这样敌人是"站"在路面上的，而不是路面穿过肚子。
    this.sprite.setOrigin(0.5, 1);

    // 脚下的阴影，让人物不像是飘在地图上。
    // 宽度系数默认 0.45（照人的体型定的），船比人宽得多，
    // 在 enemies.js 里用 shadowScale 单独调大，不然船底会缩成一小团。
    const shadowScale = type.shadowScale || 0.45;
    this.shadow = scene.add.ellipse(0, 0, type.displayHeight * shadowScale, type.displayHeight * 0.14, 0x000000, 0.32);

    this.healthBar = scene.add.graphics();

    // 血量数字压在血条上。字号很小，加描边才能在绿/黄/红底上都看清。
    this.healthText = scene.add.text(0, 0, '', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '11px',
      fontStyle: 'bold',
      color: '#f8fafc',
      stroke: '#0f172a',
      strokeThickness: 3,
    }).setOrigin(0.5, 0.5);

    this.container.add([this.shadow, this.sprite, this.healthBar, this.healthText]);
    this.drawHealthBar();

    // 走路的上下颠簸。图是静态的，用一点位移假装有脚步感。
    this.bobTween = scene.tweens.add({
      targets: this.sprite,
      y: -type.displayHeight * 0.045,
      duration: 380,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  // delta 是毫秒。返回 false 表示这个敌人已经不在场上了。
  update(delta) {
    if (this.dead || this.escaped) {
      return false;
    }

    // 按速度沿路径推进。一帧可能跨过好几个短航点，所以用 while。
    let remaining = (this.speed * delta) / 1000;

    while (remaining > 0) {
      const from = this.path[this.segment];
      const to = this.path[this.segment + 1];

      if (!to) {
        this.escaped = true;
        return false;
      }

      const segLength = Phaser.Math.Distance.Between(from.x, from.y, to.x, to.y);
      const left = segLength - this.segmentProgress;

      if (remaining < left) {
        this.segmentProgress += remaining;
        remaining = 0;
      } else {
        // 走完这一段，剩下的距离留给下一段。
        remaining -= left;
        this.segment += 1;
        this.segmentProgress = 0;
      }
    }

    const from = this.path[this.segment];
    const to = this.path[this.segment + 1];
    if (!to) {
      this.escaped = true;
      return false;
    }

    const segLength = Phaser.Math.Distance.Between(from.x, from.y, to.x, to.y);
    const t = segLength === 0 ? 0 : this.segmentProgress / segLength;

    this.container.x = Phaser.Math.Linear(from.x, to.x, t);
    this.container.y = Phaser.Math.Linear(from.y, to.y, t);

    // 按前进方向翻立绘。
    //
    // 不能直接写"往左走就取负"—— 那是假设原图都朝右。
    // 现在有朝左的立绘（两条船），所以统一成
    // 「往哪边走」×「原图朝哪边」：两个都是 -1 时相乘得 +1，正好不翻。
    // 竖着走的那几段（to.x === from.x）保持上一帧的朝向，不然会来回抖。
    if (to.x !== from.x) {
      this.facing = to.x > from.x ? 1 : -1;
      this.sprite.scaleX = Math.abs(this.sprite.scaleX) * this.facing * this.artFacing;
    }

    // 越往下越靠前，避免下面的敌人被上面的挡住。
    this.container.setDepth(5 + this.container.y / 1000);

    return true;
  }

  takeDamage(amount) {
    if (this.dead) {
      return;
    }
    this.hp -= amount;

    // 命中音效。放在这里而不是 Tower.attack 里，因为近战和远战
    // 结算伤害的地方不一样（近战当场结算，远战等弹丸飞到），
    // 而这里是两条路唯一的汇合点 —— 只写一次就都覆盖到了。
    //
    // 这一下把人打死了也照样播：死也是被打死的，
    // 少这一声反而像是最后一击没打中。紧接着响的击杀音效会盖在它上面，
    // 听起来正好是"打中 → 倒下"两层。节流和音量在 sfx.js 里控制。
    playSfx(this.scene, 'hit');

    // 受击闪白，给玩家一点打中了的反馈。
    //
    // 这一击把人打死了也照样要清掉白色：接下来要播倒地动画，
    // 一个纯白剪影倒下去像鬼影，得让玩家看清是谁被打倒了。
    // 所以这里判断的是"立绘还在不在"（container 被销毁就说明动画播完了），
    // 而不是"死了没有"。
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(70, () => {
      if (this.container) {
        this.sprite.clearTint();
      }
    });

    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
    } else {
      this.drawHealthBar();
    }
  }

  drawHealthBar() {
    const width = this.type.displayHeight * 0.62;
    // 比原来厚一些，才装得下里面的血量数字。
    const height = 12;
    const x = -width / 2;
    const y = -this.type.displayHeight - 12;
    const ratio = this.hp / this.maxHp;

    this.healthBar.clear();

    // 满血时不画血条，画面干净一些。
    if (ratio >= 1) {
      this.healthText.setVisible(false);
      return;
    }

    this.healthBar.fillStyle(0x0f172a, 0.75);
    this.healthBar.fillRect(x - 1, y - 1, width + 2, height + 2);

    const color = ratio > 0.5 ? 0x4ade80 : ratio > 0.25 ? 0xfbbf24 : 0xef4444;
    this.healthBar.fillStyle(color, 1);
    this.healthBar.fillRect(x, y, width * ratio, height);

    this.healthText.setVisible(true);
    this.healthText.setPosition(0, y + height / 2);
    this.healthText.setText(`${Math.ceil(this.hp)} / ${this.maxHp}`);
  }

  // 死亡小动画：整个人倒下去（转 90 度），同时渐变淡化 0.4 秒，然后销毁。
  //
  // 为什么转的是 sprite 而不是 container：container 里还装着血条和血量数字，
  // 一起转的话数字会歪着躺在地上，很怪。只转立绘，血条那边直接藏掉。
  //
  // 立绘的原点在脚底（构造函数里 setOrigin(0.5, 1)），所以旋转是绕着脚转的 ——
  // 正好就是"人被打倒、以脚为轴扑倒在地"的样子。要是原点在中心，
  // 转出来会像原地打转的陀螺。
  die() {
    if (this.dead) {
      return;
    }
    this.dead = true;

    // 颠簸动画（bobTween）是挂在 sprite 上、无限循环改 sprite.y 的。
    // 不停掉的话尸体会继续上下抖，所以死亡的第一件事就是停它 ——
    // 不能等到 destroy()，那时动画已经播完了。
    if (this.bobTween) {
      this.bobTween.stop();
      this.bobTween = null;
    }

    // 血条和血量数字立刻收掉：血都空了还挂着一条空血条没有意义，
    // 而且它们不跟着旋转，留在原位会和倒下去的身体脱开。
    this.healthBar.clear();
    this.healthText.setVisible(false);

    // 朝着前进方向倒。走右边的往右倒，走左边的往左倒 ——
    // 看着像是被自己的惯性带倒的。
    //
    // 用 this.facing（走的方向）而不是 sprite.scaleX 的正负：
    // 朝左的立绘翻转符号是反的，看 scaleX 会倒向反方向。
    const direction = this.facing;

    // 倒下去转多少度。人是整个扑倒在地（90 度），
    // 船沉下去是侧翻，转到底会变成"船底朝天"，所以在 enemies.js 里
    // 给船写了小一点的 fallAngle。
    const fallAngle = this.type.fallAngle || 90;

    // 倒地比淡化快一点（0.3s vs 0.4s）：先躺平，再消失。
    // 反过来的话人还在半空中就已经看不见了，像是凭空蒸发。
    // easeIn 是因为倒下是加速的 —— 越接近地面越快。
    this.fallTween = this.scene.tweens.add({
      targets: this.sprite,
      rotation: direction * Phaser.Math.DegToRad(fallAngle),
      duration: 300,
      ease: 'Cubic.easeIn',
    });

    // 渐变淡化 0.4 秒。淡的是 container，所以立绘和脚下的阴影一起淡掉。
    // 淡完才销毁 —— GameScene.onKill 要读 container 的坐标来冒金币飘字，
    // 这期间 container 必须还在（见 src/scenes/GameScene.js 的 onKill）。
    this.fadeTween = this.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      duration: 400,
      ease: 'Quad.easeIn',
      onComplete: () => this.destroy(),
    });
  }

  destroy() {
    if (this.bobTween) {
      this.bobTween.stop();
      this.bobTween = null;
    }
    // 死亡动画还没播完就被销毁（比如中途退出关卡、场景重启）时要停掉，
    // 否则 onComplete 会在 container 已经没了之后再跑一遍 destroy()。
    if (this.fallTween) {
      this.fallTween.stop();
      this.fallTween = null;
    }
    if (this.fadeTween) {
      this.fadeTween.stop();
      this.fadeTween = null;
    }
    if (this.container) {
      this.container.destroy();
      this.container = null;
    }
  }
}

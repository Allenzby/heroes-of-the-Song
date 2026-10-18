import Phaser from 'phaser';

// 防线（敌人的终点）。位置取行进路线的最后一个点。
//
// 血条画法和敌人的一样（背景框 + 按比例填充 + 变色），只是尺寸大一号，
// 并且始终显示 —— 敌人满血时藏血条是为了画面干净，防线只有一条，
// 玩家需要随时看到它还剩多少。
const BAR_WIDTH = 104;
const BAR_HEIGHT = 14;
const BAR_TOP = -46;

export class DefenseLine {
  constructor(scene, x, y, maxHp) {
    this.scene = scene;
    this.maxHp = maxHp;
    this.hp = maxHp;

    this.container = scene.add.container(x, y).setDepth(9);

    // 外圈脉冲：和出生点同一套做法，单独一个圆做扩散动画。
    const pulse = scene.add.circle(0, 0, 16, 0x38bdf8, 0);
    pulse.setStrokeStyle(3, 0x38bdf8, 1);

    // 实心核心。
    const core = scene.add.circle(0, 0, 8, 0x38bdf8, 1);
    core.setStrokeStyle(2, 0xf0f9ff, 0.9);

    const label = scene.add.text(0, 26, '防线', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#f0f9ff',
      backgroundColor: 'rgba(12, 74, 110, 0.85)',
      padding: { x: 7, y: 4 },
    }).setOrigin(0.5, 0.5);

    this.healthBar = scene.add.graphics();

    // 血量数字压在血条上。描边是为了在绿色和红色底上都看得清。
    this.healthText = scene.add.text(0, BAR_TOP + BAR_HEIGHT / 2, '', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#f8fafc',
      stroke: '#0f172a',
      strokeThickness: 3,
    }).setOrigin(0.5, 0.5);

    this.container.add([pulse, core, label, this.healthBar, this.healthText]);
    this.draw();

    scene.tweens.add({
      targets: pulse,
      scale: { from: 1, to: 2.2 },
      alpha: { from: 0.9, to: 0 },
      duration: 1600,
      repeat: -1,
      ease: 'Sine.easeOut',
    });
  }

  setHp(hp) {
    this.hp = Phaser.Math.Clamp(hp, 0, this.maxHp);
    this.draw();
  }

  draw() {
    const x = -BAR_WIDTH / 2;
    const y = BAR_TOP;
    const ratio = this.maxHp === 0 ? 0 : this.hp / this.maxHp;

    this.healthBar.clear();

    this.healthBar.fillStyle(0x0f172a, 0.8);
    this.healthBar.fillRect(x - 2, y - 2, BAR_WIDTH + 4, BAR_HEIGHT + 4);

    const color = ratio > 0.5 ? 0x4ade80 : ratio > 0.25 ? 0xfbbf24 : 0xef4444;
    this.healthBar.fillStyle(color, 1);
    this.healthBar.fillRect(x, y, BAR_WIDTH * ratio, BAR_HEIGHT);

    this.healthText.setText(`${this.hp} / ${this.maxHp}`);
  }

  destroy() {
    if (this.container) {
      this.container.destroy();
      this.container = null;
    }
  }
}

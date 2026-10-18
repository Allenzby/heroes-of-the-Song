// 关卡运行时控制：倒计时、暂停/继续、倍速。
// 每一关都会用到，所以独立成模块，由 GameScene 调用。
//
// 时间流速通过三处 timeScale 统一控制：
//   - scene.time.timeScale    定时器事件（敌人生成、技能冷却）
//   - scene.tweens.timeScale  补间动画
//   - scene.physics.world.timeScale  物理步进（注意语义相反，见下）
import { pauseBgm, resumeBgm, playSfxHandle } from './sfx.js';

export const SPEEDS = [1, 2];

export class LevelRuntime {
  constructor(scene, { onStart } = {}) {
    this.scene = scene;
    this.onStart = onStart || (() => {});

    this.speed = 1;
    this.paused = false;
    this.started = false;
    // 倒计时的 3 声哔。拿着它是为了能中途掐掉（见 stopCountdownSound）。
    this.countdownSound = null;
    // 这一关是否已经打完（通关或失守）。
    // 中途退出会丢掉塔和金币，打完了就没什么可丢的了 ——
    // HUD 靠这个标志决定退出前要不要问一句（见 src/ui/hud.js）。
    this.settled = false;
  }

  // 通关或失守时由 GameScene 调用。
  markSettled() {
    this.settled = true;
  }

  // 3 秒倒计时，结束后才真正开始关卡。
  // 倒计时本身不受暂停和倍速影响，用 scene.time.delayedCall 会被 timeScale 干扰，
  // 所以这里用一个不挂在 Clock 上的独立计数。
  startCountdown(seconds = 3) {
    const { width, height } = this.scene.scale;

    const overlay = this.scene.add.rectangle(0, 0, width, height, 0x020617, 0.55)
      .setOrigin(0, 0)
      .setDepth(50);

    const number = this.scene.add.text(width / 2, height / 2, String(seconds), {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '120px',
      fontStyle: 'bold',
      color: '#f8fafc',
    }).setOrigin(0.5).setDepth(51);

    const hint = this.scene.add.text(width / 2, height / 2 + 90, '准备布阵', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '20px',
      color: '#94a3b8',
    }).setOrigin(0.5).setDepth(51);

    // 倒计时音效（daojishi.mp3）。整段一次播完，不是每个数字播一声。
    //
    // 文件里本来就有 3 声"哔"，落在 0.075 / 1.08 / 2.08 秒 —— 正好每秒一声，
    // 和下面 tick 的 1000ms 节奏对得上（第一声跟着 3 出现，最后一声跟着 1）。
    // 一次播完的好处是三声的间隔就是作者录进去的样子，
    // 而不是靠三个 setTimeout 去凑 —— 那样每一声都会各自积累一点延迟，
    // 到第三声就听得出和数字错开了。
    //
    // 拿住返回的对象是为了能中途掐掉：玩家可能在哔完之前就从菜单退出关卡，
    // 那时候声音不该跟着飘到选章界面上（见 destroy）。
    //
    // 只有倒计时是满 3 秒时才播 —— 秒数要是被改小了，
    // 音效会比画面长，最后一声落在已经开打的画面上。
    if (seconds === 3) {
      this.countdownSound = playSfxHandle(this.scene, 'countdown');
    }

    let remaining = seconds;

    const tick = () => {
      number.setText(String(remaining));
      number.setScale(1.4);
      this.scene.tweens.add({
        targets: number,
        scale: 1,
        duration: 260,
        ease: 'Back.easeOut',
      });

      remaining -= 1;

      if (remaining >= 1) {
        this.countdownTimer = window.setTimeout(tick, 1000);
        return;
      }

      // 最后一步：显示「开始」再淡出。
      this.countdownTimer = window.setTimeout(() => {
        number.setText('开始！');
        number.setFontSize(72);
        hint.setVisible(false);

        this.countdownTimer = window.setTimeout(() => {
          overlay.destroy();
          number.destroy();
          hint.destroy();
          this.begin();
        }, 600);
      }, 1000);
    };

    tick();
  }

  // 倒计时结束，关卡正式开始。
  begin() {
    this.started = true;
    // 三声哔到这儿已经播完了，把对象收掉。
    this.stopCountdownSound();
    this.applyTimeScale();
    this.onStart();
  }

  setPaused(paused) {
    this.paused = paused;

    const scene = this.scene;

    if (paused) {
      scene.time.paused = true;
      scene.tweens.pauseAll();
      if (scene.physics && scene.physics.world) {
        scene.physics.world.pause();
      }
      // 背景音乐跟着停。游戏都不动了，音乐还在往下走会很怪 ——
      // 而且暂停音效（zanting.mp3）该被听清，底下垫着音乐就糊了。
      pauseBgm();
    } else {
      scene.time.paused = false;
      scene.tweens.resumeAll();
      if (scene.physics && scene.physics.world) {
        scene.physics.world.resume();
      }
      resumeBgm();
    }
  }

  togglePaused() {
    this.setPaused(!this.paused);
    return this.paused;
  }

  setSpeed(speed) {
    if (!SPEEDS.includes(speed)) {
      return;
    }
    this.speed = speed;
    this.applyTimeScale();
  }

  // 逐帧移动的代码（敌人走路、子弹飞行）必须用这个换算每帧时长。
  //
  // 注意：Phaser 传给 scene.update(time, delta) 的 delta 是**原始值**。
  // Clock 只在自己内部对定时器事件乘 timeScale（Clock.js:367），
  // 并且 paused 时是直接 return，两者都不会影响 update 的参数。
  // 所以按 delta 移动的东西不问一句运行时，暂停和倍速对它就是无效的。
  scaleDelta(delta) {
    if (this.paused || !this.started) {
      return 0;
    }
    return delta * this.speed;
  }

  applyTimeScale() {
    const scene = this.scene;

    scene.time.timeScale = this.speed;
    scene.tweens.timeScale = this.speed;

    // Arcade 物理的 timeScale 语义是反的：值越大，模拟越慢。
    // 所以 2 倍速要设成 1/2，而不是 2。
    if (scene.physics && scene.physics.world) {
      scene.physics.world.timeScale = 1 / this.speed;
    }
  }

  // 场景关闭时清掉挂起的倒计时，避免回到选章后仍然触发 begin()。
  destroy() {
    if (this.countdownTimer) {
      window.clearTimeout(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.stopCountdownSound();
  }

  // 掐掉倒计时音效。
  //
  // 三声哔一共 3 秒，玩家完全可能在这中间就从菜单退出去
  // （菜单按钮在倒计时期间是**可用**的，见 index.html 的注释），
  // 不掐的话剩下的哔声会响在选章界面上。
  //
  // 也在倒计时正常走完时调一次：那时声音本来也快播完了，
  // 但「开始！」淡出比最后一声哔晚 600 毫秒，留着这个对象没意义。
  stopCountdownSound() {
    if (this.countdownSound) {
      this.countdownSound.destroy();
      this.countdownSound = null;
    }
  }
}

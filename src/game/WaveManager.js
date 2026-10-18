import { Enemy } from './Enemy.js';

// 按波次表生成敌人，并统一驱动它们移动。
//
// 所有定时都走 scene.time（不是 window.setTimeout），
// 这样暂停和倍速能自动生效 —— LevelRuntime 改的就是 time.timeScale。
// 倒计时用 setTimeout 是因为它要在这些还没启动前就跑，两者不冲突。
export class WaveManager {
  constructor(scene, { path, waves, types, onLeak, onKill, onWaveChange, onClear } = {}) {
    this.scene = scene;
    this.path = path;
    this.waves = waves;
    this.types = types;

    this.onLeak = onLeak || (() => {});
    this.onKill = onKill || (() => {});
    this.onWaveChange = onWaveChange || (() => {});
    this.onClear = onClear || (() => {});

    this.enemies = [];
    this.waveIndex = -1;
    this.timers = [];
    this.running = false;
    this.finished = false;
  }

  get totalWaves() {
    return this.waves.length;
  }

  get aliveCount() {
    return this.enemies.length;
  }

  start() {
    this.running = true;
    this.queueNextWave(this.waves[0].delay);
  }

  queueNextWave(delay) {
    const timer = this.scene.time.delayedCall(Math.max(delay, 1), () => this.startNextWave());
    this.timers.push(timer);
  }

  startNextWave() {
    this.waveIndex += 1;
    const wave = this.waves[this.waveIndex];

    if (!wave) {
      this.finished = true;
      this.checkClear();
      return;
    }

    this.onWaveChange(this.waveIndex + 1, this.totalWaves);

    const type = this.types[wave.type];
    for (let i = 0; i < wave.count; i += 1) {
      const timer = this.scene.time.delayedCall(i * wave.interval, () => this.spawn(type));
      this.timers.push(timer);
    }

    // 这一波放完之后，隔 nextWave.delay 再开下一波。
    const waveDuration = (wave.count - 1) * wave.interval;
    const next = this.waves[this.waveIndex + 1];
    if (next) {
      this.queueNextWave(waveDuration + next.delay);
    } else {
      // 最后一波放完了，等场上敌人清空才算通关。
      const timer = this.scene.time.delayedCall(waveDuration + 1, () => {
        this.finished = true;
        this.checkClear();
      });
      this.timers.push(timer);
    }
  }

  spawn(type) {
    const enemy = new Enemy(this.scene, type, this.path);
    this.enemies.push(enemy);
  }

  // 由 GameScene 的 update 每帧调用。
  update(delta) {
    if (!this.running) {
      return;
    }

    for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
      const enemy = this.enemies[i];
      const alive = enemy.update(delta);

      if (alive) {
        continue;
      }

      // 先从数组里摘掉，再回调。
      //
      // 顺序很重要：onLeak 可能把最后一点血扣光，GameScene 就会走失守流程
      // 并调用 destroy() —— 那会把 this.enemies 整个清空。要是先回调再 splice，
      // 循环下一轮读 this.enemies[i] 就是 undefined，直接崩在 enemy.update 上。
      //
      // 死亡的敌人这时正在播放淡出动画、会自己 destroy，所以这里不动它。
      // dead 转 true 之后 update 就返回 false 了，加上这里的 splice，
      // onKill 只会触发一次。
      this.enemies.splice(i, 1);

      if (enemy.escaped) {
        this.onLeak(enemy);
        enemy.destroy();
      } else if (enemy.dead) {
        this.onKill(enemy);
      }

      // 回调里被销毁了（失守）就别再往下走了。destroy() 已经把剩下的敌人
      // 都清掉了，继续循环只会读到空。
      if (!this.running) {
        return;
      }
    }

    this.checkClear();
  }

  checkClear() {
    if (this.finished && this.enemies.length === 0 && this.running) {
      this.running = false;
      this.onClear();
    }
  }

  destroy() {
    this.running = false;
    this.timers.forEach((timer) => timer.remove(false));
    this.timers = [];
    this.enemies.forEach((enemy) => enemy.destroy());
    this.enemies = [];
  }
}

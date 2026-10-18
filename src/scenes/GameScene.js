import Phaser from 'phaser';
import { MAP_WIDTH, MAP_HEIGHT } from '../config/game.js';
import { LevelRuntime } from '../game/LevelRuntime.js';
import { WaveManager } from '../game/WaveManager.js';
import { TowerManager } from '../game/TowerManager.js';
import { BuildPanel } from '../game/BuildPanel.js';
import { AutoPlayer } from '../game/AutoPlayer.js';
import { DefenseLine } from '../game/DefenseLine.js';
import { showGoldGain } from '../game/GoldPopup.js';
import { playSfx, stopAllSfx, startBgm, playUiClick } from '../game/sfx.js';
import { getLevel } from '../data/levels.js';
import { ENEMY_TYPES } from '../data/enemies.js';
import { CHAPTERS } from '../data/chapters.js';
import { teacherMode, autoMode } from '../state/progress.js';
import { addKills, addPlayTime, addRebuild, addGamePlayed, addWavesCleared } from '../state/stats.js';
import { attachHud, enableHud, detachHud, setGold, pulseGold, setWave, hideWave } from '../ui/hud.js';
import {
  startTutorial, onBuild, onFirstEnemy, onUpgradeOrDemolish,
  onWave4, hideTutorial, isTutorialDone,
} from '../ui/tutorial.js';

// 遮罩图里的颜色含义：紫色是道路，蓝色是建塔位，黑色是不可用区域。
const ZONE_PATH = 'path';
const ZONE_BUILD = 'build';
const ZONE_BLOCKED = 'blocked';

export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create() {
    const { width, height } = this.scale;

    // 自动演练模式的两个引用先复位。
    //
    // 必须在这里（create 最开头），不能放到 create 末尾那一堆复位里 ——
    // 那时 markAutoMode() 已经建好了 autoText，再置空就等于自己把它擦掉。
    //
    // 为什么非要复位：场景是 restart 的（菜单里的「重试本关」走 scene.start），
    // 上一局的对象已经被销毁，但字段还指着它们。
    this.autoPlayer = null;
    this.autoText = null;

    // 上一关如果是在暂停状态下退出的，Clock 的 paused 会留在 true，
    // 新关卡必须显式复位，否则倒计时结束后画面是静止的。
    this.time.paused = false;
    this.time.timeScale = 1;
    this.tweens.timeScale = 1;
    this.tweens.resumeAll();

    // 当前打哪一关。main.js 进关时把 chapter 写进 registry。
    const chapter = this.registry.get('chapter');
    this.level = getLevel(chapter && chapter.map);

    // 这是第几章（CHAPTERS 的下标）。武将的解锁判定要用它 ——
    // towers.js 里每个武将有个 unlockAt，只有 unlockAt <= 这个数才能建。
    //
    // 找不到就当成 0（序章），那时只有林冲和武松可用 ——
    // 宁可少给几个选项，也不要因为查不到章节就把全部武将放出来。
    this.chapterIndex = chapter
      ? Math.max(0, CHAPTERS.findIndex((c) => c.id === chapter.id))
      : 0;

    // 正常流程下 main.js 会拦住没做好的关卡，这里只是兜底。
    if (!this.level) {
      this.add.text(width / 2, height / 2, '这一关的地图还没做好', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '28px',
        color: '#f8fafc',
      }).setOrigin(0.5);
      return;
    }

    // 底图铺满画布。displayWidth/Height 会把 1536x864 缩放到 960x540。
    this.add.image(0, 0, this.level.mapKey)
      .setOrigin(0, 0)
      .setDisplaySize(width, height);

    // 遮罩图不显示出来，只用来逐像素采样。
    this.maskKey = this.level.maskKey;
    this.maskScaleX = MAP_WIDTH / width;
    this.maskScaleY = MAP_HEIGHT / height;

    this.label = this.add.text(12, 12, '把鼠标移到地图上试试', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '18px',
      color: '#f8fafc',
      backgroundColor: 'rgba(15, 23, 42, 0.8)',
      padding: { x: 10, y: 6 },
    }).setDepth(10);

    // 把遮罩坐标换算成画布坐标。路线和建塔位都存的是遮罩坐标。
    const toCanvas = (pt) => ({
      x: pt.x / this.maskScaleX,
      y: pt.y / this.maskScaleY,
    });
    const canvasPath = this.level.path.map(toCanvas);
    this.slots = this.level.slots.map(toCanvas);

    this.markSpawnPoint(canvasPath);

    this.input.on('pointermove', (pointer) => {
      const zone = this.getZoneAt(pointer.x, pointer.y);
      this.label.setText(`${Math.round(pointer.x)}, ${Math.round(pointer.y)}  →  ${this.describe(zone)}`);
    });

    this.lives = this.level.lives;
    this.firstEnemyKilled = false;
    this.markDefenseLine(canvasPath);

    // 塔和金币。敌人列表用回调取，这样 TowerManager 不用依赖 WaveManager
    // （WaveManager 是倒计时结束后才创建的，那时这里已经建好了）。
    //
    // 金币显示在 HUD 那排按钮旁边（DOM，见 index.html 的 #gold-display），
    // 不画在画布上 —— 右上角被 HUD 压着，画上去会被按钮遮住。
    this.towers = new TowerManager(this, {
      gold: this.level.gold,
      getEnemies: () => (this.waves ? this.waves.enemies : []),
      onGoldChange: (gold) => setGold(gold),
    });
    setGold(this.towers.gold);

    this.buildPanel = new BuildPanel(this, {
      // 哪些武将这一关能用。花荣要第一章、时迁要第二章 ——
      // 没解锁的在面板里灰着标「第N章解锁」，不藏起来。
      chapterIndex: this.chapterIndex,
      teacherMode,
      canAfford: (cost) => this.towers.canAfford(cost),
      refundFor: (tower) => this.towers.refundFor(tower),
      onBuild: (slotIndex, typeKey) => {
        const slot = this.slots[slotIndex];
        if (this.towers.build(slotIndex, typeKey, slot.x, slot.y)) {
          this.refreshSlotMarker(slotIndex);
          addRebuild();
          onBuild();
        }
      },
      onUpgrade: (tower) => {
        this.towers.upgrade(tower);
        onUpgradeOrDemolish();
      },
      onDemolish: (tower) => {
        const slotIndex = tower.slotIndex;
        this.towers.demolish(tower);
        this.refreshSlotMarker(slotIndex);
        onUpgradeOrDemolish();
      },
      onPreviewRange: (x, y, range) => this.previewRange(x, y, range),
    });

    // 槽位要能点，所以放在 towers / buildPanel 之后建。
    this.markBuildSlots();

    // 自动演练模式的两块界面：顶上的标牌 + 底下的解说字幕。
    // 普通模式下这两个都不建，画面和以前一模一样。
    if (autoMode) {
      this.markAutoMode();
    }

    // 关卡运行时：3 秒倒计时后开始。
    this.runtime = new LevelRuntime(this, {
      onStart: () => {
        enableHud();
        this.startLevel(canvasPath);
      },
    });

    attachHud(this.runtime);
    this.runtime.startCountdown(3);

    // 结算界面的返回按钮状态。每次进关都要复位 ——
    // 场景是 restart 的（菜单里的「重试本关」走 scene.start），
    // 不复位的话上一局设过的 leftLevel 会让这一局的按钮点不动，
    // 上一局的 settled 会让这一局根本结算不了（横幅和按钮都不出）。
    this.leftLevel = false;
    this.settled = false;
    this.selectCountdown = null;

    this.events.once('shutdown', () => {
      // 场景关闭时把还在响的音效掐掉。
      //
      // 这条路是菜单里的「重试本关」走的（scene.start 会先 shutdown）——
      // 上一局失守的音乐不能跟着进新的一局。
      //
      // 注意：从菜单「返回选关」**不**走这里，那条路只是 loop.sleep()，
      // 场景根本没关。那边的掐音效在 src/main.js 的 sleepGame() 里。
      stopAllSfx(this);

      if (this.waves) {
        this.waves.destroy();
        this.waves = null;
      }
      if (this.buildPanel) {
        this.buildPanel.destroy();
        this.buildPanel = null;
      }
      // 电脑玩家要在 towers 销毁**之前**停掉 ——
      // 它的决策周期挂在 scene.time 上，而 scene.time 在 shutdown 里
      // 还没停，晚一步就可能在 towers 已经是 null 的时候跑一轮。
      // （tick() 里有判空兜底，但不该指望那个。）
      if (this.autoPlayer) {
        this.autoPlayer.destroy();
        this.autoPlayer = null;
      }
      if (this.towers) {
        this.towers.destroy();
        this.towers = null;
      }
      // 挂着的返回倒计时必须停掉，否则从菜单退出去之后
      // 它还在跑，几秒后会把玩家从别的界面拽回选章界面。
      //
      // 和上面掐音效同理，这里只覆盖「重试本关」那条路（场景真的关闭）。
      // 「返回选关」只是 loop.sleep()，走不到这儿 ——
      // 那条路在 src/main.js 的 sleepGame() 里也调了一次。
      this.clearSelectCountdown();
      this.runtime.destroy();
      this.defenseLine = null;
      this.rangePreview = null;
      hideTutorial();
      detachHud();
    });
  }

  // 倒计时结束后才执行的关卡逻辑。
  startLevel(path) {
    this.label.setText(autoMode ? '自动演练中' : '点蓝圈建塔');

    // 统计：记录关卡开始时间
    this.levelStartTime = Date.now();
    addGamePlayed();

    // 序章开启新手引导（非自动模式下每次都显示）。
    if (CHAPTERS[this.chapterIndex]?.isTutorial && !autoMode) {
      startTutorial();
    }

    // 背景音乐从这里开始循环，不在 create() 里 ——
    // 倒计时那 3 秒是"准备布阵"，音乐跟着「开始！」一起进来更像是开打了。
    startBgm(this);

    this.waves = new WaveManager(this, {
      path,
      waves: this.level.waves,
      types: ENEMY_TYPES,
      onWaveChange: (current, total) => {
        setWave(current, total);
        if (current === 4) {
          onWave4();
        }
      },
      onLeak: (enemy) => this.onLeak(enemy),
      onKill: (enemy) => this.onKill(enemy),
      onClear: () => this.onLevelClear(),
    });

    this.waves.start();

    // 自动演练模式：交给电脑玩家自己打。
    //
    // 放在 waves.start() 之后，这样第一波敌人和第一座塔几乎同时出现 ——
    // 先建塔再放兵会有几秒空场，看着像卡住了。
    //
    // 它要等到这里才创建（不是 create() 里）：AutoPlayer 用 scene.time
    // 做决策周期，而倒计时期间 time 还没被 LevelRuntime 接管，
    // 提前起来会在倒计时的 3 秒里就把塔建好。
    if (autoMode) {
      this.autoPlayer = new AutoPlayer(this, {
        slots: this.slots,
        path,
        towers: this.towers,
        chapterIndex: this.chapterIndex,
        teacher: teacherMode,
        onAction: (text, slotIndex) => this.onAutoAction(text, slotIndex),
      });
      this.autoPlayer.start();
    }
  }

  // 电脑玩家做了一件事：写在屏幕下方，并在对应的槽位上闪一下。
  //
  // 两个一起做是有意的：文字说"做了什么"，闪光说"在哪儿" ——
  // 光有文字的话学生得自己在十个位子里找，一节课下来看不了几步。
  onAutoAction(text, slotIndex) {
    if (this.autoText) {
      this.autoText.setText(`🤖 ${text}`);
    }

    const ring = this.slotMarkers && this.slotMarkers[slotIndex];
    if (!ring) {
      return;
    }

    // 在槽位上叠一个金圈扩散出去。
    //
    // 不直接给 ring 本身做动画：它的粗细和透明度是"这个位子占没占"的
    // 状态显示（见 refreshSlotMarker），动画结束时的复原值和当时的状态
    // 可能已经不一样了 —— 建完塔之后圈本该变暗，动画会把它掰回亮的。
    // 另起一个一次性的圈，播完就销毁，谁也不干扰。
    const flash = this.add.circle(ring.x, ring.y, 30)
      .setStrokeStyle(3, 0xfde68a, 1)
      .setDepth(6);
    this.tweens.add({
      targets: flash,
      scale: 1.9,
      alpha: 0,
      duration: 520,
      ease: 'Sine.easeOut',
      onComplete: () => flash.destroy(),
    });
  }

  // 每帧驱动敌人移动、塔攻击、弹丸飞行。
  //
  // Phaser 给的 delta 是原始值，没有被 timeScale 缩放，暂停时也照样在跑。
  // 所以这里必须经过 runtime.scaleDelta() —— 暂停时它返回 0，2 倍速返回 2 倍，
  // 敌人和塔才会跟着暂停和倍速按钮走。
  update(time, delta) {
    if (!this.waves || !this.runtime) {
      return;
    }
    const scaled = this.runtime.scaleDelta(delta);
    if (scaled === 0) {
      return;
    }
    this.waves.update(scaled);
    if (this.towers) {
      this.towers.update(scaled);
    }
  }

  // 敌人被打死：发击杀奖励，并在尸体上冒一个金币飘字。
  //
  // 位置取躯干中段（0.5 倍身高）：
  // 太低会被自己的立绘挡住，太高又会和头顶的血条叠在一起 ——
  // 从胸口冒出来、往上飘过血条，正好都躲开。
  // 这时敌人正在播放淡出动画、container 还在，所以坐标是准的。
  onKill(enemy) {
    const reward = enemy.type.reward;
    this.towers.earn(reward);

    if (enemy.container) {
      showGoldGain(
        this,
        enemy.container.x,
        enemy.container.y - enemy.type.displayHeight * 0.5,
        reward,
      );
    }

    pulseGold();
    playSfx(this, 'kill');

    // 统计：击杀数 +1
    addKills(1);

    // 新手引导：第一个敌人被击杀时推进提示。
    if (!this.firstEnemyKilled) {
      this.firstEnemyKilled = true;
      onFirstEnemy();
    }
  }

  // 敌人走到终点。血量只显示在地图上的防线标记上。
  onLeak(enemy) {
    this.lives = Math.max(0, this.lives - enemy.type.damage);
    if (this.defenseLine) {
      this.defenseLine.setHp(this.lives);
    }

    // 屏幕红闪一下。
    const { width, height } = this.scale;
    const flash = this.add.rectangle(0, 0, width, height, 0xef4444, 0.28)
      .setOrigin(0, 0)
      .setDepth(40);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 260,
      onComplete: () => flash.destroy(),
    });

    if (this.lives === 0) {
      this.onLevelFailed();
    }
  }

  onLevelClear() {
    // 和失守共用一个"已结算"标记：两边都会建横幅和倒计时按钮，
    // 谁先结算就算谁的，另一个不该再叠一层上去。
    if (this.settled) {
      return;
    }
    this.settled = true;

    // 统计：记录游戏时间
    if (this.levelStartTime) {
      const elapsed = Math.floor((Date.now() - this.levelStartTime) / 1000);
      addPlayTime(elapsed);
      this.levelStartTime = null;
    }

    // 演练结束，电脑玩家收手。
    //
    // 不停的话它会在胜利横幅底下继续建塔升级 —— 敌人都没了，
    // 分数全是 0，pickBest() 会返回 null，所以不会真的乱建；
    // 但金币还在涨（拆除返还之类），留着这个循环没有意义。
    this.stopAutoPlayer();

    // 打完了，退出时不用再警告"进度会丢"。
    this.runtime.markSettled();

    // 胜利音效。先掐掉正在响的（最后一击的得分音效可能还没播完），
    // 免得和这段 5 秒的胜利音乐叠在一起。
    stopAllSfx(this);
    playSfx(this, 'win');

    // 先把通关记下来。
    //
    // 原来是等 1.8 秒自动回选章界面，现在画面会停在胜利界面上，
    // 什么时候离开由玩家点按钮或倒计时决定，所以进度必须在这里就记，
    // 不能等离开的时候再记 —— 玩家可能直接从菜单退出去。
    const onClear = this.registry.get('onChapterClear');
    if (onClear) {
      onClear(this.lives);
    }

    // 标题往上挪一点，给底下的返回按钮腾位置。
    this.showBanner('胜利了！', 0xfbbf24, -46);

    // 面板还开着的话收掉，横幅底下压着个建造面板很奇怪。
    if (this.buildPanel) {
      this.buildPanel.close();
    }

    // 第二个参数开支持条：胜利时心情最好，是拉支持的合适时机。
    this.showSelectButton(10, true);
  }

  // 结算画面上的支持条。位置是返回按钮正下方（传进来的 y）。
  //
  // 画在 Canvas 上而不是塞个 DOM 进去：结算时整个画面是 Phaser 画的，
  // DOM 得算坐标、还得跟着 scale 变化，比画一段文字麻烦得多。
  //
  // 整条都能点。用 setInteractive 的矩形做热区而不是给 text 加
  // —— 文字的命中区跟着字形走，字与字之间的缝点不中。
  //
  // 方法名/参数名刻意不带赞助、广告那类英文关键词（见 index.html 里
  // .support-bar 那段注释）：这类词会留在压缩后的 JS 里，虽然过滤插件
  // 主要盯的是元素的 class/id、够不着方法名，但没必要冒这个险。
  showSupportBar(x, y) {
    const W = 300;
    const H = 34;

    const container = this.add.container(x, y).setDepth(46);

    const bg = this.add.graphics();
    bg.fillStyle(0x0f172a, 0.88);
    bg.fillRoundedRect(-W / 2, -H / 2, W, H, 17);
    bg.lineStyle(1, 0x67e8f9, 0.45);
    bg.strokeRoundedRect(-W / 2, -H / 2, W, H, 17);

    const label = this.add.text(0, 0, '☕ 觉得好玩？请作者喝杯咖啡 →', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '14px',
      color: '#67e8f9',
    }).setOrigin(0.5);

    // 热区盖住整条。透明度 0 也能点 —— alpha 不影响命中测试。
    const hit = this.add.rectangle(0, 0, W, H, 0xffffff, 0)
      .setInteractive({ useHandCursor: true });

    hit.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(0x1e293b, 0.95);
      bg.fillRoundedRect(-W / 2, -H / 2, W, H, 17);
      bg.lineStyle(1, 0x67e8f9, 0.9);
      bg.strokeRoundedRect(-W / 2, -H / 2, W, H, 17);
    });

    hit.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(0x0f172a, 0.88);
      bg.fillRoundedRect(-W / 2, -H / 2, W, H, 17);
      bg.lineStyle(1, 0x67e8f9, 0.45);
      bg.strokeRoundedRect(-W / 2, -H / 2, W, H, 17);
    });

    hit.on('pointerdown', () => {
      playUiClick();
      // window.open 而不是 location.href：结算界面还要倒计时回选关，
      // 整页跳走的话这一局的返回按钮就废了。
      window.open('https://ifdian.net/a/Allenzby', '_blank', 'noopener');
    });

    container.add([bg, label, hit]);
  }

  // 结算界面底下的「返回选关」按钮，带 10 秒倒计时，走完自动回选章界面。
  // 胜利和失守共用这一个 —— 两边都是"这一关结束了，该走了"，
  // 没理由让玩家在失守时只能自己去翻菜单。
  //
  // showSupportBar：是否显示支持条。只有胜利时开 —— 刚输了还弹"请作者喝咖啡"
  // 会让人觉得在要钱，那会儿玩家只想重开一局。
  //
  // 计时用 window.setInterval 而不是 time.delayedCall：
  // 这时可能正暂停着，Clock 停了的话 delayedCall 永远不会触发。
  // 同理倒计时数字也不受倍速影响 —— 它是界面时间，不是游戏时间。
  showSelectButton(seconds, showSupportBar = false) {
    const { width, height } = this.scale;
    const BTN_W = 224;
    const BTN_H = 52;

    const container = this.add.container(width / 2, height / 2 + 58).setDepth(46);

    const bg = this.add.graphics();
    const paint = (fill) => {
      bg.clear();
      bg.fillStyle(fill, 1);
      bg.fillRoundedRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, 10);
      bg.lineStyle(2, 0xfde68a, 0.85);
      bg.strokeRoundedRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, 10);
    };
    paint(0x1e293b);

    let remaining = seconds;
    const label = this.add.text(0, 0, '', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '19px',
      fontStyle: 'bold',
      color: '#f8fafc',
    }).setOrigin(0.5);
    const render = () => label.setText(`← 返回选关（${remaining}s）`);
    render();

    const hit = this.add.rectangle(0, 0, BTN_W, BTN_H, 0xffffff, 0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => paint(0x2c3e57));
    hit.on('pointerout', () => paint(0x1e293b));
    hit.on('pointerdown', () => {
      // 点击音自己调 —— 这是画布上的按钮，不是 DOM，
      // main.js 里那个全局 click 监听管不到它。
      playUiClick();
      this.goToSelect();
    });

    container.add([bg, label, hit]);

    // 支持条。摆在返回按钮正下方 —— 结算时玩家刚打完一关，
    // 心情最好、也停得最久，是三个位置里转化率最高的。
    // 放在容器外面单独建：它不该跟着按钮一起被倒计时逻辑影响，
    // 而且按钮宽 224，这条得比它宽才不显得挤。
    if (showSupportBar) {
      this.showSupportBar(width / 2, height / 2 + 58 + BTN_H / 2 + 30);
    }

    this.selectCountdown = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        // 归零就自己回选章界面。先把数字显示成 0，虽然马上就看不见了，
        // 但万一回不去（比如回调没注册），画面上不会留个错的数字。
        remaining = 0;
        render();
        this.goToSelect();
        return;
      }
      render();
    }, 1000);
  }

  // 回选章界面。按钮点击和倒计时归零都走这里，
  // 用 leftLevel 挡住重复触发（两者撞在一起时）。
  goToSelect() {
    if (this.leftLevel) {
      return;
    }
    this.leftLevel = true;
    this.clearSelectCountdown();

    const goToSelect = this.registry.get('onGoToSelect');
    if (this.scene.isActive() && goToSelect) {
      goToSelect();
    }
  }

  clearSelectCountdown() {
    if (this.selectCountdown) {
      window.clearInterval(this.selectCountdown);
      this.selectCountdown = null;
    }
  }

  onLevelFailed() {
    // 只结算一次。同一帧要是有两个敌人一起漏过去，onLeak 会连着调两次，
    // 不挡的话会叠出两个「防线失守」、两个按钮，还会漏掉一个 setInterval
    // （第二个把 this.selectCountdown 覆盖了，第一个再也没人 clear）。
    if (this.settled) {
      return;
    }
    this.settled = true;

    // 统计：记录游戏时间
    if (this.levelStartTime) {
      const elapsed = Math.floor((Date.now() - this.levelStartTime) / 1000);
      addPlayTime(elapsed);
      this.levelStartTime = null;
    }

    // 演练结束，电脑玩家收手。和通关那边同理。
    this.stopAutoPlayer();

    // 已经失守了，退出时不用再警告"进度会丢" —— 没什么可丢的了。
    this.runtime.markSettled();

    // 失守音效。同上，先掐掉别的音效再播这段 7 秒的。
    stopAllSfx(this);
    playSfx(this, 'lose');

    // 和胜利一样往上挪 46px 给按钮腾位置。
    this.showBanner('防线失守', 0xef4444, -46);
    if (this.buildPanel) {
      this.buildPanel.close();
    }
    if (this.waves) {
      this.waves.destroy();
      this.waves = null;
    }

    // 「返回选关」+ 倒计时，和胜利界面同一个按钮。
    //
    // 倒计时比胜利那边长（14s vs 10s）：赢了是"看一眼就走"，
    // 输了得留点时间看清防线是怎么破的、想想下一把怎么摆，
    // 时间太短会像是被系统赶出去。想重打的人本来就会直接开菜单。
    // 失守界面不开赞助条：那会儿玩家正懊恼，弹"请作者喝咖啡"像在要钱。
    this.showSelectButton(14);
  }

  // 通关/失守的大字。offsetY 用来给底下的按钮腾位置。
  showBanner(text, color, offsetY = 0) {
    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, 0x020617, 0.55)
      .setOrigin(0, 0)
      .setDepth(45);
    this.add.text(width / 2, height / 2 + offsetY, text, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '64px',
      fontStyle: 'bold',
      color: Phaser.Display.Color.IntegerToColor(color).rgba,
      // 金色的字在半透明深底上容易发虚，描一层深棕边压住。
      stroke: '#451a03',
      strokeThickness: 6,
    }).setOrigin(0.5).setDepth(46);
  }

  // 标出敌人出生点。位置取路线的第一个点。
  //
  // 有的地图路线起点在画面外（比如第一章向外延伸了两个点），
  // 所以标记要夹到画面内，否则会被裁掉一半看不见。
  markSpawnPoint(path) {
    const first = path[0];
    const x = Phaser.Math.Clamp(first.x, 22, this.scale.width - 120);
    const y = Phaser.Math.Clamp(first.y, 40, this.scale.height - 20);

    const marker = this.add.container(x, y).setDepth(9);

    // 外圈脉冲：单独一个圆用来做扩散动画。
    const pulse = this.add.circle(0, 0, 14, 0xef4444, 0);
    pulse.setStrokeStyle(3, 0xef4444, 1);

    // 实心核心。
    const core = this.add.circle(0, 0, 7, 0xef4444, 1);
    core.setStrokeStyle(2, 0xfef2f2, 0.9);

    // 指向行进方向的箭头，说明敌人从这里往地图内走。
    const arrow = this.add.triangle(30, 0, 0, -9, 0, 9, 14, 0, 0xef4444, 1);

    // 文字默认在标记上方。但第四章的出生点在左上角皇城，
    // 那儿正好压着左上角的提示文字（「点蓝圈建塔」，见 this.label），
    // 两个牌子会叠在一起。这种情况把文字翻到标记下方去。
    //
    // 判定条件写成"左上角一小片区域"而不是精确的包围盒相交：
    // 提示文字的内容会变（倒计时时是别的字），宽度跟着变，
    // 按固定区域判断比按实时宽度判断稳定。
    const nearHint = x < 220 && y < 96;
    const textY = nearHint ? 30 : -30;

    const text = this.add.text(0, textY, '敌人出生点', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#fef2f2',
      backgroundColor: 'rgba(127, 29, 29, 0.85)',
      padding: { x: 7, y: 4 },
    }).setOrigin(0, 0.5);

    marker.add([pulse, core, arrow, text]);

    // 持续扩散的脉冲，让出生点在地图上足够显眼。
    this.tweens.add({
      targets: pulse,
      scale: { from: 1, to: 2.4 },
      alpha: { from: 0.9, to: 0 },
      duration: 1400,
      repeat: -1,
      ease: 'Sine.easeOut',
    });

    this.spawnMarker = marker;
  }

  // 标出防线（敌人的终点），血条画在标记上方。
  //
  // 和出生点同理：有的地图路线终点在画面外（第一章向外延伸了两个点），
  // 所以位置要夹到画面内，还得给血条和文字留出边距，否则会被裁掉。
  markDefenseLine(path) {
    const last = path[path.length - 1];
    const x = Phaser.Math.Clamp(last.x, 60, this.scale.width - 60);
    const y = Phaser.Math.Clamp(last.y, 60, this.scale.height - 46);

    this.defenseLine = new DefenseLine(this, x, y, this.lives);
  }

  // ---------- 自动演练模式的界面 ----------

  // 顶部的模式标牌 + 底部的解说字幕。只有 autoMode 时才建。
  //
  // 标牌是必须有的：不标一下的话，看到塔自己冒出来第一反应是
  // "这游戏坏了"，而不是"这是演示"。
  markAutoMode() {
    const { width, height } = this.scale;

    // 标牌摆在正上方居中偏下一点，压在波次文字（y=12）下面 ——
    // 那一行是关卡信息，不该被这个牌子挤走。
    this.add.text(width / 2, 46, '🤖 自动演练模式', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#c4b5fd',
      backgroundColor: 'rgba(46, 16, 101, 0.82)',
      padding: { x: 10, y: 5 },
    }).setDepth(10).setOrigin(0.5, 0);

    // 解说字幕。贴着底边，因为建塔位大多在画面中上部，
    // 摆在底下不会盖住正在发生的事。
    //
    // 一开始是空字符串而不是"等待中"之类的占位：第一步最多 600 毫秒
    // 就来了，占位文字只会闪一下，反而像出错了。
    this.autoText = this.add.text(width / 2, height - 14, '', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#fde68a',
      backgroundColor: 'rgba(15, 23, 42, 0.85)',
      padding: { x: 12, y: 6 },
      align: 'center',
    }).setDepth(10).setOrigin(0.5, 1);
  }

  // 停掉电脑玩家，并把字幕换成一句总结。
  //
  // 通关和失守都调这里。只停不销毁 —— 场景还活着，
  // 真正的销毁在 shutdown 里。
  stopAutoPlayer() {
    if (!this.autoPlayer) {
      return;
    }
    const steps = this.autoPlayer.actionCount;
    this.autoPlayer.stop();

    if (this.autoText) {
      this.autoText.setText(`🤖 演练结束，一共出手 ${steps} 次`);
    }
  }

  // 标出建塔位并让它们可以点。
  // 位置来自遮罩里蓝色方块的重心（见 src/data/buildSlots.js）。
  markBuildSlots() {
    // 画出来的圈要和遮罩里蓝色石台的实际大小对上。
    // 石台量出来约 60x56 画布像素（遮罩里 97x90，除以 1.6），
    // 所以半径取 28 —— 之前是 20，圈明显比石台小一圈，
    // 点在石台上但圈外面就没反应，看着就像"点了没用"。
    const RADIUS = 28;

    // 命中区比圈大一点，专门给手指留的余量。
    //
    // 画布是等比缩放的（Scale.FIT），手机上会缩小：
    // iPhone SE 横屏（667x375）缩放只有 0.69，半径 28 的圈
    // 在真机上直径只有 39 像素，低于 44 这个触摸目标的经验值。
    // 34 换算过去是 47，过线了。
    //
    // **不能再大**：第四章有两个建塔位只隔 93 画布像素
    // （#6 和 #8，见 src/data/buildSlots.js），命中区超过 46
    // 就会重叠，点两者中间会跳到错的槽位上。34x2=68 < 93，安全。
    //
    // 为什么不把圈也画大：圈是照石台的实际大小画的，画大了会
    // 明显套在石台外面一圈，看着像没对齐。宁可命中区偷偷比看着的大 ——
    // "点歪一点也能中"是好事，玩家不会察觉。
    const HIT_RADIUS = 34;

    this.slotMarkers = this.slots.map((slot, index) => {
      const ring = this.add.circle(slot.x, slot.y, RADIUS)
        .setStrokeStyle(2, 0x60a5fa, 0.55)
        .setDepth(3);

      // Phaser 的 Shape 默认按显示矩形做命中判定，圆形要显式给 hitArea。
      // 注意 hitArea 用的是**局部坐标**（相对显示区域左上角），
      // 显示区域是 RADIUS*2 见方，所以圆心仍然是 (RADIUS, RADIUS)，
      // 只有半径换成 HIT_RADIUS —— 命中区就朝四周各多出 6 像素。
      //
      // 命中区比显示区域大是可行的：Phaser 只调 hitAreaCallback 判断，
      // 不会先用显示包围盒卡一道。
      ring.setInteractive(
        new Phaser.Geom.Circle(RADIUS, RADIUS, HIT_RADIUS),
        Phaser.Geom.Circle.Contains,
      );
      ring.input.cursor = 'pointer';

      ring.on('pointerdown', () => this.onSlotClick(index));

      return ring;
    });
  }

  // 点了某个建塔位：空的就开建造面板，已有塔就开管理面板。
  onSlotClick(index) {
    // 倒计时期间不让操作 —— 那时候还有一层全屏倒计时遮罩压在最上面
    // （depth 50，比面板的 30 高），面板开了也会被它盖住看不见。
    //
    // 暂停时是**允许**建塔的：塔防里停下来从容布阵是很自然的玩法，
    // 而且之前在这里挡掉会让点击完全没反应，看着像坏了。
    if (!this.runtime || !this.runtime.started) {
      return;
    }
    if (!this.towers || !this.buildPanel) {
      return;
    }

    const slot = this.slots[index];
    const tower = this.towers.towerAt(index);

    if (tower) {
      this.buildPanel.openManage(tower);
    } else {
      this.buildPanel.openBuild(index, slot.x, slot.y);
    }
  }

  // 槽位被占用后把圈调暗 —— 塔的立绘已经很显眼了，圈只是辅助。
  refreshSlotMarker(index) {
    const ring = this.slotMarkers && this.slotMarkers[index];
    if (!ring) {
      return;
    }
    const occupied = this.towers && this.towers.towerAt(index) !== null;
    ring.setStrokeStyle(2, 0x60a5fa, occupied ? 0.2 : 0.55);
  }

  // 建造面板里悬停某个武将时，在槽位上画出它的射程。
  // range 传 null 表示收掉预览。
  previewRange(x, y, range) {
    if (this.rangePreview) {
      this.rangePreview.destroy();
      this.rangePreview = null;
    }
    if (range === null || range === undefined) {
      return;
    }
    this.rangePreview = this.add.circle(x, y, range, 0x60a5fa, 0.1)
      .setStrokeStyle(2, 0x60a5fa, 0.7)
      .setDepth(4);
  }

  // 采样遮罩图判断某个画布坐标属于哪种区域。
  getZoneAt(canvasX, canvasY) {
    const x = Math.floor(canvasX * this.maskScaleX);
    const y = Math.floor(canvasY * this.maskScaleY);

    if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) {
      return ZONE_BLOCKED;
    }

    const color = this.textures.getPixel(x, y, this.maskKey);
    if (!color) {
      return ZONE_BLOCKED;
    }

    // 蓝色通道强、红色通道弱 -> 建塔位；红蓝都有一定强度 -> 紫色道路。
    if (color.blue > 128 && color.red < 80) {
      return ZONE_BUILD;
    }
    if (color.red > 80 && color.blue > 80) {
      return ZONE_PATH;
    }
    return ZONE_BLOCKED;
  }

  describe(zone) {
    if (zone === ZONE_BUILD) return '🔵 建塔位';
    if (zone === ZONE_PATH) return '🟣 道路';
    return '⬛ 不可用';
  }
}

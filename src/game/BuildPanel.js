import Phaser from 'phaser';
import { TOWER_TYPES, isMelee, isTowerUnlocked, unlockLabel } from '../data/towers.js';
import { playUiClick } from './sfx.js';

// 点建塔位/点塔之后弹出的面板。画在画布里（Phaser 对象），
// 不用 HTML —— 这样它跟着画布一起缩放，也不用去动 index.html 和 style.css。
//
// 两种形态共用同一套外框和"点外面关闭"的逻辑：
//   建造面板：槽位是空的，列出所有武将让玩家选。
//   管理面板：槽位已有塔，显示数值 + 升级/拆除。
//
// 关闭方式是在面板底下垫一张覆盖全屏的透明背景板（backdrop），
// 点它就关。点面板本身会被面板上层的按钮接住，不会穿透到背景板。
const PANEL_WIDTH = 224;

// 行高 70（原来 62）是给手指定的。
//
// 画布是等比缩放的（Scale.FIT），手机上会缩小 ——
// iPhone SE 横屏（667x375）缩放只有 0.69，62 的行在真机上只有
// 43 像素高，低于 44 这个触摸目标的经验值，选错武将很常见。
// 70 换算过去是 49，过线了。
//
// 上限是画布高度 540：四个武将的面板现在 348 像素（见 openBuild），
// 行高最多能到 116。武将加到 5 个的话上限降到 91。
const ROW_HEIGHT = 70;
const ROW_GAP = 8;
const PADDING = 11;
const TITLE_HEIGHT = 22;

const DEPTH_BACKDROP = 29;
const DEPTH_PANEL = 30;

// 有没有真正的"悬停"。鼠标有，手指没有。
//
// 触摸浏览器会在手指按下时把 pointerover 和 pointerdown 一起发出来，
// 所以射程圈会闪一下就立刻被"建好了"盖掉 —— 没有任何信息量，只是闪。
// 触摸上索性点了直接建，不预览（这是和用户确认过的取舍）。
//
// 只读一次存成常量：这是设备属性，一局游戏里不会变。
// 用 matchMedia 而不是 'ontouchstart' in window —— 后者在带触摸屏的
// 笔记本上也是 true，那种机器插着鼠标，悬停预览该留着。
const HAS_HOVER = window.matchMedia('(hover: hover)').matches;

export class BuildPanel {
  constructor(scene, {
    onBuild, onUpgrade, onDemolish, onPreviewRange, canAfford, refundFor,
    chapterIndex = 0, teacherMode = false,
  } = {}) {
    this.scene = scene;
    this.onBuild = onBuild || (() => {});
    this.onUpgrade = onUpgrade || (() => {});
    this.onDemolish = onDemolish || (() => {});
    this.onPreviewRange = onPreviewRange || (() => {});
    this.canAfford = canAfford || (() => true);
    this.refundFor = refundFor || (() => 0);

    // 当前打第几关（CHAPTERS 的下标），用来判断哪些武将已经解锁。
    // 由 GameScene 传进来 —— 面板自己不去查 registry，
    // 那样它就得知道"关卡是怎么进来的"，管的事太多了。
    this.chapterIndex = chapterIndex;
    this.teacherMode = teacherMode;

    this.container = null;
    this.backdrop = null;
    // 当前面板是给哪个槽位/哪座塔开的。
    this.slotIndex = null;
    this.slotX = 0;
    this.slotY = 0;
    this.tower = null;
  }

  get isOpen() {
    return this.container !== null;
  }

  // ---- 建造面板 ----

  openBuild(slotIndex, x, y) {
    this.close();

    this.slotIndex = slotIndex;
    this.slotX = x;
    this.slotY = y;
    this.tower = null;

    // 没解锁的武将也列出来（灰着、标上「第N章解锁」），不藏起来 ——
    // 让玩家看得见后面还有什么可期待的，也解释了为什么面板上有灰行。
    // 面板高度是按**全部**武将算的，四个就是 348 像素，
    // 占 540 高画布的 64%，放得下。
    //
    // 以后武将超过 5 个（426 像素，占 79%）就该改成翻页或者两列了。
    // 6 个技术上还塞得进去（504 像素）但已经占满画布 93%，
    // 面板一开就把地图整个盖住，看不见敌人走到哪儿了 —— 那不能用。
    // 这个门槛比原来低（原来写的是 6 个），因为行高为了手指从 62 加到了 70。
    const entries = Object.entries(TOWER_TYPES).filter(
      ([, type]) => isTowerUnlocked(type, this.chapterIndex, this.teacherMode)
    );
    const height = PADDING * 2 + TITLE_HEIGHT
      + entries.length * ROW_HEIGHT + Math.max(0, entries.length - 1) * ROW_GAP;

    this.build(x, y, height, '选择武将');

    let rowY = -height / 2 + PADDING + TITLE_HEIGHT;

    entries.forEach(([typeKey, type]) => {
      const stats = type.levels[0];
      const cost = stats.cost;
      const affordable = this.canAfford(cost);
      const kind = isMelee(typeKey) ? '近战' : '远战';

      this.addRow({
        y: rowY,
        thumbKey: type.key,
        thumbRatio: type.contentRatio,
        title: type.name,
        subtitle: `${kind}・${type.weapon}`,
        detail: `伤害 ${stats.damage}   射程 ${stats.range}`,
        cost: `¥${cost}`,
        enabled: affordable,
        note: affordable ? null : '金币不足',
        onHover: HAS_HOVER ? () => this.onPreviewRange(x, y, stats.range) : null,
        onOut: HAS_HOVER ? () => this.onPreviewRange(x, y, null) : null,
        onClick: () => {
          this.onPreviewRange(x, y, null);
          this.onBuild(slotIndex, typeKey);
          this.close();
        },
      });

      rowY += ROW_HEIGHT + ROW_GAP;
    });
  }

  // ---- 管理面板 ----

  openManage(tower) {
    this.close();

    this.tower = tower;
    this.slotIndex = tower.slotIndex;
    this.slotX = tower.container.x;
    this.slotY = tower.container.y;

    const stats = tower.stats;
    const upgradeCost = tower.upgradeCost;
    const refund = this.refundFor(tower);

    // 一行数值 + 两个按钮。
    const height = PADDING * 2 + TITLE_HEIGHT + 34 + ROW_HEIGHT * 0.62 * 2 + ROW_GAP;

    const stars = tower.level > 0 ? ` ${'★'.repeat(tower.level)}` : '';
    this.build(this.slotX, this.slotY, height, `${tower.type.name}${stars}`);

    // 塔自己的射程圈打开面板时显示出来。
    tower.setRangeVisible(true);

    const top = -height / 2 + PADDING + TITLE_HEIGHT;

    this.container.add(this.scene.add.text(-PANEL_WIDTH / 2 + PADDING, top,
      `伤害 ${stats.damage}   射程 ${stats.range}   ${Math.round(1000 / stats.cooldown * 10) / 10} 次/秒`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '12px',
        color: '#cbd5e1',
      }).setOrigin(0, 0));

    const buttonH = ROW_HEIGHT * 0.62;
    let btnY = top + 30 + buttonH / 2;

    // 升级按钮。满级或钱不够就置灰。
    const maxed = tower.isMaxLevel;
    const canUp = !maxed && this.canAfford(upgradeCost);
    this.addButton({
      y: btnY,
      height: buttonH,
      label: maxed ? '已满级' : `▲ 升级  ¥${upgradeCost}`,
      color: 0x1d4ed8,
      enabled: canUp,
      onClick: () => {
        this.onUpgrade(tower);
        // 升完再把面板刷一遍，玩家可以接着升下一级。
        if (tower.container) {
          this.openManage(tower);
        } else {
          this.close();
        }
      },
    });

    btnY += buttonH + ROW_GAP;

    this.addButton({
      y: btnY,
      height: buttonH,
      label: `✕ 拆除  +¥${refund}`,
      color: 0x9f1239,
      enabled: true,
      onClick: () => {
        this.onDemolish(tower);
        this.close();
      },
    });
  }

  // ---- 外框 ----

  // 建面板的壳：全屏背景板 + 定位好的容器 + 底板 + 标题。
  build(slotX, slotY, height, title) {
    const { width: screenW, height: screenH } = this.scene.scale;

    // 覆盖全屏的背景板，点它就关面板。几乎全透明，只压一点暗。
    this.backdrop = this.scene.add.rectangle(0, 0, screenW, screenH, 0x020617, 0.15)
      .setOrigin(0, 0)
      .setDepth(DEPTH_BACKDROP)
      .setInteractive();
    this.backdrop.on('pointerdown', () => this.close());

    // 默认摆在槽位上方；上方放不下就翻到下方。
    // 无论如何都夹到画面内 —— 靠边和靠上的槽位不夹住就会被裁掉。
    const half = height / 2;
    const MARGIN = 8;
    const SLOT_OFFSET = 30;

    // 先尝试放在槽位上方
    let y = slotY - SLOT_OFFSET - half;
    let placedAbove = true;

    // 如果上方放不下（面板顶部超出屏幕），改放下方
    if (y - half < MARGIN) {
      y = slotY + SLOT_OFFSET + half;
      placedAbove = false;
    }

    // 如果下方也放不下（面板底部超出屏幕），强制夹到屏幕内
    if (y + half > screenH - MARGIN) {
      y = screenH - half - MARGIN;
    }
    if (y - half < MARGIN) {
      y = half + MARGIN;
    }

    const x = Phaser.Math.Clamp(slotX, PANEL_WIDTH / 2 + MARGIN, screenW - PANEL_WIDTH / 2 - MARGIN);

    this.container = this.scene.add.container(x, y).setDepth(DEPTH_PANEL);

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x0f172a, 0.94);
    bg.fillRoundedRect(-PANEL_WIDTH / 2, -half, PANEL_WIDTH, height, 10);
    bg.lineStyle(2, 0x60a5fa, 0.75);
    bg.strokeRoundedRect(-PANEL_WIDTH / 2, -half, PANEL_WIDTH, height, 10);
    this.container.add(bg);

    // 挡住面板底板的点击。
    //
    // Phaser 的 topOnly 默认是 true，只有最上面那个可交互对象会收到事件，
    // 而容器的子对象在 renderList 里比背景板靠后（更上层），
    // 所以有了这块挡板，点面板空白处就不会穿透到背景板把面板关掉了。
    const block = this.scene.add.rectangle(0, 0, PANEL_WIDTH, height, 0xffffff, 0)
      .setInteractive();
    this.container.add(block);

    this.container.add(this.scene.add.text(0, -half + PADDING, title, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#f8fafc',
    }).setOrigin(0.5, 0));

    // 弹出动画。
    //
    // 暂停时不能用 tween：TweenManager.paused 为 true 时连**新建的** tween
    // 也不会更新（见 TweenManager.js 的 update()），面板会卡在 alpha 0
    // 上完全看不见。所以暂停中直接摆成最终状态。
    if (this.scene.tweens.paused) {
      this.container.setScale(1);
      this.container.setAlpha(1);
    } else {
      this.container.setScale(0.85);
      this.container.setAlpha(0);
      this.scene.tweens.add({
        targets: this.container,
        scale: 1,
        alpha: 1,
        duration: 150,
        ease: 'Back.easeOut',
      });
    }
  }

  // 建造面板里的一行：立绘缩略图 + 名字 + 说明 + 造价。
  //
  // note 是灰行右下角那句解释（「金币不足」/「第一章解锁」），
  // enabled 为 false 时才有意义。alpha 不传就按 enabled 取默认值。
  addRow({
    y, thumbKey, thumbRatio, title, subtitle, detail, cost, enabled,
    note, alpha, onHover, onOut, onClick,
  }) {
    const rowW = PANEL_WIDTH - PADDING * 2;
    const left = -rowW / 2;

    const row = this.scene.add.container(0, y + ROW_HEIGHT / 2);

    const bg = this.scene.add.graphics();
    bg.fillStyle(enabled ? 0x1e293b : 0x172033, 1);
    bg.fillRoundedRect(left, -ROW_HEIGHT / 2, rowW, ROW_HEIGHT, 8);
    row.add(bg);

    // 立绘缩略图。按人物实际高度归一化（同 Tower/Enemy 的 contentRatio 做法），
    // 所以长柄武将会比短兵武将宽一些，那是应该的。
    //
    // 行高从 62 加到 70 之后缩略图跟着变大（图高 58，宽也约 58~66），
    // 所以中心从 left+30 挪到 left+33、文字起点从 left+58 挪到 left+64 ——
    // 不挪的话最宽的那张（时迁，contentRatio 0.94）会压到名字上。
    const figureH = ROW_HEIGHT - 12;
    const thumb = this.scene.add.image(left + 33, ROW_HEIGHT / 2 - 6, thumbKey)
      .setOrigin(0.5, 1);
    thumb.setScale((figureH / thumbRatio) / thumb.height);
    row.add(thumb);

    // 三行文字在行内的纵向分布。行高加了 8 像素，这 8 像素摊给行距和上下留白，
    // 不是全塞给某一行 —— 挤在一头会让行看着上下不平衡。
    const textLeft = left + 64;
    row.add(this.scene.add.text(textLeft, -ROW_HEIGHT / 2 + 9, title, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#f8fafc',
    }).setOrigin(0, 0));

    row.add(this.scene.add.text(textLeft, -ROW_HEIGHT / 2 + 28, subtitle, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '11px',
      color: '#94a3b8',
    }).setOrigin(0, 0));

    row.add(this.scene.add.text(textLeft, -ROW_HEIGHT / 2 + 46, detail, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '11px',
      color: '#cbd5e1',
    }).setOrigin(0, 0));

    // 造价和名字齐平（同一个 y 偏移），这样左右两头是一条线上的。
    row.add(this.scene.add.text(left + rowW - 8, -ROW_HEIGHT / 2 + 9, cost, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '13px',
      fontStyle: 'bold',
      color: enabled ? '#fbbf24' : '#64748b',
    }).setOrigin(1, 0));

    if (!enabled) {
      if (note) {
        row.add(this.scene.add.text(left + rowW - 8, ROW_HEIGHT / 2 - 8, note, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '11px',
          color: '#f87171',
        }).setOrigin(1, 1));
      }
      row.setAlpha(alpha === undefined ? 0.5 : alpha);
    }

    // 点击热区。Phaser 的形状默认按显示矩形做命中判定，
    // 这里本来就是矩形，所以直接 setInteractive() 即可。
    const hit = this.scene.add.rectangle(0, 0, rowW, ROW_HEIGHT, 0xffffff, 0);
    row.add(hit);

    if (enabled) {
      hit.setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => {
        bg.clear();
        bg.fillStyle(0x2c3e57, 1);
        bg.fillRoundedRect(left, -ROW_HEIGHT / 2, rowW, ROW_HEIGHT, 8);
        if (onHover) onHover();
      });
      hit.on('pointerout', () => {
        bg.clear();
        bg.fillStyle(0x1e293b, 1);
        bg.fillRoundedRect(left, -ROW_HEIGHT / 2, rowW, ROW_HEIGHT, 8);
        if (onOut) onOut();
      });
      // 点击音。画布上的按钮不是 DOM，main.js 那个全局监听管不到它们，
      // 所以这里要自己调一次。禁用的行（金币不足）走不到这儿，正好。
      hit.on('pointerdown', () => {
        playUiClick();
        onClick();
      });
    }

    this.container.add(row);
    return row;
  }

  // 管理面板里的按钮。
  addButton({ y, height, label, color, enabled, onClick }) {
    const rowW = PANEL_WIDTH - PADDING * 2;
    const left = -rowW / 2;

    const button = this.scene.add.container(0, y);

    const bg = this.scene.add.graphics();
    bg.fillStyle(enabled ? color : 0x334155, 1);
    bg.fillRoundedRect(left, -height / 2, rowW, height, 7);
    button.add(bg);

    button.add(this.scene.add.text(0, 0, label, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '13px',
      fontStyle: 'bold',
      color: enabled ? '#f8fafc' : '#94a3b8',
    }).setOrigin(0.5, 0.5));

    const hit = this.scene.add.rectangle(0, 0, rowW, height, 0xffffff, 0);
    button.add(hit);

    if (enabled) {
      hit.setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        playUiClick();
        onClick();
      });
    } else {
      button.setAlpha(0.6);
    }

    this.container.add(button);
    return button;
  }

  close() {
    // 关面板时把射程预览和塔的射程圈都收掉。
    this.onPreviewRange(this.slotX, this.slotY, null);
    if (this.tower && this.tower.container) {
      this.tower.setRangeVisible(false);
    }

    if (this.container) {
      this.container.destroy();
      this.container = null;
    }
    if (this.backdrop) {
      this.backdrop.destroy();
      this.backdrop = null;
    }

    this.slotIndex = null;
    this.tower = null;
  }

  destroy() {
    this.close();
  }
}

import Phaser from 'phaser';
import { isThumbnails } from '../state/settings.js';

// 原图
import mapUrl from '../../assets/art/ice_map.png';
import maskUrl from '../../assets/art/ice_map_mask.png';
import map1Url from '../../assets/art/ice_map1.png';
import mask1Url from '../../assets/art/ice_map_mask1.png';
import map2Url from '../../assets/art/ice_map2.png';
import mask2Url from '../../assets/art/ice_map_mask2.png';
import map3Url from '../../assets/art/ice_map3.png';
import mask3Url from '../../assets/art/ice_map_mask3.png';
import map4Url from '../../assets/art/ice_map4.png';
import mask4Url from '../../assets/art/ice_map_mask4.png';
import tufeiUrl from '../../assets/art/enemies/tufei.png';
import gunmuUrl from '../../assets/art/enemies/gunmu.png';
import zhongjiaUrl from '../../assets/art/enemies/zhongjia_1.png';
import kuaichuanUrl from '../../assets/art/enemies/kuaichuan_2.png';
import huogongchuanUrl from '../../assets/art/enemies/huogongchuan_2.png';
import bingUrl from '../../assets/art/enemies/bing_3.png';
import xintuUrl from '../../assets/art/enemies/xintu_3.png';
import dijiangUrl from '../../assets/art/enemies/bing_4.png';
import linchongJinUrl from '../../assets/art/towers/linchong_jin.png';
import wusongJinUrl from '../../assets/art/towers/wusong_jin.png';
import huarongYuanUrl from '../../assets/art/towers/huarong_yuan_1.png';
import shiqianJinUrl from '../../assets/art/towers/shiqian_jin_2.png';

// 缩略图（可选）。
//
// 这里**不能**用 new URL(path, import.meta.url)：它对不存在的文件不抛异常，
// Vite 只在构建时告警一句就把裸路径原样留到运行时 —— 于是 dist 里根本没有
// 这些文件，请求全落到 SPA 兜底的 index.html 上，图片解码失败，
// 敌人和武将会在画面里全部隐形。原来那个 try/catch 兜底因此永远不触发。
//
// import.meta.glob 只收集真实存在的文件：目录是空的就返回 {}，
// 下面的 pick() 自动回退原图；哪天真跑了 scripts/generate-thumbnails.js
// 生成出缩略图，这里会自动打包进来，不用再改代码。
const thumbUrls = Object.fromEntries(
  Object.entries(
    import.meta.glob('../../assets/art/thumbnails/**/*.png', {
      eager: true,
      query: '?url',
      import: 'default',
    }),
  ).map(([path, url]) => [path.replace(/^.*thumbnails\//, ''), url]),
);

// 'enemies/tufei.png' -> 缩略图地址；文件不存在就返回 null（回退原图）
const thumbUrl = (rel) => thumbUrls[rel] || null;
import killSfxUrl from '../../assets/audio/defen.mp3';
import pauseSfxUrl from '../../assets/audio/zanting.mp3';
import winSfxUrl from '../../assets/audio/win.mp3';
import loseSfxUrl from '../../assets/audio/lost.mp3';
import hitSfxUrl from '../../assets/audio/hit.mp3';
import countdownSfxUrl from '../../assets/audio/daojishi.mp3';
import bgmUrl from '../../assets/audio/beijingyin.wav';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    // 简单的加载进度条：五张底图各 2.4MB 上下，加载时给一点反馈。
    const { width, height } = this.scale;
    const barWidth = width * 0.5;
    const barX = (width - barWidth) / 2;

    const border = this.add.rectangle(width / 2, height / 2, barWidth + 6, 26)
      .setStrokeStyle(2, 0x67e8f9);
    const fill = this.add.rectangle(barX + 3, height / 2, 0, 18, 0x67e8f9)
      .setOrigin(0, 0.5);

    this.load.on('progress', (value) => {
      fill.width = (barWidth) * value;
    });

    this.load.on('complete', () => {
      border.destroy();
      fill.destroy();
    });

    // 地图。key 要和 src/data/levels.js 里的 mapKey/maskKey 对上。
    // 五张底图各 2.4MB 上下，遮罩很小（10KB 以内，只有三种纯色）。
    this.load.image('map', mapUrl);
    this.load.image('mapMask', maskUrl);
    this.load.image('map1', map1Url);
    this.load.image('mapMask1', mask1Url);
    this.load.image('map2', map2Url);
    this.load.image('mapMask2', mask2Url);
    this.load.image('map3', map3Url);
    this.load.image('mapMask3', mask3Url);
    this.load.image('map4', map4Url);
    this.load.image('mapMask4', mask4Url);

    // 敌人立绘。key 要和 src/data/enemies.js 里的 key 对上。
    //
    // 文件名后面的数字是"第几章新加的"（zhongjia_1 = 第一章的重甲步兵），
    // 只是给美术对齐用的，load 的 key 里不带 —— 同一个兵以后
    // 在别的章节复用也不用改 key。
    const useThumbnails = isThumbnails();
    // pick(缩略图相对路径, 原图)：开关关着、或者这个缩略图文件压根不存在，
    // 两种情况都落到原图上，不会去请求一个 404。
    const pick = (rel, original) => (useThumbnails && thumbUrl(rel)) || original;
    this.load.image('enemy_tufei', pick('enemies/tufei.png', tufeiUrl));
    this.load.image('enemy_gunmu', pick('enemies/gunmu.png', gunmuUrl));
    this.load.image('enemy_zhongjia', pick('enemies/zhongjia_1.png', zhongjiaUrl));
    this.load.image('enemy_kuaichuan', pick('enemies/kuaichuan_2.png', kuaichuanUrl));
    this.load.image('enemy_huogongchuan', pick('enemies/huogongchuan_2.png', huogongchuanUrl));
    this.load.image('enemy_bing', pick('enemies/bing_3.png', bingUrl));
    this.load.image('enemy_xintu', pick('enemies/xintu_3.png', xintuUrl));
    // bing_4.png 是第四章的敌将。key 用 dijiang 而不是 bing4 ——
    // 它和第三章那个 bing 是完全不同的兵种（血是它两倍多），
    // key 里带章节号会让人以为是同一个兵的强化版。
    this.load.image('enemy_dijiang', pick('enemies/bing_4.png', dijiangUrl));

    // 武将（炮塔）立绘。key 要和 src/data/towers.js 里的 key 对上。
    //
    // 文件名是 `人物名_远或近战_第几章解锁`（huarong_yuan_1 = 花荣、远战、第一章）。
    // key 里带 jin/yuan（代码要靠它判断近战还是远战，见 towers.js 的 isMelee），
    // 但**不带章节号** —— 那个走 towers.js 的 unlockAt 字段，
    // 以后调整解锁章节不用连着改这里的 key。
    this.load.image('tower_linchong_jin', pick('towers/linchong_jin.png', linchongJinUrl));
    this.load.image('tower_wusong_jin', pick('towers/wusong_jin.png', wusongJinUrl));
    this.load.image('tower_huarong_yuan', pick('towers/huarong_yuan_1.png', huarongYuanUrl));
    this.load.image('tower_shiqian_jin', pick('towers/shiqian_jin_2.png', shiqianJinUrl));

    // 音效。key 要和 src/game/sfx.js 里的 key 对上。
    // 文件名是拼音，这里换成英文 key，免得播的时候还要想 defen 是"得分"还是"防线"。
    //
    // button.mp3（按钮点击音）不在这里 —— 它要在 Phaser 实例还没建起来的
    // 开始界面上就能响，所以走原生 Audio，见 sfx.js 的 playUiClick。
    this.load.audio('sfx_kill', killSfxUrl);      // defen.mp3      击杀得金币
    this.load.audio('sfx_hit', hitSfxUrl);        // hit.mp3        塔命中敌人
    this.load.audio('sfx_countdown', countdownSfxUrl); // daojishi.mp3 开始前 3、2、1
    this.load.audio('sfx_pause', pauseSfxUrl);    // zanting.mp3    暂停
    this.load.audio('sfx_win', winSfxUrl);        // win.mp3        通关
    this.load.audio('sfx_lose', loseSfxUrl);      // lost.mp3       失守
    this.load.audio('sfx_bgm', bgmUrl);           // beijingyin.wav 关卡背景音乐（30 秒循环）
  }

  create() {
    this.scene.start('GameScene');
  }
}

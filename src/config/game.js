import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene.js';
import { GameScene } from '../scenes/GameScene.js';

// 画布使用地图底图的 16:9 比例（1536x864 的一半），底图可以完整铺满不变形。
export const MAP_WIDTH = 1536;
export const MAP_HEIGHT = 864;

export const gameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 960,
  height: 540,
  backgroundColor: '#111827',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, GameScene],
};

// 缩略图生成脚本
// 运行: node scripts/generate-thumbnails.js
// 需要安装: npm install sharp

import { readdir } from 'fs/promises';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');

const SIZES = {
  enemies: 128,
  towers: 128,
  maps: 480,
};

async function generateThumbnails() {
  try {
    const sharp = (await import('sharp')).default;

    // 处理敌人图片
    const enemiesDir = join(ROOT, 'assets/art/enemies');
    const enemiesThumbDir = join(ROOT, 'assets/art/thumbnails/enemies');
    const enemyFiles = (await readdir(enemiesDir)).filter(f => extname(f) === '.png');

    for (const file of enemyFiles) {
      const input = join(enemiesDir, file);
      const output = join(enemiesThumbDir, file);
      await sharp(input)
        .resize(SIZES.enemies, SIZES.enemies, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(output);
      console.log(`✓ ${file}`);
    }

    // 处理英雄图片
    const towersDir = join(ROOT, 'assets/art/towers');
    const towersThumbDir = join(ROOT, 'assets/art/thumbnails/towers');
    const towerFiles = (await readdir(towersDir)).filter(f => extname(f) === '.png');

    for (const file of towerFiles) {
      const input = join(towersDir, file);
      const output = join(towersThumbDir, file);
      await sharp(input)
        .resize(SIZES.towers, SIZES.towers, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(output);
      console.log(`✓ ${file}`);
    }

    console.log('\n缩略图生成完成！');
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND') {
      console.error('请先安装 sharp: npm install sharp');
    } else {
      console.error('生成缩略图时出错:', error);
    }
  }
}

generateThumbnails();

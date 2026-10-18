import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// 多页构建：游戏首页 + 公告管理页。
// gonggao/index.html 走的是**自己的入口**，不 import main.js，
// 所以后台页面不会把 Phaser（1.5 MB）一起拉进去。
//
// base 仍然是 './' —— 每个 HTML 会拿到按自己所在目录换算过的相对路径
// （dist/index.html 用 ./assets/，dist/gonggao/index.html 用 ../assets/），
// 这样 dist 无论丢在域名根、子目录还是本地直接开，都能跑。
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        gonggao: fileURLToPath(new URL('./gonggao/index.html', import.meta.url)),
      },
    },
  },
});

#!/usr/bin/env node
// 生成公告功能要用的两串值，直接粘进 src/data/noticeConfig.js。
//
//   生成密码哈希：
//     node scripts/notice-secret.js hash "你的发布密码"
//
//   编码发布令牌（classic 令牌，只勾 gist，30 天过期）：
//     node scripts/notice-secret.js token "ghp_一长串"
//
// 为什么不让页面自己算密码哈希就完事：那样明文密码必须先出现在
// 某个地方。这里在你自己的电脑上算，算完只留下哈希，明文不进代码库。
//
// 为什么令牌要"编码"而不是明文贴：混淆不是加密 —— 它只是把
// 「右键查看源码就能偷走」抬高到「要专门跑个脚本才能偷走」。
// 真正的安全边界仍然是令牌本身的 scope：**只勾 gist、不勾 repo**，
// 这样万一泄露，别人也碰不到你的游戏仓库。
//
// 令牌 30 天会过期，到时候重新生成一条，重新跑一次本脚本、重新粘贴。

import { createHash } from 'node:crypto';

const XOR_KEY = 'dasong-notice-gonggao-2026'; // 必须和 noticeConfig.js 里的一致

function usage(code) {
  const lines = [
    '用法：',
    '  node scripts/notice-secret.js hash "<发布密码>"',
    '  node scripts/notice-secret.js token "<ghp_ 开头的令牌>"',
    '',
    '生成后把输出的那一行粘进 src/data/noticeConfig.js 对应的空位。',
  ];
  if (code === 0) console.log(lines.join('\n'));
  else console.error(lines.join('\n'));
  process.exit(code);
}

const [mode, value] = process.argv.slice(2);

if (!mode || !value) usage(mode ? 1 : 0);
if (!['hash', 'token'].includes(mode)) {
  console.error(`不认识的命令：${mode}\n`);
  usage(1);
}

if (mode === 'hash') {
  const digest = createHash('sha256').update(value, 'utf8').digest('hex');
  console.log('粘进 noticeConfig.js 的 NOTICE_PASSWORD_HASH：\n');
  console.log(`export const NOTICE_PASSWORD_HASH = '${digest}';`);
  console.log('\n（注意：明文密码请自己记好，这里不会也留不下明文）');
} else {
  // 和 decodeNoticeToken() 严格对称：逐字节 XOR，再 base64。
  const encoded = Buffer.from(
    Array.from(value, (ch, i) =>
      String.fromCharCode(ch.charCodeAt(0) ^ XOR_KEY.charCodeAt(i % XOR_KEY.length)),
    ).join(''),
    'binary',
  ).toString('base64');

  console.log('粘进 noticeConfig.js 的 NOTICE_TOKEN_ENC：\n');
  console.log(`export const NOTICE_TOKEN_ENC = '${encoded}';`);
  console.log('\n令牌只勾了 gist 吗？没勾 repo 的话，泄露了也碰不到游戏仓库。');
}

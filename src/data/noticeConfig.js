// 公告：Gist 配置
//
// 所有需要填的东西都在这一个文件里，改完 npm run build 就生效。
//
// 要你手动填三样（我拿不到你的 GitHub 权限）：
//   1. GIST_USER / GIST_ID —— 你建的**公开** Gist 的用户名和 ID
//      （地址栏长这样：https://gist.github.com/<GIST_USER>/<GIST_ID>）
//      私有的不行：玩家读公告时没有令牌，私有 Gist 会直接 404。
//   2. NOTICE_PASSWORD_HASH —— 公告密码的 SHA-256
//   3. NOTICE_TOKEN_ENC     —— classic 令牌（**只勾 gist**），混淆后填进来
//      后两项用 scripts/notice-secret.js 生成，别自己手算。
//
// ------------------------------------------------------------------
// 安全边界，先说清楚，免得误以为页面上那个密码是铁门：
//
//   · **令牌才是真正的锁。** 所有写入都靠它，GitHub 只认令牌，
//     不认你页面上输的密码。
//   · 令牌经过混淆打包进前端 —— **混淆不是加密**，它只是把门槛从
//     「右键查看源码」抬到「跑个脚本」，挡不住认真的人。
//   · 页面上的密码是**纸门**，只挡「不知道密码的人顺手改」。
//   · 所以建令牌时**只勾 gist 一项、不勾 repo**：万一令牌泄露，
//     最坏结果是你的 Gist 被改，游戏仓库、代码、Netlify 全都碰不到。
//   · **Expiration 记得选 30 天**，到期换一个，泄露了也活不长。
//   · 密码和令牌**绝不写进 Gist** —— 那个文件全世界都读得到。
// ------------------------------------------------------------------

export const GIST_USER = '';
export const GIST_ID = '';
export const GIST_FILE = 'notices.json';

export const NOTICE_PASSWORD_HASH = '';
export const NOTICE_TOKEN_ENC = '';

// 混淆用的密钥。再次强调：这是混淆，不是加密。
const XOR_KEY = 'dasong-notice-gonggao-2026';

// 把混进前端的令牌还原成能用的明文。
// 只有 src/ 里这段和 scripts/notice-secret.js 知道怎么编解码。
export function decodeNoticeToken() {
  if (!NOTICE_TOKEN_ENC) return '';
  try {
    const bin = atob(NOTICE_TOKEN_ENC);
    let out = '';
    for (let i = 0; i < bin.length; i += 1) {
      out += String.fromCharCode(bin.charCodeAt(i) ^ XOR_KEY.charCodeAt(i % XOR_KEY.length));
    }
    return out;
  } catch {
    return '';
  }
}

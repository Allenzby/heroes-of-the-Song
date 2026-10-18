// 访客计数：全站累计，走 countapi.xyz 的继任服务。
//
// 原版 countapi.xyz 在 2026 年 5 月前后无预警关停了 —— 没有公告、没有
// 迁移说明，直接一个死链接。从那天起这里请求的就是一个死域名：每次打开
// 白等接口超时，控制台留一条红错，而徽章上显示的其实早就是 localStorage
// 兜底出来的**本机**数字 —— 数字在骗人，名字还写着「浏览次数」。
//
// 现在换成它的继任者（免注册、免 key、一个 GET 就有数），API 形状和原版
// 基本一致，只是没有 namespace 了，原来的 namespace + key 合成一个字符串。
//
// 两点经验教训，都是这次实测踩出来的：
//   1. 这服务延迟不稳，测了三次：1.1s / >3s / 1.3s。所以超时给到 6s，
//      而且要把**上一次成功的数字**缓存在本地先垫上 —— 否则网络一慢，
//      徽章就干脆不出现，等于白接这个接口。
//   2. 用 AbortController 主动 abort **不会**在控制台留红错（浏览器只给
//      真正失败的请求打错误），所以超时是最干净的失败方式。
//
// 超时 / 失败 / 服务又挂了，一律返回 null：调用方据此保持徽章现状
// （有垫底数字就继续显示，没有就一直藏着）。宁可让角落空着，
// 也不要显示一个错的数。
//
// 剩下的风险说清楚，别以后被吓到：服务彻底挂掉（连不上、DNS 解析失败、
// 跨域被拒）时，浏览器会往控制台打一条红色的 "Failed to load resource" ——
// 这是浏览器对失败请求的默认行为，try/catch 挡不住，页面 JS 没有办法消掉。
// 免费计数服务说没就没（countapi 本身就是前车之鉴），接它就等于认了这个风险。
const API_URL = 'https://countapi.mileshilliard.com/api/v1/hit/dasong-visits';

// 10 秒没回来就放弃。给这么宽是因为**显示并不依赖它** —— 有缓存先垫着，
// 这里只负责「顺手更新一下」，慢就慢点，超时是静默的，不影响画面。
// 短超时的唯一好处是限流时请求早点断，但断了这局也就没得更新了。
const TIMEOUT_MS = 10000;

// 上一次成功取回的全站数字（本设备缓存）。
// 另开一个 key，不要复用旧的 `song-heroes-visits` —— 那个存的是**本机**
// 访问次数，语义完全不同，混进来等于又拿本机数冒充全站数。
const CACHE_KEY = 'song-heroes-visits-total';

// 上一次成功拿到的全站累计数；这台设备从没拿到过则返回 null。
export function cachedVisitorCount() {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    const n = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    // localStorage 被禁用（隐私模式 / 站点数据清过）—— 当没有缓存
    return null;
  }
}

// 成功返回全站累计访问次数；超时或任何失败返回 null。
export async function hitVisitorCount() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(API_URL, { signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data.value === 'number') {
          try {
            window.localStorage.setItem(CACHE_KEY, String(data.value));
          } catch {
            // 存不下也无所谓，这次照样能显示
          }
          return data.value;
        }
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // 超时、断网、跨域被拒、服务挂了 —— 一律当没拿到
  }
  return null;
}

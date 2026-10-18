// 强制横屏显示。
//
// ---- 要解决什么 ----
//
// 竖屏提示里那个"已经横过来了 · 直接进入"按钮，原来点完就直接进游戏了，
// 于是**竖着**显示 —— 手机开了旋转锁定的人只能竖着看一张横向地图，
// 建塔位挤成一排。
//
// 现在改成：点完之后把整个界面**转 90 度**摆着。屏幕锁不锁都一样是横的，
// 玩家自然会把手机转过来看。等于用画面本身代替那句"请横过来"。
//
// ---- 为什么要给 Phaser 打补丁 ----
//
// 光加一句 CSS transform: rotate(90deg) 是不够的：画面转过来了，
// **点击会全部错位**。原因是 Phaser 把手指坐标换算成游戏坐标时用的是
// canvas.getBoundingClientRect()（见 ScaleManager 的 transformX/transformY），
// 而 gBCR 对一个被 CSS 旋转过的元素返回的是它的**外接正矩形** ——
// 宽高是调换的，左上角也不是画布真正的左上角。
//
// 同样的原因，Phaser 量父容器尺寸（getParentBounds）时也会拿到调换后的
// 宽高，于是 FIT 缩放会算错，画布会缩得很小。
//
// 所以这里补两个地方：
//   1. getParentBounds —— 把宽高换回来，FIT 才算得对。
//   2. transformPointer —— 自己做一遍反向旋转，点击才落对位置。
//
// 补的是**实例**上的方法，不是 Phaser 的原型：只影响这一个 game 对象，
// 而且不旋转的时候原封不动走原来的逻辑。
//
// ---- 坐标换算是怎么推的 ----
//
// CSS 那边写的是 `transform: rotate(90deg) translateY(-100%)`，原点左上角。
// 变换是从右往左作用到点上的，所以容器里的点 (cx, cy) 先平移再旋转：
//
//   (cx, cy) --translateY(-H)--> (cx, cy - H) --rotate90--> (H - cy, cx)
//
// H 是容器高度，等于视口宽度 innerWidth。所以视口坐标：
//
//   vx = innerWidth - cy        cx = vy
//   vy = cx               反解  cy = innerWidth - vx
//
// 画布在容器里占 x∈[cx0,cx1]、y∈[cy0,cy1]，映到视口就是
// 上边界 top=cx0、下边界 bottom=cx1、左边界 left=innerWidth-cy1、
// 右边界 right=innerWidth-cy0。也就是说 gBCR 给的那个外接矩形里：
//
//   bounds.y      == cx0        bounds.height == 画布在容器里的**宽**
//   bounds.right  == innerWidth - cy0
//   bounds.width  == 画布在容器里的**高**
//
// 于是（gw/gh 是游戏逻辑尺寸 960/540）：
//
//   game_x = (pageY - bounds.y)     * gw / bounds.height
//   game_y = (bounds.right - pageX) * gh / bounds.width
//
// 注意 innerWidth 在最后**约掉了**，所以这两个式子里不出现它 ——
// 这也是为什么不用担心地址栏收放导致 innerWidth 变化时算错。

const CLASS = 'is-forced-landscape';

let game = null;

// 记住上一次的状态，避免每次 resize 都白白 refresh 一遍 Phaser。
let active = false;

export function isForcedLandscape() {
  return active;
}

// 把整个界面转过来 / 转回去。
//
// 真正的开关是 body 上那个 class（CSS 靠它旋转），这里同时把
// Phaser 的尺寸重算一次 —— 容器的宽高刚刚对调了，不重算画布还是旧尺寸。
export function setForcedLandscape(on) {
  if (on === active) {
    return;
  }
  active = on;
  document.body.classList.toggle(CLASS, on);

  if (!game) {
    return;
  }
  // 顺序不能反：先重新量父容器，再 refresh 应用。
  // 和 main.js 里 launchGame 从 display:none 恢复时是同一个套路。
  game.scale.getParentBounds();
  game.scale.refresh();
}

export function attachForcedLandscape(phaserGame) {
  game = phaserGame;

  const scale = game.scale;
  const input = game.input;

  // ---- 补丁 1：父容器尺寸 ----
  const originalGetParentBounds = scale.getParentBounds.bind(scale);

  scale.getParentBounds = function patchedGetParentBounds() {
    if (!active) {
      return originalGetParentBounds();
    }

    const rect = scale.parent.getBoundingClientRect();

    // 外接矩形的宽高是调换的，换回来才是容器在"转正之后"的真实尺寸。
    const width = rect.height;
    const height = rect.width;

    const parentSize = scale.parentSize;
    if (parentSize.width !== width || parentSize.height !== height) {
      parentSize.setSize(width, height);
      return true;
    }
    return false;
  };

  // ---- 补丁 2：手指坐标 ----
  //
  // 挂在 transformPointer 而**不是** transformX/transformY 上：
  // 转了 90 度之后 game_x 要用 pageY 算、game_y 要用 pageX 算，
  // 而那两个函数一次只拿到一个坐标，压根算不出来。
  // transformPointer 是同时拿到 pageX 和 pageY 的那一层。
  const originalTransformPointer = input.transformPointer.bind(input);

  input.transformPointer = function patchedTransformPointer(pointer, pageX, pageY, wasMove) {
    if (!active) {
      originalTransformPointer(pointer, pageX, pageY, wasMove);
      return;
    }

    const bounds = scale.canvasBounds;

    // 画布还没量过（宽或高为 0）时别算，会除出 Infinity 然后
    // 把 pointer 的坐标弄成 NaN —— 那之后所有点击都失效，很难查。
    if (!bounds.width || !bounds.height) {
      originalTransformPointer(pointer, pageX, pageY, wasMove);
      return;
    }

    const position = pointer.position;
    const prev = pointer.prevPosition;

    // 和 Phaser 原版一样：先把上一帧的位置存起来。
    prev.x = position.x;
    prev.y = position.y;

    // 反向旋转。推导见文件开头。
    const x = (pageY - bounds.y) * (scale.baseSize.width / bounds.height);
    const y = (bounds.right - pageX) * (scale.baseSize.height / bounds.width);

    // 平滑也照搬原版，否则拖动的手感和不旋转时不一样。
    const smooth = pointer.smoothFactor;
    if (!wasMove || smooth === 0) {
      position.x = x;
      position.y = y;
    } else {
      position.x = x * smooth + prev.x * (1 - smooth);
      position.y = y * smooth + prev.y * (1 - smooth);
    }
  };
}

import Phaser from 'phaser';

// 击杀敌人时在尸体上冒出来的 "+10" 金币飘字。
//
// 单独一个模块而不是塞进 Enemy 或 TowerManager：这是"拿到奖励"的表现，
// 和谁被打死、钱记在哪没关系 —— 以后拆塔返还、关卡结算想用同一个效果，
// 直接调这个函数就行。
//
// 动画全部用 tween，所以暂停和倍速自动生效
// （LevelRuntime 接管了 scene.tweens 的 timeScale 和 paused，
//  见 LevelRuntime.js 里的说明）。
// 深度 12：压在敌人和塔（5 起）上面，但在建造面板（30）和横幅（45）下面。
const DEPTH = 12;

export function showGoldGain(scene, x, y, amount) {
  // 暂停时不弹。
  //
  // TweenManager.paused 为 true 时连**新建的** tween 也不会更新，
  // 飘字会卡在屏幕上永远不消失。正常玩其实走不到这儿
  // （暂停时塔不开火，也就打不死人），这里只是兜底。
  if (!scene || !scene.tweens || scene.tweens.paused) {
    return;
  }

  // 同一个地方连着死好几个的话，飘字会叠在一起看不清，
  // 所以左右随机错开一点。
  const offsetX = Phaser.Math.Between(-10, 10);
  const container = scene.add.container(x + offsetX, y).setDepth(DEPTH);

  // 铜钱：外圈金色，中间挖一个深色方孔 —— 宋代的钱就是这个样子。
  const coin = scene.add.circle(-14, 0, 8, 0xfbbf24, 1)
    .setStrokeStyle(2, 0x92400e, 1);
  const hole = scene.add.rectangle(-14, 0, 5, 5, 0x92400e, 1);

  const text = scene.add.text(0, 0, `+${amount}`, {
    fontFamily: 'system-ui, sans-serif',
    fontSize: '18px',
    fontStyle: 'bold',
    color: '#fde68a',
    stroke: '#78350f',
    strokeThickness: 4,
  }).setOrigin(0, 0.5);

  container.add([coin, hole, text]);

  // 一圈金光扩散，给"钱到手了"一个爆点。
  // 和飘字分开做：它就地散开，飘字往上走。
  const ring = scene.add.circle(x + offsetX, y, 10, 0xfde68a, 0)
    .setStrokeStyle(3, 0xfde68a, 0.9)
    .setDepth(DEPTH - 1);
  scene.tweens.add({
    targets: ring,
    scale: 2.6,
    alpha: 0,
    duration: 380,
    ease: 'Sine.easeOut',
    onComplete: () => ring.destroy(),
  });

  // 先"啵"地弹出来（放大回弹）……
  container.setScale(0.4);
  scene.tweens.add({
    targets: container,
    scale: 1,
    duration: 180,
    ease: 'Back.easeOut',
  });

  // ……然后一边往上飘一边淡出。
  //
  // 淡出用 delay 错开，让飘字先亮着飘一会儿再消失，
  // 否则一冒出来就开始变淡，玩家还没看清数字它就没了。
  scene.tweens.add({
    targets: container,
    y: y - 40,
    duration: 780,
    ease: 'Quad.easeOut',
  });
  scene.tweens.add({
    targets: container,
    alpha: 0,
    duration: 320,
    delay: 460,
    ease: 'Quad.easeIn',
    onComplete: () => container.destroy(),
  });
}

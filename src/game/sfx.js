// 音效。
//
// 全部走这里播，不散在各个模块里 —— 音量、节流、"文件没加载上怎么办"
// 这些都只需要在一处处理。要调某个音效的音量，改下面的表就行。
//
// 音效文件放在 assets/audio/，由 BootScene 预加载（key 要和这里对上）。
// 和图片一样走 Vite import，不放 public/。
//
// 唯一的例外是按钮点击音，它不走 Phaser（见文件末尾的 playUiClick）。
import buttonUrl from '../../assets/audio/button.mp3';
import {
  getSfxVolume, getBgmVolume, storeSfxVolume, storeBgmVolume,
} from '../state/settings.js';

// minInterval：同一个音效两次播放之间至少隔多少毫秒。
// 用真实时间（performance.now）而不是游戏时间 —— 2 倍速时击杀会变密，
// 但音效该不该重叠是听觉问题，和游戏快慢无关。
//
// seek：跳过文件开头的一段（单位是**秒**）。
// 有的音频文件开头留了一大段静音，直接播的话声音会比画面慢一大截 ——
// 玩家看到金币飘字，一秒之后才听见响，两件事就对不上了。
// 用 seek 跳过去比裁剪文件好：原始文件不用动，改个数字就能调。
// 具体每个文件从第几毫秒开始有声，可以用 AudioContext.decodeAudioData
// 解出 PCM 再逐段算 RMS 量出来。
const SFX = {
  // 击杀得金币。播得最频繁，所以音量压低一点，不然一波敌人过来会很吵。
  //
  // 这个文件总长 2.66 秒，但真正的响声只在 1.155~1.465 秒那一小段，
  // 前面 1.15 秒全是静音。不跳过去的话，金币飘字都飘完淡出了
  // 才听见"叮"，听着像是上一个敌人的声音。
  // 留 35 毫秒余量：太贴边会把起音的那一下削掉，声音会发闷。
  kill: { key: 'sfx_kill', volume: 0.4, minInterval: 110, seek: 1.12 },
  // 塔命中敌人。比击杀还要密得多 —— 一个敌人要挨好几下才死，
  // 而且十座塔可能同时开火（1 倍速约每秒 11 下，2 倍速翻倍）。
  // 所以音量比击杀音效还低、节流比它还紧：它是垫在底下的"打击感"，
  // 不该盖过"这个敌人死了"这个更重要的信息。
  hit: { key: 'sfx_hit', volume: 0.22, minInterval: 90 },
  // 关卡开始前的 3 声"哔"。整段一次播完，三声正好落在 3、2、1 上
  // （详见 LevelRuntime.startCountdown 的注释）。
  countdown: { key: 'sfx_countdown', volume: 0.5 },
  // 玩家主动按暂停时播（菜单里弹确认框那种"顺带暂停"不播，见 src/ui/hud.js）。
  pause: { key: 'sfx_pause', volume: 0.55 },
  win: { key: 'sfx_win', volume: 0.7 },
  lose: { key: 'sfx_lose', volume: 0.7 },
};

// 玩家在设置里调的音量系数（0~1）。乘在上面那些基准音量上。
//
// 从 localStorage 读初值（见 src/state/settings.js）——
// 上次调好的音量这次打开还是那个。
let sfxScale = getSfxVolume();
let bgmScale = getBgmVolume();

// ── 音量设置 ────────────────────────────────────────────────
//
// 设置界面（src/ui/settingsDialog.js）调这两个。它们做三件事：
// 存进 localStorage、更新模块里的系数、让**正在响**的声音立刻跟着变。
//
// 界面不要直接去调 settings.js 的 storeXxx —— 那样只存了值，
// 正在播的背景音乐不会变，玩家拖滑块时听不到任何反应。

export function setSfxVolume(value) {
  storeSfxVolume(value);
  sfxScale = getSfxVolume();
  // 音效都是短音，正在响的那一两声不用去追 —— 下一声就是新音量了。
  // 点击音是个例外：它是常驻的那一个 Audio 对象，要现场改
  // （否则玩家拖完滑块点「关闭」，听到的还是旧音量，像是没生效）。
  if (clickAudio) {
    clickAudio.volume = CLICK_VOLUME * sfxScale;
  }
}

export function setBgmVolume(value) {
  storeBgmVolume(value);
  bgmScale = getBgmVolume();
  // 背景音乐是一直响着的，必须现场改，不能等下次进关。
  if (bgm) {
    bgm.setVolume(bgmScale);
  }
}

// 给界面读当前值用（画滑块的初始位置）。
export { getSfxVolume, getBgmVolume };


// 每个音效上次播放的时间，用来做节流。
const lastPlayed = {};

export function playSfx(scene, name) {
  const config = SFX[name];
  if (!config) {
    return;
  }

  // scene 可能已经销毁（比如退出关卡时还有回调在飞），sound 就没了。
  if (!scene || !scene.sound || !scene.cache) {
    return;
  }

  // 文件没加载上就安静地跳过。少一个音效不该让游戏报错 ——
  // 直接 play 一个不存在的 key，Phaser 会往控制台刷警告。
  if (!scene.cache.audio.exists(config.key)) {
    return;
  }

  const now = performance.now();
  if (config.minInterval) {
    const last = lastPlayed[name];
    if (last !== undefined && now - last < config.minInterval) {
      return;
    }
  }
  lastPlayed[name] = now;

  // 音量拉到 0 时干脆不播。
  //
  // 不是为了省性能，是为了别在节流表里留下一次记录 —— 上面的 lastPlayed
  // 已经写了，静音期间照样"播"的话没有任何区别；但真正的原因是
  // Phaser 里 volume: 0 的 Sound 仍然会占一个音轨，一波敌人过来
  // 十几个静音音源同时跑没有意义。
  if (sfxScale === 0) {
    return;
  }

  // 连着播同一个音效时随机微调音高，听起来才不像机枪一样死板。
  // detune 单位是"音分"，100 音分 = 半音，这里 ±60 是很轻微的抖动。
  const detune = config.minInterval ? Math.round((Math.random() - 0.5) * 120) : 0;

  // seek 跳过文件开头的静音（见上面 SFX 表的说明）。
  // Phaser 的 play(key, config) 认这个字段，单位是秒。
  scene.sound.play(config.key, {
    // 表里的基准音量乘上玩家在设置里调的系数。
    volume: config.volume * sfxScale,
    detune,
    seek: config.seek || 0,
  });
}

// 播一个音效并把 Sound 对象返回，方便调用方自己停掉它。
//
// 和 playSfx 分开是因为 playSfx 走的是 sound.play()，那是"播完自动销毁、
// 拿不到把手"的便捷写法。倒计时音效需要能中途掐掉
// （玩家在 3 声哔响完之前就退出关卡了，见 LevelRuntime.destroy），
// 所以这里用 sound.add() 拿到对象再 play。
//
// 用同一张 SFX 表，音量和 seek 的规则不用重复写一遍。
export function playSfxHandle(scene, name) {
  const config = SFX[name];
  if (!config || !scene || !scene.sound || !scene.cache) {
    return null;
  }
  if (!scene.cache.audio.exists(config.key)) {
    return null;
  }

  const sound = scene.sound.add(config.key, { volume: config.volume * sfxScale });
  sound.play({ seek: config.seek || 0 });
  return sound;
}

// ── 背景音乐 ────────────────────────────────────────────────
//
// 只在关卡里响，循环播。开始界面和选章界面保持安静 ——
// 那两个界面上没有任何动态的东西，配着音乐反而显得空。
//
// 引用存在模块里而不是场景上：场景会被 restart（「重试本关」），
// 存在场景上的话每次重进都会多出一个 Sound 对象。
let bgm = null;

// 关卡正式开始时调用（倒计时结束后，见 GameScene.startLevel）。
//
// 不在 create() 里就播：倒计时那 3 秒是"准备布阵"，
// 音乐等「开始！」一起进来，听着更像是开打了。
export function startBgm(scene) {
  if (!scene || !scene.sound || !scene.cache || !scene.cache.audio.exists('sfx_bgm')) {
    return;
  }

  // 上一局的对象先销毁掉，别越攒越多。
  stopBgm();

  bgm = scene.sound.add('sfx_bgm', { loop: true, volume: bgmScale });
  bgm.play();
}

export function stopBgm() {
  if (bgm) {
    bgm.destroy();
    bgm = null;
  }
}

// 暂停时跟着停、继续时跟着走。由 LevelRuntime.setPaused 调用 ——
// 时间流速的事都归它管，音乐也算一种"在走的东西"。
export function pauseBgm() {
  if (bgm && bgm.isPlaying) {
    bgm.pause();
  }
}

export function resumeBgm() {
  // 只恢复"正暂停着"的音乐。
  // 已经停掉的（比如结算时被 stopAllSfx 掐了）不该在这里被重新拉起来。
  if (bgm && bgm.isPaused) {
    bgm.resume();
  }
}

// 掐掉所有还在响的音效。
//
// 主要是为了「防线失守」那段 7 秒的音乐：不掐的话它会一路盖到别的界面上。
// 调用点有两处，因为离开关卡有两条不同的路 ——
// 场景真的关闭（重试本关）走 GameScene 的 shutdown，
// 只是让循环睡下（返回选关）走 main.js 的 sleepGame()。
//
// 背景音乐也在同一个 SoundManager 里，所以 stopAll() 会一并掐掉 ——
// 这正是结算时想要的：胜利/失守音乐响起来的时候背景音该让位，
// 两段音乐叠在一起谁都听不清。所以这里额外把 bgm 对象也销毁掉，
// 免得留一个已经停了的空壳。
export function stopAllSfx(scene) {
  stopBgm();
  if (scene && scene.sound) {
    scene.sound.stopAll();
  }
}

// ── 按钮点击音 ──────────────────────────────────────────────
//
// 这一个不走 Phaser，用原生 Audio。两个原因：
//
// 1. 开始界面和选章界面上的按钮也要响，但那时 Phaser 实例可能还没建起来
//    （main.js 是点了「开始游戏」进关才 new Phaser.Game 的），拿不到 scene。
// 2. 它是界面音，不该被 sound.stopAll() 掐掉、也不该跟着游戏暂停。
//
// 调用点只有一处：main.js 里一个全局的 click 监听，任何 <button> 都算。
// 画布上的按钮（建造面板、结算界面的「返回选关」）不是 DOM，要自己调。
//
// 它也算"音效"，所以跟着设置里的音效音量一起走 ——
// 玩家把音效拉到 0，点按钮就该是完全安静的。
const CLICK_VOLUME = 0.5;

let clickAudio = null;
let lastClick = 0;

export function playUiClick() {
  const now = performance.now();
  // 防抖。同一次点击有时会触发两次（比如按钮里还套着元素），
  // 60 毫秒内的第二声听起来就是"咔咔"两下。
  if (now - lastClick < 60) {
    return;
  }
  lastClick = now;

  if (sfxScale === 0) {
    return;
  }

  try {
    if (!clickAudio) {
      clickAudio = new Audio(buttonUrl);
    }
    // 每次都重新算音量，不只在新建时算 —— 玩家中途调过设置的话
    // 这个对象已经存在了，构造函数那一行走不到。
    clickAudio.volume = CLICK_VOLUME * sfxScale;
    // 连着点的时候要从头播，不然第二下会接着上一下的尾巴。
    clickAudio.currentTime = 0;
    // play() 返回 Promise，用户还没和页面交互过时浏览器会拒绝它。
    // 按钮点击本身就是交互，正常情况下不会拒；拒了也只是少一声，不该报错。
    const played = clickAudio.play();
    if (played && played.catch) {
      played.catch(() => {});
    }
  } catch {
    // 浏览器不让建 Audio（极少见）就算了。
  }
}

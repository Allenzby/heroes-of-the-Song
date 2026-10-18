# 大宋英雄传

用 Phaser 3 + Vite 做的塔防游戏，2026 少年 AI 体验营课堂项目。自梁山聚义，征田虎、讨王庆、平方腊。

## 界面方法论

网页游戏不需要把所有界面都画进 Canvas。建议根据内容选择合适的技术：

- **HTML/CSS（DOM）**：开始页、设置页、帮助、表单、长文本和普通按钮。它更容易排版、适配屏幕，也更方便无障碍访问。
- **Phaser Canvas**：角色、地图、动画、碰撞、镜头与每帧更新的游戏主体。
- **混合使用**：HUD、暂停菜单或返回按钮也可以作为 DOM 覆盖在 Canvas 上。不要为了“统一”而把普通网页界面重复绘制到 Canvas。

本模板的流程是：`开始界面（DOM） → 点击开始 → 游戏界面（DOM 容器 + Phaser Canvas）`。`src/main.js` 负责界面切换，Phaser 场景只负责游戏内部内容。

## 运行

### 最省事：双击「启动游戏.bat」

根目录里的 **`启动游戏.bat`** 双击就行 —— 它会检查 Node.js、第一次自动 `npm install`、启动服务器，等服务器真的能访问了再自动打开浏览器。

停止：关掉那个黑窗口，或者在里面按 **Ctrl + C**。

重复双击也没关系：它会先探一下 5173 端口，已经有服务器在跑就只开浏览器，不会再启一个。

> 改这两个启动文件的话有两个坑：`启动游戏.bat` 必须**保持纯英文**（GBK 编码下有些汉字的第二个字节正好是 `|`，cmd 会当成管道符把整行切碎），中文提示都放在 `start-game.ps1` 里；而 `start-game.ps1` 必须存成**带 BOM 的 UTF-8**（PowerShell 5.1 会把没 BOM 的文件当 ANSI 读，中文会变成乱码并导致语法错误）。

### 手动敲命令

在**项目根目录**（也就是有 `package.json` 的这个文件夹）打开终端：

```bash
npm install    # 只有第一次、或换了电脑才需要
npm run dev
```

终端会打印出网址，通常是 <http://localhost:5173/>。按住 Ctrl 点它，或者手动复制到浏览器地址栏打开。

停止服务器：回到那个终端窗口，按 **Ctrl + C**。

改代码之后不用重启，也不用刷新 —— Vite 会自动热更新。只有改了 `index.html` 才需要刷新一下浏览器。

### 出问题的时候

| 现象 | 原因和处理 |
|---|---|
| `npm: 无法将"npm"项识别为...` | 没装 Node.js。去 <https://nodejs.org/> 装 LTS 版，装完**重开**终端 |
| `Cannot find module` / 页面全白 | 依赖没装好，跑一次 `npm install` |
| `Port 5173 is in use` | 上次的服务器还开着。双击 `启动游戏.bat` 会自动认出来并直接开浏览器；手动 `npm run dev` 的话 Vite 会换到 5174，用它打印的那个网址就行 |
| 打印了网址但页面打不开 | 网址要用 `localhost:5173`，不是 `127.0.0.1` 之外的地址；也确认终端里的 `npm run dev` 还在运行没退出 |
| 点开始进去是黑屏 | 按 **F12** 打开浏览器控制台看红色报错，通常是图片路径写错或 `load.image` 的 key 拼错了 |
| 想给同一局域网的人看 | `npx vite --host`，然后用它打印的 Network 那个网址 |

发布版本：`npm run build`，产物在 `dist/`。想本地预览发布版：`npm run preview`。

## 玩法结构

- **章节流程**：开始界面 → 选章界面 → 关卡。章节的解锁关系和剧情分支在 `src/data/chapters.js`，通关记录存在浏览器 localStorage（`src/state/progress.js`）。
- **一关的构成**：`src/data/levels.js` 指定用哪张图、走哪条路、出几波兵、初始金币多少。五章都有图了：序章`iceMap`、第一章`mountainPass`、第二章`huaixiWaters`、第三章`jiangnanJungle`、第四章`centralPlains`。
- **地图靠遮罩图定义可走区域**：`assets/art/ice_map_mask*.png` 里紫色是道路、蓝色是建塔位、黑色不可用。路线点和建塔位坐标是程序从遮罩里扫出来的，存在 `src/data/paths.js` 和 `src/data/buildSlots.js`。
- **建塔位数量不是每关都一样**：前两关和第四章各 10 个，第二、三章只有 9 个（美术就画了 9 个）。少一个塔位就是少一个火力点，所以那两关的兵量没有按塔位数线性往上堆。
- **建塔**：点地图上的蓝圈 → 选武将 → 塔自动打射程内"走得最远"的敌人。打死敌人按 `reward` 加金币。塔可以升级（3 级）和拆除（返还 60%）。
- **两套坐标**：遮罩图是 1536×864，画布是 960×540。`paths.js` / `buildSlots.js` 存的是**遮罩坐标**，运行时由 `GameScene` 除以 1.6 换算。改这两个文件时填遮罩坐标。
- **出入口不一定在左右两边**：第四章的路是从左上皇城斜下来、从**下边缘**出去的（其余四关都是左进右出）。出生点和防线标记都会被 `Phaser.Math.Clamp` 夹回画面内，所以路线点写到画面外也没关系 —— 敌人正是靠这些画面外的点走进画面的。

### 加一个新武将（炮塔）

1. 把立绘放进 `assets/art/towers/`，命名 `人物名_jin.png`（近战）或 `人物名_yuan.png`（远战）。透明底，人物朝右。
2. `src/scenes/BootScene.js`：`import` 这张图，再 `this.load.image('tower_人物名_jin', 那个变量)`。
3. `src/data/towers.js`：加一条数据，`key` 要和上一步的 key 完全一致。

近战/远战是从文件名后缀 `_jin` / `_yuan` 自动判断的，不用额外写字段 —— `_yuan` 会自动走飞弹逻辑。

### 加一张新地图

1. 把底图和遮罩放进 `assets/art/`，都是 1536×864。遮罩只用三种纯色：紫色道路、蓝色建塔位、黑色不可用（判定规则见 `GameScene.getZoneAt`）。
2. `src/scenes/BootScene.js`：`import` 两张图，再 `this.load.image('mapN', ...)` 和 `this.load.image('mapMaskN', ...)`。
3. `src/data/paths.js` 加路线点、`src/data/buildSlots.js` 加建塔位坐标（**遮罩坐标**）。
4. `src/data/levels.js` 加一关，`mapKey` / `maskKey` 对上第 2 步的 key。
5. `src/data/chapters.js` 里把对应章节的 `map` 指到第 4 步的 key。

第 3 步的坐标不用手点。建塔位取每个蓝色连通块的重心；路线是把紫色像素当可走区域，做一遍距离变换算"离路边多远"，再跑偏向路中心的最短路（离边越近代价越高），每 45 像素采样一个点，最后两端各向外补两个点延伸到画面外。

两个坑：

- **只保留最大的那个连通块**。蓝方块和黑底交界处的抗锯齿会产生几个几像素大的杂点，刚好满足"紫色"的判定条件，不剔掉的话最短路的起点可能落在杂点上。
- **别用"测地直径"自动找两端**。第二章左边有个向上的鼓包，沿路量比左边缘还远，自动找端点会把出生点定在画面中间。直接指定从哪边进、往哪边出，再在那条边 20 像素内取"离路边最远"的那个像素。

## 公告后台（/gonggao）

首页顶部那条公告，加上 `/gonggao` 这个发布页。**数据不在服务器上，在你自己 GitHub 的一个公开 Gist 里** —— 这站是纯静态的，本来就没有后端可写。

### 第一次配置

三步，只能你自己做（我拿不到你的 GitHub 权限）：

1. **建 Gist**：GitHub 头像 → *Your gists* → *New gist*。文件名 `notices.json`，内容先填：

   ```json
   { "version": 1, "notices": [] }
   ```

   **必须选 Public** —— 玩家读公告时不带令牌，私有的会直接 404。建完从地址栏抄 ID：`https://gist.github.com/<用户名>/<这串就是 GIST_ID>`。

2. **建令牌**：*Settings → Developer settings → Personal access tokens (classic)*

   - **只勾 `gist`，不勾 `repo`**。这样就算令牌从页面里被人扒走，他最多改你的 Gist，碰不到游戏仓库、代码和 Netlify。
   - **Expiration 选 30 天**。到期重新生成一个，改一下配置即可。
   - **不能用 fine-grained 令牌**，那种不支持 Gist，只能用 classic。

3. **生成两串值粘进 `src/data/noticeConfig.js`**，顺便把 `GIST_USER` / `GIST_ID` 也填上：

   ```bash
   node scripts/notice-secret.js hash "你的发布密码"
   node scripts/notice-secret.js token "ghp_你刚建的令牌"
   ```

   填完 `npm run build` 重新打包（配置是编译进 JS 的，不打包不生效）。

**没配置之前**，首页不显示公告条、一个请求都不发，`/gonggao` 显示「还没配置 Gist」—— 这都是正常状态，不是故障，控制台也不会有红字。

### 安全边界（别高估它）

- 页面上那个密码是**纸门**：它挡的是「不知道密码的人顺手改」。令牌既然在前端代码里，会抓包的人就能绕过页面直接调 GitHub API。
- 真正的锁是**令牌**，而它的爆炸半径被 scope 圈住了 —— 只勾 `gist` 的令牌改不了你任何仓库。
- 密码只存 SHA-256，**绝不写进 Gist**：那个文件全世界都读得到，密码跟公告放一起等于裸奔。
- 页面内容一律用 `textContent` 写进 DOM，**绝不拼 `innerHTML`**。公告是外人能改的，拼了 `innerHTML` 就等于在自家首页上挂了个存储型 XSS。

### 读取为什么要分两步

见 `src/data/noticeStore.js`：先带时间戳绕开 CDN 缓存（实测约 280ms，刚发布的公告能立刻露面），失败再退回不带参数的地址吃缓存（实测约 4ms）。第二步是保命的 —— 只有第一步的话，回源一旦慢到超时，公告条会整个不出现。

## 目录

```text
启动游戏.bat          # 双击启动（纯英文的一层壳，逻辑在下面那个 .ps1 里）
start-game.ps1        # 启动逻辑：查 Node、装依赖、开服务器、自动开浏览器
src/
  main.js             # 切换界面、创建 Phaser 实例、章节进出
  config/game.js      # 画布尺寸、缩放方式、场景注册
  scenes/
    BootScene.js      # 加载所有图片资源
    GameScene.js      # 关卡主场景：地图、槽位、每帧驱动
  data/               # 纯数值表，改数值不用动逻辑代码
    chapters.js       # 章节剧情与解锁关系
    levels.js         # 每关用哪张图 / 几波兵 / 初始金币
    enemies.js        # 敌人属性
    towers.js         # 武将属性（伤害、射程、造价、3 级数值）
    paths.js          # 敌人行进路线（遮罩坐标）
    buildSlots.js     # 建塔位坐标（遮罩坐标）
  game/               # 游戏对象与管理器
    WaveManager.js    # 管敌人这一堆
    TowerManager.js   # 管塔和弹丸这一堆 + 金币
    Enemy.js / Tower.js / Projectile.js
    BuildPanel.js     # 点槽位弹出的建造/管理面板
    DefenseLine.js    # 地图上的防线标记 + 血条
    GoldPopup.js      # 击杀时冒出的「+10」飘字
    sfx.js            # 音效：音量表、节流、统一的播放入口
    LevelRuntime.js   # 倒计时、暂停、倍速
  ui/                 # DOM 界面
    chapterSelect.js  # 选章界面
    hud.js            # 右上角金币 / 暂停 / 倍速 / 菜单
    confirmDialog.js  # 通用确认弹框
  state/progress.js   # 通关进度存取
assets/
  art/                # 底图、遮罩、敌人与武将立绘
  audio/              # 音效和背景音乐（文件名是拼音，key 在 src/game/sfx.js）
```

### 音效

| 文件 | key | 什么时候响 |
|---|---|---|
| `hit.mp3` | `sfx_hit` | 塔打中敌人时。全场最密的声音（一个敌人要挨好几下才死，十座塔还可能同时开火），所以音量最低 0.22、节流最紧 90ms —— 它是垫在底下的打击感，不该盖住"这个敌人死了"这个更重要的信息 |
| `defen.mp3` | `sfx_kill` | 打死敌人得金币时。音量压到 0.4，做了 110ms 节流和 ±60 音分的随机音高，免得一波兵过来听着像机枪。**这个文件开头有 1.15 秒静音，靠 `seek` 跳过**，见下面「开头的静音」 |
| `daojishi.mp3` | `sfx_countdown` | 关卡开始前的 3、2、1。整段一次播完，见下面「倒计时的三声哔」 |
| `zanting.mp3` | `sfx_pause` | 玩家**主动**按暂停（按钮或空格）时。「继续」不响 —— 这是个提示音，恢复时再响一遍会让人分不清停了还是走了。菜单里弹确认框那种顺带的暂停也不响 |
| `win.mp3` | `sfx_win` | 通关 |
| `lost.mp3` | `sfx_lose` | 防线失守 |
| `beijingyin.wav` | `sfx_bgm` | 关卡里的背景音乐，循环播。见下面「背景音乐」 |
| `button.mp3` | —（不走 Phaser） | 点任何按钮时。见下面「按钮点击音」 |

命中音效挂在 [Enemy.js](src/game/Enemy.js) 的 `takeDamage()` 里，不在 `Tower.attack()` 里 ——
近战是当场结算伤害，远战要等弹丸飞到才结算，`takeDamage` 是两条路唯一的汇合点，
写一次就都覆盖到了。这一下把人打死也照样播：紧接着的击杀音效会盖在它上面，
听起来正好是"打中 → 倒下"两层；少这一声反而像最后一击没打中。

胜利/失守是几秒长的音乐，所以播之前会先 `stopAll()` 掐掉别的音效，
离开关卡时也要掐 —— 而"离开关卡"有**两条**路，都得管到：
`scene.start`（菜单里「重试本关」）走 GameScene 的 `shutdown` 事件，
`loop.sleep`（「返回选关」「返回首页」）场景根本没关，得靠 [main.js](src/main.js) 的 `sleepGame()`。
只做第一条的话，失守的音乐会一路盖到选章界面上。

#### 开头的静音

音频文件开头常留一段静音，直接播的话声音会比画面慢一大截 ——
玩家看到金币飘字，一秒之后才听见"叮"，两件事就对不上了，
听着像是上一个敌人的声音。

`defen.mp3` 就是这样：总长 2.66 秒，真正的响声只在 **1.155~1.465 秒**那一小段。
所以 [sfx.js](src/game/sfx.js) 的表里给它写了 `seek: 1.12`（单位是秒），
Phaser 会把这个值当作 buffer 的起播偏移。留 35 毫秒余量是因为太贴边会把
起音那一下削掉，声音会发闷。

**这比裁剪文件好**：原始文件不用动，改个数字就能调。要量一个文件从第几毫秒
开始有声，用 `AudioContext.decodeAudioData()` 解出 PCM，每 5ms 一格算 RMS，
找第一次超过峰值 4% 的位置。目前只有 `defen.mp3` 需要，
其余文件都在 25~140ms 内起音，听不出来。

#### 倒计时的三声哔

`daojishi.mp3` 里的三声落在 **0.075 / 1.08 / 2.08 秒**，正好每秒一声，
和 `startCountdown` 里 1000ms 一跳的节奏对得上（第一声跟着「3」出现，
最后一声跟着「1」）。所以**整段一次播完**，不是每跳一个数字播一声 ——
三个 `setTimeout` 各自会积累一点延迟，到第三声就听得出和数字错开了。

只在秒数正好是 3 时播：秒数要是被改小，音效会比画面长，最后一声会落在
已经开打的画面上。播的时候用 `playSfxHandle()` 而不是 `playSfx()`，
为的是拿到 Sound 对象能中途掐掉 —— 倒计时期间菜单是**可用**的，
玩家完全可能在哔完之前就退出去。

这里还藏着一个坑：倒计时用的是 `window.setTimeout`，**不受 `loop.sleep()` 影响**。
「返回选关」只是让游戏循环睡下，那串 setTimeout 会照样走到底，
3 秒后把关卡「开始」起来 —— 背景音乐于是响在选章界面上，HUD 也被启用了。
所以 `sleepGame()` 里要调一次 `runtime.destroy()`，而且必须在 `stopBgm()` **之前**，
否则先停的音乐会被后触发的 `startBgm` 重新拉起来。

#### 背景音乐

只在关卡里响，选章和标题界面是安静的。音量 0.25，压得比所有音效都低 ——
它要一直循环，和音效持平的话会把打击声和金币声全糊住。

从 `startLevel()` 开始播，不在 `create()` 里：倒计时那 3 秒是"准备布阵"，
音乐跟着「开始！」一起进来更像是开打了。暂停时跟着停（[LevelRuntime.js](src/game/LevelRuntime.js) 的 `setPaused`），
继续时恢复 —— 但 `resumeBgm()` 只恢复"正暂停着"的，已经被结算掐掉的不该被重新拉起来。

[sfx.js](src/game/sfx.js) 里用一个模块级的 `bgm` 变量存着它，`startBgm` 会先 `stopBgm`：
不这样的话「重试本关」每重启一次就多一个 Sound 对象在响。上面那两条离开关卡的路
也都要 `stopBgm()` —— `sound.stopAll()` 只是让它停下来，对象还挂在 SoundManager 里，
模块里那个引用不清掉，`resumeBgm` 可能把一段已经离开的关卡的音乐重新拉起来。

#### 按钮点击音

这一个**故意不走 Phaser**，用原生 `Audio`（见 `playUiClick()`）。两个原因：
开始界面的按钮在 `new Phaser.Game()` 之前就得能响，那时候还没有 `scene.sound`；
而且界面音不该被 `sound.stopAll()` 掐掉、也不该被暂停冻住。

DOM 按钮由 [main.js](src/main.js) 里**一处**捕获阶段的全局 `click` 监听管住 ——
按钮散在 index.html、chapterSelect.js、routeDialog.js、confirmDialog.js 和 hud.js 五个地方，
一个个加监听又啰嗦又容易漏。用捕获阶段是因为有些处理函数会把自己所在的界面隐藏掉，
等冒泡走到 document 时 `event.target` 可能已经不在文档里了；用 `closest('button')`
是因为按钮里常套着别的元素（选章卡片里有好几层文字和标签）。禁用的按钮不响。

**画布上的按钮不是 DOM，那个全局监听管不到**，得自己调 `playUiClick()`：
[BuildPanel.js](src/game/BuildPanel.js) 的武将卡和升级/拆除按钮、结算界面的「返回选关」都是这样。

要加新音效：文件丢进 `assets/audio/` → [BootScene.js](src/scenes/BootScene.js) 里 `import` + `load.audio` →
[sfx.js](src/game/sfx.js) 的 `SFX` 表里加一行 → 在该响的地方 `playSfx(scene, '名字')`。
新文件先量一下开头有没有静音，有的话补个 `seek`。

### 关卡结算

胜利和失守走的是同一套界面：半透明黑底 + 大字横幅 + 底下一个「返回选关」按钮，
按钮带倒计时，走完自动回选章界面（胜利 10 秒，失守 14 秒 —— 输了要多留点时间
看清防线是怎么破的）。两边都由 `showSelectButton()` 建按钮。

倒计时用 `window.setInterval`，**不用** `time.delayedCall`：结算时可能正暂停着，
Phaser 的 Clock 停了的话 `delayedCall` 永远不会触发，按钮上的数字就卡住不动了。
它是界面时间，也不该受倍速影响。

`GameScene.settled` 保证只结算一次。同一帧要是有两个敌人一起漏过去，
`onLeak` 会连着调两次 `onLevelFailed()`，不挡的话会叠出两个横幅、两个按钮，
还会漏掉一个 `setInterval`（第二个把 `selectCountdown` 覆盖了，第一个再没人 clear）。
这个标记必须在 `create()` 里复位，否则「重试本关」之后新的一局根本结算不了。

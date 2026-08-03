'use strict';
/**
 * config/scene.js — 3D 场景与滚动节奏
 * ====================================
 *
 * 这个模板的 3D 部分（水晶、相机运镜、流体、粒子）是一份已经编译好的
 * Three.js 产物，放在 src/_nuxt/ 里，本仓库不重新构建它。能安全改动的是
 * 它「对外暴露的旋钮」，也就是这个文件里的东西：
 *
 *   1. 滚动节奏 —— 每个场景段落有多长
 *   2. 初始状态 —— 画质、声音、首屏配色
 *   3. 素材替换 —— 水晶模型 / 贴图 / 环境光照 / 音效
 *
 * ── 关于「滚动段落」──────────────────────────────────────────────
 * 整条叙事被切成 20 段（section 1..20）。每段的 scrollLength 是它占用的
 * 滚动距离（单位近似 vh 的百分数，数字越大，这一段停留越久）。
 *
 * config/story.js 里文字块的出场位置写成 `{ s: 6, base: -190 }`，含义是
 *   「第 1..7 段长度之和，再往后 -190」。
 * 注意 s 是 **从 0 开始的下标且求和包含它自己**：s: 0 = 第 1 段结束处，
 * s: 6 = 第 7 段结束处。这是原始引擎的算法，照搬过来没有改。
 *
 * 所以：把某一段改长，它之后所有文字块会整体后移；只想挪一块文字，
 * 请改 story.js 里的 base/half，不要动这里。
 *
 * ── lg / xs ──────────────────────────────────────────────────────
 * lg = 非移动端（桌面 + 平板），xs = 移动端。写成一个数字表示两者相同。
 * 引擎内部是 `isMobile ? xs : lg`，与 CSS 断点无关，是设备判断。
 */

module.exports = {
  // ------------------------------------------------------------ 初始状态
  // 'high' 是打包产物里唯一存在的画质档位；引擎没有导出别的档，
  // 填其他值构建会报错。
  quality: 'high',

  // 首次进入是否开启音效。原站默认关闭（用户点击喇叭才开），
  // 浏览器的自动播放策略也不允许未交互就出声，建议保持 false。
  sound: false,

  // 首屏配色。'light' 深色文字（浅色场景），'dark' 反之。
  // 后续段落由引擎在滚动中自动切换，这里只决定第一帧。
  startColor: 'light',

  // ------------------------------------------------------------ 滚动节奏
  // 20 段，顺序固定，不能增删（段数写死在编译好的相机运镜里）。
  // 右侧注释标出这一段大致对应 story.js 里的哪些文字块。
  sections: [
    { lg: 100, xs: 50 },   //  1  开场：smallLight[0] 「世界始终在流变」
    { lg: 150, xs: 75 },   //  2  smallLight[1] 阶梯式四行
    { lg: 300, xs: 150 },  //  3  big[0] 「是 narrative.」
    { lg: 300, xs: 150 },  //  4  smallLight[2] 「而故事，诞生于」
    { lg: 200, xs: 100 },  //  5  过渡
    { lg: 300, xs: 150 },  //  6  big[1] Light
    { lg: 500, xs: 250 },  //  7  big[2] Spirit / big[3] Sound
    { lg: 200, xs: 100 },  //  8  过渡
    { lg: 80, xs: 40 },    //  9
    { lg: 80, xs: 40 },    // 10
    170,                   // 11  smallDark[0] + lines[0] 提问
    190,                   // 12  lines[1..4] 四条方法论
    280,                   // 13
    50,                    // 14
    50,                    // 15
    100,                   // 16  lines[5] 「在这里，故事成为体验」
    140,                   // 17
    { lg: 560, xs: 1100 }, // 18  水晶项目区（移动端更长，逐个滑过）
    { lg: 200, xs: 250 },  // 19  smallDark[1..3] 收束
    280,                   // 20  结尾 / 页脚
  ],

  // ------------------------------------------------------------ 水晶配色
  // 首页「品牌滑动体验」那 7 颗水晶的颜色与玻璃材质。
  //
  // ── 先说一件反直觉的事 ────────────────────────────────────────
  // 引擎里有两套水晶参数，弄混了会改半天没效果：
  //
  //   crystal        —— **静止态**，7 颗共用一套。不划过鼠标时看到的就是它。
  //                     上游这套是纯白 + 零折射，所以原版 7 颗平时长得一模一样。
  //   crystalHovers  —— **悬停态**，7 颗各一套。上游那 7 个漂亮颜色
  //                     （淡金 / 蓝 / 薄荷 / 粉 / 灰绿 / 青 / 浅绿）
  //                     **只在鼠标划到那一颗时才出现**，移动端根本没有 hover。
  //
  // 每个参数在引擎里是一根弹簧：静止值取 crystal 里的同名键，鼠标移入时
  // 目标切到 crystalHovers[i] 的值，移出再弹回去。所以想改「平时的样子」
  // 要动静止态，想改「划过时的样子」要动悬停态。这个模板两边都改了。
  //
  // 上游还有个结构性的坑：静止态**只有一份**，7 颗共用。所以把它从白改成
  // 淡蓝，7 颗还是一模一样的淡蓝，站在页面上看跟原版没有本质区别。模板
  // 因此往引擎里补了一个 `crystalRests`（按 crystal0…crystal6 逐颗），
  // 并把引擎读静止值的两处改成「先查 crystalRests，查不到再回落到 crystal」。
  // 于是 7 颗**不划过的时候就是 7 个颜色**。
  //
  // ── 预设 ────────────────────────────────────────────────────
  //   'prism'   棱镜（默认）—— 唯一一个静止态就逐颗给色的预设。色相从金
  //             42° 一路走到薄荷 152°，7 颗横排过去像一道分光；划过去是
  //             同一色相突然变浓，不是换色。
  //   'aurora'  极光虹彩 —— 静止态 7 颗共用一层冷调通透玻璃，悬停才炸。
  //   'ice'     冰蓝 —— 7 颗统一收进蓝青区间，最贴品牌色，最克制。
  //   'jewel'   宝石 —— 同样的色相弧但压暗提饱和，像有色宝石而不是彩色玻璃。
  //             也逐颗给静止色。
  //   'legacy'  上游原样 —— 逐字节还原，一键回退（连补丁都不下）。
  //   'custom'  完全自定义，此时 items 必须给满 7 条。
  //
  // ── base / items ────────────────────────────────────────────
  // base 覆盖静止态里 7 颗共用的那一份（光学参数写这里会同时作用到 7 颗）。
  // items[i] 有两种写法：
  //
  //   items: [{ iorStart: 1.4 }, …]                      整条当悬停态补丁
  //   items: [{ rest: { baseColor: '#E0BF85' },           分开写静止 / 悬停
  //             hover: { baseColor: '#F8D496' } }, …]
  //
  // 都是在预设之上叠加，只写想改的键即可。可用的键（共 25 个）：
  //
  //   颜色    baseColor / peaksColor / fringeColor        '#RRGGBB'
  //   折射    iorStart / iorDelta                          折射率起点与色散跨度
  //   通透    envReflection / envRefraction                环境反射 / 折射强度
  //   虹彩    reflectionIridescence / refractionIridescence
  //   边缘    fringeCurve / fringeMix                      边缘光的收紧程度与强度
  //   调色    colorBoost / colorCurve / colorCurveR|G|B / maxColorValue
  //   烘焙    distancesFactor / resetDistances / uvShiftFactor / peaksFactor /
  //           convexityFactor / concavityFactor / colorFactor / decayFactor
  //
  // ⚠ 「烘焙」那一组直接乘在 .glb 里烘焙好的逐顶点属性上，7 个模型的烘焙
  //   数据各不相同，动它们容易把某一颗改花，本模板一律保持上游数值。
  //   其中 peaksFactor 特别容易误解 —— 它不是「棱峰锐度」，而是
  //   `mix(baseColor, peaksColor, _peaks * peaksFactor)` 里的混合权重，
  //   调高＝用 peaksColor 把 baseColor 盖掉，颜色反而更不分明。
  // ⚠ items 要么留空，要么恰好 7 条 —— 引擎用 crystalHovers.length 决定
  //   案例热区的数量，多一条少一条会和 7 个项目错位。
  // ⚠ 第 3 颗（items[2]）上游本来就没有 resetDistances 这一键，模板照原样
  //   保留。给它补上会凭空多一根弹簧，构建时会有告警提示。
  crystals: {
    palette: 'prism',

    // 静止态里 7 颗共用的那一份，例：base: { envRefraction: 0.3 }
    base: {},

    // 逐颗覆盖。留空 = 全用预设。
    // 例：items: [{ rest: { baseColor: '#E0BF85' }, hover: { baseColor: '#FFD166' } },
    //             {}, {}, {}, {}, {}, {}]
    items: [],
  },

  // ------------------------------------------------------------ 小动物
  // 首页那七个项目，默认不再是七颗水晶，而是七只程序化生成的磨砂小动物
  // （猫 / 兔 / 熊 / 狐狸 / 小鸡 / 鲸鱼 / 青蛙）。
  //
  // 它们不是模型文件：整只动物是一个有符号距离场（若干解析基元做光滑并集），
  // 在浏览器里现算成网格，法线取自 SDF 的解析梯度。所以仓库里没有几 MB 的
  // .glb，只有几十 KB 的参数化代码，换个体型也不用重新导出模型。
  //
  // 渲染管线也整个换掉了：上游水晶走的是「双渲染目标 + 法线贴图折射 + 峰线
  // 色散」，那是给凸多面体准备的，套在有机曲面上只会糊成半透明塑料。小动物
  // 走引擎的标准单通道路径，用一支自写的磨砂树脂着色器（竖直半透明渐变 +
  // wrap 漫反射 + 菲涅尔边缘 + 厚处更亮的 core 项，没有任何高光）。
  //
  // ⚠ 关掉它（enabled: false）就原样回到上游水晶，其余配置一概不受影响。
  // ⚠ 运行时抛任何异常也会自动回退到水晶 —— 装饰性改造不该能打黑整站。
  creatures: {
    enabled: true,

    // 网格精细度。SDF 体素边长 high 0.019 / medium 0.023 / low 0.027。
    // 七只合计的三角形数约 14 万 / 9.7 万 / 6.9 万，现算耗时约 1.5s / 0.8s /
    // 0.6s（一帧一只摊开做，加载页还在的时候基本就做完了）。
    // 着色是解析法线，降档只损失轮廓精度，不会出现硬边。
    detail: 'high',

    // 相对上游水晶包围盒的整体缩放。1 = 正好内接。相机运镜是编译死的，
    // 偏太多会拍到空处，所以只接受 0.5–1.5。
    scale: 1,

    // 本体色的来源：
    //   'species'  每只用自己调好的那套 pale/deep（默认，形状是在这套色下评审的）
    //   'palette'  从上面 crystals 的静止色现推，换调色板时小动物跟着换
    tint: 'species',

    // 跟随 crystals 的悬停颜色弹簧。开着的时候，鼠标划过某只动物，它会从
    // 静止色渐变到那颗水晶的悬停色 —— 这条联动是白拿的，引擎本来就有这根弹簧。
    follow: true,

    // 眼睛和鼻头（深色树脂 + 一点高光点）。关掉就是纯素体。
    eyes: true,

    // 往控制台打每只动物的顶点/三角形数与回退原因，排查用。
    debug: false,
  },

  // ------------------------------------------------------------ 场景素材
  // 这些路径是引擎「算」出来的（例如 `./models/crystal${i}.glb`），不是
  // 从字符串常量里读的，所以换素材的方式是**覆盖同名文件**：把下面的路径
  // 指向你自己的文件，构建时会拷贝成引擎期望的文件名。
  //
  // 换模型的硬性要求：必须是 Draco 压缩的 .glb，包围盒和原水晶接近，
  // 否则相机运镜（同样是编译好的）会拍到空处。换贴图没有这个限制。
  assets: {
    // 7 颗水晶，对应首页 7 个项目，顺序与 story.js 的 cases 一致。
    crystals: [
      { model: 'src/models/crystal0.glb', texture: 'src/textures/crystals/0.jpg' },
      { model: 'src/models/crystal1.glb', texture: 'src/textures/crystals/1.jpg' },
      { model: 'src/models/crystal2.glb', texture: 'src/textures/crystals/2.jpg' },
      { model: 'src/models/crystal3.glb', texture: 'src/textures/crystals/3.jpg' },
      { model: 'src/models/crystal4.glb', texture: 'src/textures/crystals/4.jpg' },
      { model: 'src/models/crystal5.glb', texture: 'src/textures/crystals/5.jpg' },
      { model: 'src/models/crystal6.glb', texture: 'src/textures/crystals/6.jpg' },
    ],

    // 环境光照贴图（HDR）。决定水晶的反射与整体色温，换它对画面影响最大。
    environment: 'src/textures/wooden_studio_19_1k.hdr',

    // 冰质材质的三张贴图
    ice: {
      color: 'src/textures/ice.jpg',
      normal: 'src/textures/icen.jpg',
      displacement: 'src/textures/iced.jpg',
    },

    // 音效：hover 是划过水晶的 5 个随机音，release 是首屏「释放」音。
    audio: {
      hover: [
        'src/audio/hover1.mp3',
        'src/audio/hover2.mp3',
        'src/audio/hover3.mp3',
        'src/audio/hover4.mp3',
        'src/audio/hover5.mp3',
      ],
      release: 'src/audio/ReleaseSpirit.mp3',
    },
  },
};

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
  // 要动 base，想改「划过时的样子」要动 items。这个模板两边都改了。
  //
  // ── 预设 ────────────────────────────────────────────────────
  //   'aurora'  极光虹彩（默认）—— 静止态给一层冷调通透玻璃，悬停态把 7 色
  //             重排到色轮上分得开的位置，并提高虹彩。
  //   'ice'     冰蓝 —— 7 颗统一收进蓝青区间，最贴品牌色，最克制。
  //   'jewel'   宝石 —— 同样的色相弧但压暗提饱和，像有色宝石而不是彩色玻璃。
  //   'legacy'  上游原样 —— 逐字节还原，一键回退。
  //   'custom'  完全自定义，此时 items 必须给满 7 条。
  //
  // ── base / items ────────────────────────────────────────────
  // base 覆盖静止态（7 颗共用），items[i] 覆盖第 i 颗的悬停态，都是在预设
  // 之上叠加，只写想改的键即可。可用的键（共 25 个）：
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
    palette: 'aurora',

    // 静止态覆盖（7 颗共用），例：base: { envRefraction: 0.3 }
    base: {},

    // 逐颗悬停态覆盖，例：items: [{ baseColor: '#FFD166' }, {}, {}, {}, {}, {}, {}]
    items: [],
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

import path from 'node:path'
import fs from 'node:fs'
import { parse as parseDotenv } from 'dotenv'
import { defineConfig } from '@tarojs/cli'
import devConfig from './dev'
import prodConfig from './prod'

/**
 * 把 .env* 里的 TARO_APP_* 读进 process.env。
 *
 * 为什么必须自己读一遍：
 * Taro CLI 虽然在解析 config 之前调了 dotenvParse()，但它是把结果挂在
 * `initialConfig.env` 上、走另一条链路注入 definePlugin 的；而
 * MiniWebpackPlugin.getDefinePlugin() 取的是 `combination.config.env`。
 * 实测这条路对我们的变量不生效（产物里 ASSET_BASE 恒为空串），
 * 于是这里在求值配置时直接把值写回 process.env —— Taro 随后构造
 * envConstants 时会从 process.env 读到它们，从而稳定注入。
 *
 * 加载顺序与 Taro 保持一致（后者覆盖前者）：
 *   .env < .env.local < .env.<mode> < .env.<mode>.local
 */
function loadTaroEnv(mode: string) {
  const root = path.resolve(__dirname, '..')
  const files = ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`]
  for (const f of files) {
    const p = path.join(root, f)
    if (!fs.existsSync(p)) continue
    const parsed = parseDotenv(fs.readFileSync(p))
    for (const [k, v] of Object.entries(parsed)) {
      if (k.startsWith('TARO_APP_')) process.env[k] = v
    }
  }
}

export default defineConfig(async (merge, { command, mode }) => {
  // mode 由 NODE_ENV 决定：`taro build` 为 production，`--watch` 为 development
  loadTaroEnv(mode || process.env.NODE_ENV || 'production')

  const baseConfig = {
    projectName: 'rental-taro-app',
    date: '2026-9-22',
    designWidth: 750,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      828: 1.81 / 2,
    },
    sourceRoot: 'src',
    // ⚠️ 支持用 TARO_OUTPUT_ROOT 临时改产物目录（默认 dist/<target>）。
    // 用途：当 dist/<target> 被开发者工具/编辑器持有句柄，或处于混合状态导致
    // 构建卡在 clean 阶段时，可用一个全新目录构建，验证是否与产物目录有关。
    outputRoot: process.env.TARO_OUTPUT_ROOT || `dist/${process.env.TARO_ENV}`,
    // ── 保留构建期不需要清的产物文件 ──────────────────────────────────
    // Taro 每次构建前会 `emptyDirectory(outputPath)` 把产物目录清空。
    // 但 `mini.project.json`（支付宝）/ 同类 IDE 配置文件常被**开发者工具或
    // 编辑器**持有句柄，删除会报 EBUSY / EPERM；在本沙箱环境里更会触发
    // `[safe-delete][SAFE_DELETE_BULK_GUARD_ERROR] state lock timeout`，
    // 直接把整个构建打断。
    //
    // 好在 Taro 提供了官方开关（见
    // @tarojs/service/dist/platform-plugin-base/mini.js）：
    //   output.clean === false        → 完全不清
    //   output.clean = { keep: [...] }→ 按路径子串/正则保留
    // 且这些文件每次构建都会被重新写出来，保留旧的无副作用。
    //
    // 这里用 keep 精确放行 `mini.project.json`，其余产物照常清空，
    // 以免旧文件残留导致「改了代码但产物没更新」的假象。
    plugins: [],
    // ⚠️ 关于 TARO_APP_* 变量注入的两条坑（都踩过，务必留意）：
    //
    // 1) Taro 注入 define 的顺序是 [envConstants, defineConstants, runtimeConstants]
    //    （见 @tarojs/webpack5-runner/dist/webpack/MiniWebpackPlugin.js getDefinePlugin），
    //    后面的对象会**覆盖**前面的。
    // 2) 实测 Taro 自己从 .env* 走 initialConfig.env → config.env 这条链路，
    //    在本项目里对我们的变量不生效（产物里恒为空串）。因此这里在
    //    loadTaroEnv() 已把值写进 process.env 之后，**显式**用 defineConstants
    //    补一次，靠「后写覆盖前写」确保注入正确。
    //
    // 值必须是**合法 JSON**：webpack 会把它当代码解析，字符串要带上引号，
    // 所以用 JSON.stringify 包一层（直接用裸字符串会报
    // "Invalid define value (must be an entity name or valid JSON syntax)"）。
    defineConstants: {
      'process.env.TARO_APP_API_BASE': JSON.stringify(
        process.env.TARO_APP_API_BASE || 'http://localhost:8080/api/v1'
      ),
      'process.env.TARO_APP_ASSET_BASE': JSON.stringify(
        process.env.TARO_APP_ASSET_BASE || 'http://localhost:8080/static'
      ),
      // 测试态登录旁路开关（后端 /app/auth/dev-login）。
      // ⚠️ 必须在这里显式声明 —— 本项目的 TARO_APP_* 注入只能走这条链路
      // （原因见上方注释：Taro 自带的 .env → initialConfig.env 这条路对本项目不生效）。
      // 漏掉的后果与之前一模一样：产物里留下 `process.env.TARO_APP_DEV_LOGIN` 字面量，
      // 小程序无 process 全局 → 恒为 undefined → 开关恒为默认值，改 .env 也不生效。
      'process.env.TARO_APP_DEV_LOGIN': JSON.stringify(
        process.env.TARO_APP_DEV_LOGIN || 'true'
      ),
    },
    // 路径别名：src 内统一用 @/ 引用（与 tsconfig.json 的 paths 保持一致）。
    // tsconfig 只影响 TS 类型解析，webpack 打包必须在此重复声明，否则运行期找不到模块。
    alias: {
      '@': path.resolve(__dirname, '..', 'src'),
    },
    copy: {
      patterns: [],
      options: {},
    },
    framework: 'react',
    compiler: {
      type: 'webpack5',
      prebundle: { enable: false },
    },
    cache: {
      enable: false,
    },
    mini: {
      // ── 构建前清空产物目录时，保留 IDE 配置类文件 ──────────────────────
      // Taro 每次构建前会 `emptyDirectory(outputPath)` 清空产物目录
      // （见 @tarojs/service/dist/platform-plugin-base/mini.js 的 setupImpl）。
      // 但 `mini.project.json` 常被**支付宝开发者工具 / 编辑器**持有句柄，
      // 删除会失败；在本环境里更会触发沙箱的
      //   [safe-delete][SAFE_DELETE_BULK_GUARD_ERROR] state lock timeout
      // 直接把构建打断（且该守卫一旦锁死，之后任何删除都失败）。
      // 好在 Taro 支持 `output.clean.keep` 跳过匹配路径的删除
      // （`clean:false` 则完全不清）。该文件每次构建都会重新生成，保留无副作用。
      //
      // ⚠️ 必须放在 **`mini` 里**，不能放配置顶层：
      // platform 插件读的是合并后的 `this.config.output`，
      // 而顶层 `output` 不在 Taro 的配置 schema 内，会被 merge 丢掉（实测为 undefined）。
      output: {
        // ⚠️ 关于产物清理的三个坑（这段说明请勿删）：
        //
        // ① `keep` 必须是 `RegExp | string | function` **单值**，不能是数组 ——
        //    该对象被原样透传给 webpack，传数组会报
        //    `configuration.output.clean.keep should be one of these: RegExp | string | function`。
        //
        // ② ★ `keep` **只能保护目录，对文件完全无效** —— 见
        //    `@tarojs/helper/dist/utils.js` 的 `emptyDirectory()`：
        //      if (lstatSync(curPath).isDirectory()) { ...检查 excludes... }
        //      else { fs.unlinkSync(curPath) }   // ← 文件无条件删除，不看 keep
        //    所以指望用 keep 保住 `project.config.json` / `mini.project.json`
        //    是**行不通的**（它们都是文件）。
        //
        // ③ 清理有两个删除源，都由 `output.clean` 控制：
        //    · Taro 的 `emptyOutputDir()`（构建开始）—— `clean === false` 时两个分支
        //      都不进，完全不清（见 @tarojs/service/.../mini.js 的 setupImpl）
        //    · webpack 的 `CleanPlugin`（emitting 阶段）—— 同样跟随 `output.clean`
        //    这两个源都会尝试删除 `project.config.json`（它由 platform plugin 在
        //    webpack **emit 之后**另行写出，不在 compilation assets 里）。
        //
        // ⚠️ 本机沙箱的批量删除守卫是**按 turn 累计**计数的（`scope:"turn"`,
        //    threshold 50）。一旦本 turn 累计删除超过 50 次，之后**任何**删除
        //    都会抛 `SAFE_DELETE_BULK_CONFIRM_REQUIRED` 中断构建 ——
        //    症状是构建卡在 Taro banner 之后或 `emitting` 阶段，无明显报错。
        //    此时临时改成 `clean: false` 即可构建成功（代价：旧产物残留）。
        clean: process.env.TARO_NO_CLEAN === '1'
          ? false
          : { keep: /(project\.config|mini\.project)\.json$/ },
      },
      // 小程序端 webpack 解析配置。
      //
      // ── 背景：@tanstack/* 的产物语法小程序引擎不认 ──────────────────────
      // @tanstack/query-core 只发两种产物（package.json exports 里 "." 指向 modern）：
      //   modern/ —— ES2022 私有字段 `#field`
      //   legacy/ —— 只把私有字段降级成 _classPrivateFieldGet2 辅助函数，
      //              但仍然保留 ES2020 的 `??`（空值合并）和 `?.`（可选链）
      // 两者都超出小程序引擎的语法支持范围：
      //   支付宝开发者工具 → CE1000.02 "Unexpected token"（定位到 legacy/mutation.js:107）
      //   微信开发者工具 → app.js 解析失败 → 整个应用挂不起来（白屏）
      //
      // ── 为什么不能只靠 alias 指到 legacy ────────────────────────────────
      // 试过，不够。legacy 里 `??` 仍在（dist 产物中 6 处），支付宝照样报错。
      // 根因是 Taro 默认只把 **src/ 与 路径含 "taro" 的 node_modules 包** 交给
      // babel（见 MiniWebpackModule.getScriptRule 的 rule.include），
      // @tanstack/* 不在其中，于是它的源码语法被原样搬进产物。
      //
      // ── 正式解法 ───────────────────────────────────────────────────────
      // 1) 用官方钩子 mini.compile.include 把 @tanstack 两个包加进 babel 的处理范围，
      //    让 babel 按 browserslist 把它们降级（`??` → 三元、`?.` → 条件表达式、
      //    私有字段 → WeakMap 辅助函数）。范围**必须收紧到这两个包**：
      //    曾试过放开整个 node_modules，构建时间从 ~40s 涨到 8min+。
      // 2) 同时仍把入口 alias 指向 legacy —— modern 里的私有字段形态更复杂
      //    （类字段初始化顺序依赖），babel 处理成本更高，legacy 已经帮我们做了一半。
      //    两者叠加，产物里 `??` / `#field` 均为 0，构建耗时可接受。
      //
      // 注意：alias 必须用「绝对路径」而不是包内相对子路径 —— @tanstack/* 的
      // package.json exports 只导出了 "."，写成
      // '@tanstack/react-query/build/legacy/index.js'
      // 会被 webpack 以 ModuleNotFoundError（not exported under the conditions）拒绝。
      compile: {
        include: [
          (filename: string) =>
            /[\\/]node_modules[\\/]@tanstack[\\/](react-query|query-core)[\\/]/.test(filename),
        ],
      },
      webpackChain(chain) {
        const rqLegacy = path.resolve(
          __dirname,
          '../node_modules/@tanstack/react-query/build/legacy/index.js'
        )
        const qcLegacy = path.resolve(
          __dirname,
          '../node_modules/@tanstack/query-core/build/legacy/index.js'
        )
        chain.resolve.alias
          .set('@tanstack/react-query$', rqLegacy)
          .set('@tanstack/query-core$', qcLegacy)

        // ── 省市区数据：只在支付宝端打包 ──────────────────────────────────
        //
        // 背景：支付宝**不支持** `<Picker mode="region">`（见
        // @tarojs/components/types/Picker.d.ts，mode 的 @supported 只有
        // weapp/h5/rn/harmony，不含 alipay），传了会静默退化成「年月日」选择器。
        // 所以支付宝改用 `my.multiLevelSelect`，而该 API 要求调用方自带数据，
        // 于是 `src/data/regionData.ts` 内置了一份完整的省市区表（23KB JSON 串，
        // 转成 list 结构 80KB）。
        //
        // 但**微信端完全用不到它**（原生 mode="region" 自带行政区划）。若不做处理，
        // 这 80KB 会随 `@/data/region` 一起打进 `weapp/common.js`
        // （实测：weapp/common.js 100.3KB 里绝大部分是这份数据）。
        //
        // 曾试过在 `platform.ts` 里写成
        //   TARO_ENV === 'alipay' ? require('@/data/region') : null
        // **无效** —— `require` 是静态模块引用，webpack 照样建立依赖并保留模块，
        // 死分支摇不掉（实测 weapp 包仍含数据）。
        //
        // 正式解法：构建期按平台把 `@/data/region` 指向不同实现。
        //   微信  → src/data/region.weapp.ts（空实现，不含数据）
        //   支付宝 → src/data/region.ts（真实现，含数据）
        // 这样微信产物里 `regionData.ts` 根本不在依赖图上，彻底不进包。
        chain.resolve.alias.set(
          '@/data/region$',
          process.env.TARO_ENV === 'alipay'
            ? path.resolve(__dirname, '../src/data/region.ts')
            : path.resolve(__dirname, '../src/data/region.weapp.ts')
        )

        // ── 支付宝端 `navigator` 守卫（白屏根因修复）──────────────────────
        //
        // 症状：支付宝开发者工具里只显示原生 tabBar，内容整片白屏；微信端正常。
        //
        // 根因：Taro 4.1.2 的**支付宝平台适配模块**（产物中 `taro` chunk 内，
        // `initNativeApi` 附近）有这么一段**无 typeof 守卫**的顶层代码：
        //
        //     L = navigator, I = L.userAgent;
        //     Object.defineProperty(navigator, "userAgent", { ... })
        //
        // 它想给 navigator.userAgent 打补丁（get 里回退到支付宝特有的
        // `navigator.swuserAgent`）。但**支付宝小程序基础库根本没有 navigator
        // 这个全局对象**（那是 webview 的 API；微信基础库额外注入了它，
        // 所以微信端一直没事）。于是 `L = navigator` 直接抛
        // `ReferenceError: navigator is not defined` → 该模块求值失败 →
        // 依赖它的 Taro 运行时初始化中断 → 页面组件从未注册 →
        // **只有原生 tabBar 能画出来，内容全白**。
        //
        // 为什么守卫必须注入到 `common` chunk 的最前面，而不是写在 app.tsx 里：
        // 产物 chunk 的加载顺序是 app.js 头部写死的
        //   require("./common"), require("./vendors"), require("./taro"), require("./runtime")
        // 而 app.tsx 的代码属于 app.js 自己的模块，**执行时机在这些 require 之后**。
        // 实测（scripts/probe-order.cjs）证明：把守卫放 app.tsx 顶层仍然太晚。
        // common 是第一个被加载的 chunk，插在它开头才能保证早于 taro chunk 中
        // 那个模块的求值。
        //
        // 兼容性：只在 `navigator` 缺失时补一个最小对象，已存在则原样不动
        // （微信端走这条分支，行为与改动前完全一致）。
        // 只提供 userAgent 字段 —— 这正是 Taro 那段代码需要的；
        // 值取支付宝特有的 `my.SDKVersion`（形如 "2.0"），拿不到就空串。
        //
        // 实现说明：不用 `BannerPlugin`。原因：webpack 的 BannerPlugin 在
        // PROCESS_ASSETS_STAGE_ADDITIONS 阶段改 assets，而 Taro 的
        // MiniSplitChunksPlugin（继承 SplitChunksPlugin）会在**更晚的阶段**
        // 用全新的 RawSource 覆写 `assets["common.js"]`，把 banner 冲掉。
        // 实测（dist/alipay/common.js 无 banner 痕迹）证实了这一点。
        // 因此改用一个自定义 processAssets 插件，放在
        // PROCESS_ASSETS_STAGE_OPTIMIZE_TRANSFER（晚于 Taro 的改写）之后，
        // 直接对最终产物字符串做前缀插入。
        //
        // ── 第二个白屏根因：`globalThis` 同样缺失 ──────────────────────────
        // 修掉 navigator 之后支付宝仍白屏，IDE 控制台给出：
        //
        //   ReferenceError: globalThis is not defined
        //     at Object._ (vendors.js:2:47363)
        //
        // 定位到 `@tanstack/query-core/build/legacy/utils.js:6`：
        //
        //   const isServer = typeof window === "undefined" || "Deno" in globalThis;
        //
        // 后半句 `"Deno" in globalThis` 是**裸引用**（没有 typeof 保护）。
        // 由于支付宝 2.10.15 基础库**提供了 `window`**，
        // 前半句 `typeof window === "undefined"` 为 false → `||` 继续求值右侧
        // → 抛 ReferenceError。整个 query-core 模块加载失败 → react-query 全挂。
        //
        // 产物里 `globalThis` 共出现 9 次，分布在 4 个 chunk：
        //   vendors.js ×2 —— `"Deno" in globalThis`、`globalThis.document?.visibilityState`
        //   common.js  ×2 —— `globalThis.my`（本项目支付代码），另一处是旧守卫自身
        //   app.js     ×1 —— `var e = globalThis; e.AbortController`
        //   runtime.js ×2 —— 用 `typeof globalThis` 包着，本来安全
        // 除 runtime.js 外**全都没有 typeof 保护**，因此必须在最前面把 globalThis 造出来。
        //
        // 安全性：这些引用要的都是「全局对象」本身，补一个指向真实全局对象的
        // `globalThis` 不会改变任何语义。且只在缺失时才补。
        //
        // ── 守卫实现的两个坑（都踩过，别改回去）────────────────────────────
        // 坑 1：**不能用 `"use strict"`**。严格模式下 IIFE 里的 `this` 是 undefined，
        //   而我们要靠 `this` 拿到真正的全局对象（见坑 2）。
        // 坑 2：**不能把 `window` 当成全局对象来挂属性**。支付宝虽然提供 `window`，
        //   但 `window !== 全局this`；往 window 上挂 `navigator` 后，
        //   产物的**裸引用** `navigator`（走作用域链到全局对象）依旧读不到，
        //   于是 `ReferenceError: navigator is not defined` 照旧。
        //   所以顺序必须是 **`this` 优先**（非严格 IIFE 的 this 就是全局对象），
        //   `window` 只作为最后兜底，并且最终还是挂到 `this` 上。
        //   实测：vm 里 `delete globalThis` 后 `(function(){this.navigator={...}})()`
        //   能让裸 `navigator` 解析成功；而挂到 `window` 上则不能。
        const GUARD_SNIPPET =
          '/* alipay-globals-guard: 支付宝基础库缺 navigator / globalThis，' +
          '而 vendored 依赖（@tanstack/query-core 等）会无守卫地引用它们（详见 config/index.ts 注释） */\n' +
          '(function(){' + // ← 故意不加 "use strict"，见上方坑 1
          // 解析真正的全局对象：this 优先（非严格 IIFE 的 this 即全局对象）
          'var g=this||' +
          '(typeof globalThis!=="undefined"&&globalThis)||' +
          '(typeof global!=="undefined"&&global)||' +
          '(typeof self!=="undefined"&&self)||' +
          '(typeof window!=="undefined"&&window);' +
          'if(!g){return;}' +
          // 1) 补 globalThis（支付宝基础库没有）
          'if(typeof globalThis==="undefined"){' +
          'try{g.globalThis=g;}catch(e){}' +
          '}' +
          // 2) 补 navigator（Taro 支付宝适配模块会无守卫地读写它）
          'if(typeof navigator==="undefined"){' +
          'var ua="";' +
          'try{ua=(typeof my!=="undefined"&&my&&my.SDKVersion)||"";}catch(e){ua="";}' +
          'var nav={userAgent:ua,swuserAgent:ua,platform:"",language:"zh-Hans"};' +
          'try{g.navigator=nav;}catch(e){}' +
          // 若 window 存在但与全局对象不同，两边都挂，避免某些代码走 window.navigator
          'try{if(typeof window!=="undefined"&&window&&window!==g){window.navigator=nav;}}catch(e){}' +
          '}' +
          '})();'

        if (process.env.TARO_ENV === 'alipay') {
          chain.plugin('alipay-globals-guard').use({
            apply(compiler: any) {
              const { Compilation, sources } = require('webpack')
              compiler.hooks.compilation.tap(
                'alipay-globals-guard',
                (compilation: any) => {
                  compilation.hooks.processAssets.tap(
                    {
                      name: 'alipay-globals-guard',
                      // 必须晚于 MiniSplitChunksPlugin 的改写阶段
                      stage: Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_TRANSFER + 1,
                    },
                    (assets: Record<string, any>) => {
                      for (const name of Object.keys(assets)) {
                        if (!/(^|[\\/])common\.js$/.test(name)) continue
                        const original = assets[name].source().toString()
                        if (original.includes('alipay-globals-guard')) continue
                        compilation.updateAsset(
                          name,
                          new sources.RawSource(GUARD_SNIPPET + '\n' + original)
                        )
                      }
                    }
                  )
                }
              )
            },
          })
        }
      },
      postcss: {
        pxtransform: { enable: true, config: {} },
        url: { enable: true, config: { limit: 1024 } },
        cssModules: { enable: false },
      },
    },
    h5: {
      publicPath: '/',
      staticDirectory: 'static',
      esnextModules: ['@nutui/nutui-react-taro'],
      postcss: {
        autoprefixer: { enable: true, config: {} },
        cssModules: { enable: false },
      },
    },
  }

  if (process.env.NODE_ENV === 'development') {
    return merge({}, baseConfig, devConfig)
  }
  return merge({}, baseConfig, prodConfig)
})

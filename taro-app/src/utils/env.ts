/**
 * 读取 Taro 自定义环境变量。
 *
 * ⚠️ 关键约束：必须用**静态字面量**访问 `process.env.TARO_APP_XXX`。
 *
 * Taro/webpack 的 define 替换是**纯文本替换**：只有源码里原样写出
 * `process.env.TARO_APP_API_BASE` 这样的完整成员表达式，才会被替换成
 * 构建期的字面量。写成 `process.env[key]`（动态取值）**不会**被替换，
 * 产物里会保留对 `process.env` 的运行时读取 —— 而小程序没有 process 全局，
 * 于是 `typeof process === 'undefined'` 恒成立，永远只能拿到 fallback。
 *
 * 这正是一开始「接口地址没生效 / 图片路径为空」的原因：
 * 传进来的 key 是变量，替换不了，assetUrl 只能吃默认值。
 *
 * 因此这里不用 map 做通用读取，改为显式枚举每个变量。
 */

/**
 * ⚠️ 默认值一律用 `127.0.0.1`，不要用 `localhost`。
 *
 * 原因（微信开发者工具实测踩坑）：
 * - `localhost` 要走 DNS 解析，Windows 上可能优先解析到 IPv6 `::1`；
 *   后端 Go 用 `addr = ":8080"` 起来时 netstat 看到的是 `0.0.0.0:8080`（IPv4 通配），
 *   一旦工具连的是 `::1` 就会直接失败 —— 且**后端日志一条都不会有**，
 *   表现就是「后端明明在跑，但小程序加载不出数据」。
 * - 部分机器配了系统代理，`localhost` 会被代理规则拦下，而 `127.0.0.1`
 *   通常在代理绕过名单里。
 * - `127.0.0.1` 是纯 IP，不解析、不进代理、无 IPv6 歧义，最稳。
 *
 * 真机预览时把它换成开发机局域网 IP（手机访问不到 127.0.0.1）。
 */

// 后端 API 前缀
export const API_BASE = process.env.TARO_APP_API_BASE || 'http://127.0.0.1:8080/api/v1'

// 静态资源前缀（后端 storage.base_url = "/static"）
export const ASSET_BASE = process.env.TARO_APP_ASSET_BASE || 'http://127.0.0.1:8080/static'

/**
 * 是否启用「测试态登录旁路」（后端 /app/auth/dev-login）。
 *
 * ⚠️ 为什么不用 `process.env.NODE_ENV !== 'production'` 来判断 —— 这是个真实的坑：
 * 本项目的打包命令是 `npm run build:weapp` → `taro build`，
 * 而 **`taro build` 会把 NODE_ENV 固定设为 `production`**（只有 `--watch` 才是 development）。
 * 也就是说日常联调用的就是 production 构建，`NODE_ENV` 判断**永远是 false**，
 * 旁路根本进不去 —— 表现为「一键登录点下去只有 400，界面毫无反应」。
 *
 * 正确做法：用一个**语义明确**的独立开关，由构建命令显式指定，
 * 而不是借用 `NODE_ENV` 去反推意图。
 *
 * 取值来自 `.env` 系列文件的 `TARO_APP_DEV_LOGIN`，**必须是静态字面量访问**
 * （原因见文件顶部注释：动态 key 不会被 define 替换，小程序里读不到）。
 * 默认 `true`：本项目当前定位是**本地联调**，默认走旁路最省事；
 * 正式发包时在 `.env.production` 里显式写 `TARO_APP_DEV_LOGIN=false` 关闭。
 */
export const DEV_LOGIN_ENABLED = (process.env.TARO_APP_DEV_LOGIN || 'true') !== 'false'

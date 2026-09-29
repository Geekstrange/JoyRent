/**
 * 产物自检：构建完之后跑一遍，确认 dist 里没有小程序引擎不认的语法。
 *
 * 用法：
 *   node scripts/check-dist.mjs           # 两个端都查
 *   node scripts/check-dist.mjs weapp     # 只查微信
 *
 * 为什么需要它：
 *   小程序引擎（尤其支付宝）对语法支持比浏览器窄。一旦某个第三方包的产物里
 *   残留了 `??` / `?.` / 私有字段，构建**依然会成功**，但开发者工具打开时报
 *   CE1000.02（支付宝）或直接白屏（微信）。构建日志里看不出任何异常，
 *   所以必须在构建后单独扫一遍产物。
 *
 * 比 grep 更硬的判据：用 JS 引擎真的去 parse 每个 .js ——
 *   能抓出 grep 正则漏掉的语法不兼容。
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const targets = process.argv[2] ? [process.argv[2]] : ['weapp', 'alipay']

/**
 * 期望注入到产物里的构建期字面量。
 *
 * 不能直接写死 —— 一旦有人改了 .env 里的地址（比如真机调试换成局域网 IP），
 * 写死的期望值就会误报。这里改成从 .env* 里读实际配置：
 * 按 `taro build` 的生效顺序 .env < .env.local < .env.<mode> < .env.<mode>.local 取最后一个值，
 * 与 config/index.ts 里 loadTaroEnv() 的逻辑保持一致。
 */
function readEnvValue(key) {
  let value = ''
  for (const f of ['.env', '.env.local', '.env.production', '.env.production.local']) {
    const p = path.join(ROOT, f)
    if (!fs.existsSync(p)) continue
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][\w]*)\s*=\s*(.*)\s*$/)
      if (m && m[1] === key) value = m[2].trim()
    }
  }
  return value
}

const EXPECT_API = readEnvValue('TARO_APP_API_BASE')
const EXPECT_ASSET = readEnvValue('TARO_APP_ASSET_BASE')

if (!EXPECT_API || !EXPECT_ASSET) {
  console.log('✗ 读不到 TARO_APP_API_BASE / TARO_APP_ASSET_BASE，请检查 .env* 文件。')
  process.exit(1)
}

let failed = false

for (const target of targets) {
  const dist = path.join(ROOT, 'dist', target)
  console.log(`\n═══════ ${target} ═══════`)

  if (!fs.existsSync(dist)) {
    console.log(`  ✗ 产物目录不存在：${dist}（先跑 npm run build:${target}）`)
    failed = true
    continue
  }

  let parseFail = 0
  let nullish = 0
  let privateField = 0
  let processEnv = 0
  let fileCount = 0
  let allCode = ''

  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name)
      if (fs.statSync(p).isDirectory()) {
        walk(p)
        continue
      }
      if (!name.endsWith('.js')) continue

      const src = fs.readFileSync(p, 'utf8')
      fileCount += 1
      allCode += src

      // 1) 真语法解析 —— 最硬的判据
      try {
        new Function(src)
      } catch (e) {
        parseFail += 1
        console.log(`  ✗ 语法解析失败：${path.relative(ROOT, p)} → ${e.message.slice(0, 100)}`)
      }

      // 2) ES2020 空值合并 / 可选链 —— legacy 构建的重灾区
      nullish += (src.match(/\?\?/g) || []).length

      // 3) ES2022 私有字段。
      //    注意不能简单 grep '#xxx'：产物里的 '#' 大多是十六进制色值（#ffffff、
      //    tabBar 的 #1677ff）、'//#region' 注释、'#text' 节点名，全都会误报。
      //    这里要求 '#' 前面不是引号/字词字符，后面紧跟赋值或语句分隔符。
      privateField += (src.match(/(^|[^"'\w])#[A-Za-z_]\w*\s*[=;(]/g) || []).length

      // 4) process.env 残留 —— 小程序没有 process 全局，残留即启动崩溃（白屏）
      processEnv += (src.match(/process\.env/g) || []).length
    }
  }
  walk(dist)

  const apiOk = allCode.includes(EXPECT_API)
  const assetOk = allCode.includes(EXPECT_ASSET)

  const mark = (ok) => (ok ? '✓' : '✗')
  console.log(`  ${mark(parseFail === 0)} 语法解析失败   : ${parseFail}`)
  console.log(`  ${mark(nullish === 0)} ?? 空值合并残留 : ${nullish}`)
  console.log(`  ${mark(privateField === 0)} 私有字段残留   : ${privateField}`)
  console.log(`  ${mark(processEnv === 0)} process.env 残留: ${processEnv}`)
  console.log(`  ${mark(apiOk)} API 地址字面量 : ${apiOk ? EXPECT_API : '未找到！'}`)
  console.log(`  ${mark(assetOk)} 资源前缀字面量: ${assetOk ? EXPECT_ASSET : '未找到！'}`)
  console.log(`  （共扫描 ${fileCount} 个 .js 文件）`)

  if (parseFail || nullish || privateField || processEnv || !apiOk || !assetOk) {
    failed = true
  }
}

console.log('')
if (failed) {
  console.log('✗ 自检未通过 —— 详见上面标 ✗ 的项。')
  console.log('  常见原因：某个依赖的产物语法没降级（见 config/index.ts 的 mini.compile.include），')
  console.log('  或 .env* 里缺了 TARO_APP_* 变量（会导致 API 字面量缺失 + process.env 残留）。')
  process.exit(1)
}
console.log('✓ 全部通过：产物语法与注入地址均正确。')

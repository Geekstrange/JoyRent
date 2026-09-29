#!/usr/bin/env node
/**
 * JoyRent 用户端（微信/支付宝小程序）API 冒烟测试
 * ---------------------------------------------------------------
 * 直接对后端 http://localhost:8080/api/v1 发真实 HTTP 请求，
 * 覆盖小程序端 `src/services/api/*` 里声明的全部接口契约。
 *
 * 用法：
 *   node smoke-api.mjs                      # 默认 localhost:8080
 *   BASE=http://1.2.3.4:8080 node smoke-api.mjs
 *
 * 前置条件：后端以 debug 模式启动且 allow_dev_login = true
 *          （测试态登录旁路 POST /app/auth/dev-login）。
 *
 * 退出码：0 = 全绿；1 = 有失败项。
 */

const BASE = process.env.BASE || 'http://127.0.0.1:8080'
const API = `${BASE}/api/v1`
const TIMEOUT = 15000

// ---------- 断言与统计 ----------
let passed = 0
let failed = 0
const failures = []
let currentGroup = ''

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', red: '\x1b[31m',
  green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m',
}

function group(name) {
  currentGroup = name
  console.log(`\n${C.bold}${C.cyan}▌ ${name}${C.reset}`)
}

function ok(label, extra = '') {
  passed++
  console.log(`  ${C.green}✓${C.reset} ${label}${extra ? ` ${C.dim}${extra}${C.reset}` : ''}`)
}

function bad(label, detail) {
  failed++
  failures.push(`[${currentGroup}] ${label} — ${detail}`)
  console.log(`  ${C.red}✗ ${label}${C.reset}\n      ${C.dim}${detail}${C.reset}`)
}

/** 断言辅助：cond 为真则 pass，否则 fail */
function check(cond, label, detail = '') {
  if (cond) ok(label)
  else bad(label, detail || '断言失败')
  return !!cond
}

function eq(actual, expected, label) {
  return check(
    actual === expected, label,
    `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`
  )
}

// ---------- HTTP ----------
async function call(method, path, { body, token, raw } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), TIMEOUT)
  try {
    const res = await fetch(API + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ac.signal,
    })
    const text = await res.text()
    let json = null
    try { json = text ? JSON.parse(text) : null } catch { /* 非 JSON */ }
    return { status: res.status, body: json, text, raw }
  } catch (e) {
    return { status: 0, body: null, text: String(e), error: e }
  } finally {
    clearTimeout(timer)
  }
}

const get = (p, o) => call('GET', p, o)
const post = (p, o) => call('POST', p, o)

/** 期望成功：HTTP 2xx 且 body.code === 0 */
async function expectOK(method, path, opts = {}) {
  const r = await call(method, path, opts)
  if (r.status >= 200 && r.status < 300 && r.body?.code === 0) {
    return { ok: true, data: r.body.data, status: r.status }
  }
  return {
    ok: false, status: r.status, body: r.body, text: r.text,
    reason: r.error ? `请求异常: ${r.text}` : `HTTP ${r.status} / ${r.body?.message ?? r.text?.slice(0, 120)}`,
  }
}

/** 期望失败：返回实际状态与消息 */
async function expectFail(method, path, opts = {}) {
  const r = await call(method, path, opts)
  const isFail = !(r.status >= 200 && r.status < 300 && r.body?.code === 0)
  return { ok: isFail, status: r.status, message: r.body?.message ?? r.text, data: r.body?.data }
}

// ---------- 管理员辅助 ----------
// 发票接口要求订单处于 paid/renting/returned/closed，而支付回调在本地联调环境
// 不存在（渠道未配置），因此这里用管理员流转接口把订单推进到 paid，模拟支付成功。
// 管理员账号来自 migrations/000001_init.up.sql 的种子数据。
const ADMIN_USER = process.env.ADMIN_USER || 'admin'
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123'

async function adminLogin() {
  const r = await expectOK('POST', '/admin/login', {
    body: { username: ADMIN_USER, password: ADMIN_PASS },
  })
  return r.ok ? r.data?.token : null
}

/** 把订单推进到指定状态，返回是否成功 */
async function advanceOrder(adminToken, orderId, next) {
  const r = await expectOK('POST', `/admin/orders/${orderId}/transition`, {
    token: adminToken,
    body: { next },
  })
  return r
}

// ---------- 日期工具 ----------
const fmt = (d) => d.toISOString().slice(0, 10)
const dayFromNow = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return fmt(d)
}

// 冒烟测试会真实写占用记录且不做清理。为让重复运行互不干扰，
// 下单窗口在“未来 60~300 天”区间内按分钟轮转，保证每次运行的租期基本不重叠。
const runOffset = 60 + (Math.floor(Date.now() / 60000) % 240)
const orderWindow = { start: dayFromNow(runOffset), end: dayFromNow(runOffset + 3) }

// =================================================================
// 主流程
// =================================================================
async function main() {
  console.log(`${C.bold}JoyRent 用户端 API 冒烟测试${C.reset}`)
  console.log(`${C.dim}target: ${API}${C.reset}`)

  // ---------- 0. 服务健康 ----------
  group('0. 服务可用性')
  {
    // /health 挂在根路径，不在 /api/v1 下
    const r = await fetch(`${BASE}/health`).then(
      async (res) => ({ status: res.status, body: await res.json().catch(() => null) }),
      (e) => ({ status: 0, body: null, err: e })
    )
    check(r.status === 200 && r.body?.data?.status === 'ok', 'GET /health 返回 ok',
      `HTTP ${r.status} ${r.err ?? ''}`)
  }

  // ---------- 1. 公开接口（免登录） ----------
  group('1. 公开接口（免登录，对应 pages/index、pages/category、pages/equipment）')
  let equipmentId = null
  {
    const r = await expectOK('GET', '/app/equipments', {})
    if (check(r.ok, 'GET /app/equipments 设备列表', r.reason)) {
      const list = r.data
      check(Array.isArray(list), '返回数组')
      if (check(list.length > 0, '至少有 1 台设备', `实际 ${list?.length} 条`)) {
        const e = list[0]
        const fields = ['id', 'name', 'daily_cents', 'deposit_cents', 'total', 'cover_path']
        const missing = fields.filter((f) => e[f] === undefined)
        check(missing.length === 0, '设备字段完整（前端 Equipment 接口契约）',
          `缺少字段: ${missing.join(', ')}`)

        // 下单测试选库存最大的设备：冒烟测试会真实占用单元且不清理，
        // 选 total 最大的能显著降低重复运行把库存耗尽的概率。
        const biggest = [...list].sort((a, b) => (b.total ?? 0) - (a.total ?? 0))[0]
        equipmentId = biggest.id
        ok('选定下单测试设备', `id=${biggest.id} ${biggest.name} total=${biggest.total}`)
      }
    }
  }
  {
    const r = await expectOK('GET', '/app/equipments/categories')
    if (check(r.ok, 'GET /app/equipments/categories 分类列表', r.reason)) {
      check(Array.isArray(r.data) && r.data.length > 0, '返回非空分类数组',
        `实际 ${r.data?.length} 条`)
    }
  }

  // ── 回归：前端序列化占位符 "undefined" 不能被当成有效筛选值 ──
  // 历史 bug：小程序 Taro.request 把 GET data 里 undefined 值的字段
  // 序列化成字符串 "undefined"（?category_id=undefined&keyword=undefined），
  // 后端拿它当关键词执行 ILIKE '%undefined%' → 0 条命中 → 前端显示
  // 「没有找到匹配的设备」，而库里明明有数据。这里锁死该契约。
  {
    const r = await expectOK('GET', '/app/equipments?category_id=undefined&keyword=undefined')
    if (check(r.ok, '脏值参数 category_id=undefined&keyword=undefined 被忽略', r.reason)) {
      check(Array.isArray(r.data) && r.data.length > 0,
        '脏值参数不应过滤掉全部数据', `实际 ${r.data?.length} 条`)
    }
  }
  {
    const r = await expectOK('GET', '/app/equipments?keyword=undefined')
    if (check(r.ok, '脏值参数 keyword=undefined 被忽略', r.reason)) {
      check(Array.isArray(r.data) && r.data.length > 0,
        'keyword=undefined 不应返回空', `实际 ${r.data?.length} 条`)
    }
  }
  {
    // 空列表必须返回 []，不能返回 null。Go 的 nil slice 默认序列化成 null，
    // 前端拿到后 `data || []` 兜底会让「空」和「字段缺失」在日志里无法区分
    // （typeof null === 'object'），排查时看不出区别。
    const r = await expectOK('GET', '/app/equipments?category_id=99999999')
    if (check(r.ok, '真空结果请求成功', r.reason)) {
      check(Array.isArray(r.data), '空列表必须返回 [] 而不是 null',
        `实际类型 ${r.data === null ? 'null' : typeof r.data}`)
      check(r.data.length === 0, '空列表长度为 0', `实际 ${r.data?.length} 条`)
    }
  }
  {
    const r = await expectOK('GET', `/app/equipments/${equipmentId}`)
    if (check(r.ok, `GET /app/equipments/${equipmentId} 设备详情`, r.reason)) {
      check(Array.isArray(r.data?.units) || r.data?.id === equipmentId,
        '详情返回设备对象')
    }
  }
  {
    const start = dayFromNow(1), end = dayFromNow(4)
    const r = await expectOK(
      'GET', `/app/equipments/${equipmentId}/availability?start=${start}&end=${end}`)
    if (check(r.ok, `GET availability 按租期查可用量（${start} ~ ${end}）`, r.reason)) {
      check(typeof r.data?.available === 'number', 'available 为数字',
        `实际 ${JSON.stringify(r.data)}`)
    }
  }
  {
    const r = await expectOK('GET', `/app/equipments/${equipmentId}/availability?days=14`)
    if (check(r.ok, 'GET availability?days=14（前端 getAvailability 调用形式）', r.reason)) {
      check(Array.isArray(r.data) && r.data.length > 0, '返回每日可用量数组',
        `实际 ${JSON.stringify(r.data)?.slice(0, 100)}`)
    }
  }
  {
    const r = await expectFail('GET', `/app/equipments/${equipmentId}/availability?start=bad&end=worse`)
    eq(r.status, 400, '日期格式错误返回 400')
  }
  {
    const r = await expectFail('GET', '/app/equipments/99999999')
    check(r.status === 404, '不存在的设备返回 404', `实际 HTTP ${r.status}`)
  }

  // ---------- 2. 鉴权边界 ----------
  group('2. 鉴权边界（未登录访问受保护接口）')
  for (const p of ['/app/me', '/app/orders', '/app/invoices']) {
    const r = await expectFail('GET', p)
    eq(r.status, 401, `GET ${p} 未带 token 应 401`)
  }
  {
    const r = await expectFail('GET', '/app/me', { token: 'not-a-real-jwt' })
    eq(r.status, 401, 'GET /app/me 伪造 token 应 401')
  }

  // ---------- 3. 登录 ----------
  group('3. 登录（测试态旁路 POST /app/auth/dev-login）')
  let userToken = ''
  let userId = null
  {
    // ⚠️ 期望 **400**，不是 500。
    // 「未配置 app_id/app_secret」属于**本地配置缺失**，不是服务端故障：
    // 后端用 ErrWechatNotConfigured 哨兵把它映射成 400 + 可操作提示，
    // 前端据此才能自动回落到 dev-login 旁路。若这里返回 500，
    // 会被误判成「后端崩了」，排查方向就全错了。
    const r = await expectFail('POST', '/app/auth/wechat', { body: { code: 'x' } })
    check(r.status === 400, '微信登录未配置 app_secret 时返回 400（配置缺失，非服务端故障）',
      `实际 HTTP ${r.status} / ${r.message}`)
  }
  {
    // 支付宝登录同样是「配置缺失/TODO」性质，也应为 400。
    const r = await expectFail('POST', '/app/auth/alipay', { body: { code: 'x' } })
    check(r.status === 400, '支付宝登录未实现时返回 400（TODO，非服务端故障）',
      `实际 HTTP ${r.status} / ${r.message}`)
  }
  {
    const r = await expectOK('POST', '/app/auth/dev-login', {
      body: { platform: 'wechat', code: 'smoke_main' },
    })
    if (check(r.ok, 'dev-login（wechat）签发 token', r.reason)) {
      userToken = r.data?.token
      userId = r.data?.user?.id
      check(!!userToken && userToken.length > 20, 'token 非空且长度合理',
        `长度 ${userToken?.length}`)
      eq(r.data?.user?.platform, 'wechat', 'user.platform = wechat')
    }
  }
  {
    // 幂等：同一 code 再登录应拿到同一 user.id
    const r = await expectOK('POST', '/app/auth/dev-login', {
      body: { platform: 'wechat', code: 'smoke_main' },
    })
    check(r.ok && r.data?.user?.id === userId, 'dev-login 幂等（同 code → 同 user.id）',
      `首次 id=${userId}，再次 id=${r.data?.user?.id}`)
  }
  {
    const r = await expectFail('POST', '/app/auth/dev-login', {
      body: { platform: 'wechat', code: '' },
    })
    check(r.status === 400, 'dev-login 空 code 返回 400', `实际 HTTP ${r.status}`)
  }
  {
    const r = await expectOK('POST', '/app/auth/dev-login', {
      body: { platform: 'alipay', code: 'smoke_alipay' },
    })
    check(r.ok && r.data?.user?.platform === 'alipay',
      'dev-login（alipay）可签发 token', r.reason)
  }

  // ---------- 4. 当前用户 ----------
  group('4. 当前用户 /app/me')
  {
    const r = await expectOK('GET', '/app/me', { token: userToken })
    if (check(r.ok, 'GET /app/me 带 token 返回用户', r.reason)) {
      eq(r.data?.id, userId, '返回的 id 与登录一致')
      check(r.data?.status === 'active', 'status = active')
    }
  }

  // ---------- 5. 下单 ----------
  group('5. 下单（对应 pages/equipment 立即租用）')
  let orderId = null

  // 下单必须先有收货地址（后端强校验 address_id）。
  // 这里先建一条，随后在 5c 里验证快照与归属。
  let addrId = null
  {
    const r = await expectOK('POST', '/app/addresses', {
      token: userToken,
      body: {
        receiver: '张三',
        phone: '13800000001',
        province: '广东省',
        city: '深圳市',
        district: '南山区',
        detail: '科技园路 1 号',
      },
    })
    if (check(r.ok, 'POST /app/addresses 先建一条收货地址供下单', r.reason)) {
      addrId = r.data?.id
      check(!!addrId, '返回 address.id')
    }
  }
  {
    const start = orderWindow.start, end = orderWindow.end
    const r = await expectOK('POST', '/app/orders', {
      token: userToken,
      body: { equipment_id: equipmentId, start_at: start, end_at: end, address_id: addrId },
    })
    if (check(r.ok, `POST /app/orders 创建订单（${start} ~ ${end}）`, r.reason)) {
      orderId = r.data?.id
      check(!!orderId, '返回 order.id')
      eq(r.data?.equipment_id, equipmentId, 'equipment_id 回显正确')
      eq(r.data?.user_id, userId, 'user_id 归属当前用户')
      check(typeof r.data?.rent_cents === 'number' && r.data.rent_cents > 0,
        '已计算租金 rent_cents', `rent_cents=${r.data?.rent_cents}`)
      check(typeof r.data?.deposit_cents === 'number', '已带出押金 deposit_cents',
        `deposit_cents=${r.data?.deposit_cents}`)
      check(!!r.data?.no, '已生成订单号 no', `no=${r.data?.no}`)
      check(!!r.data?.status, '初始 status 非空', `status=${r.data?.status}`)
      check(!!r.data?.unit_id, '已分配具体设备单元 unit_id', `unit_id=${r.data?.unit_id}`)
    }
  }
  {
    const r = await expectFail('POST', '/app/orders', {
      token: userToken,
      body: { equipment_id: equipmentId, start_at: 'bad-date', end_at: 'worse', address_id: addrId },
    })
    eq(r.status, 400, '日期格式错误返回 400')
  }
  {
    const r = await expectFail('POST', '/app/orders', { body: { equipment_id: equipmentId } })
    eq(r.status, 401, '未登录下单返回 401')
  }
  {
    // 缺 address_id 必须被拦下，且给出可操作的中文提示。
    // ⚠️ 这里锁死「不是通用的『参数错误』」—— 早期把 binding:"required" 加在
    // int64 上会导致 address_id=0 被判为「缺失」并返回笼统的参数错误，
    // 用户完全不知道该去补什么。校验下沉到 service 后才有明确文案。
    const r = await expectFail('POST', '/app/orders', {
      token: userToken,
      body: { equipment_id: equipmentId, start_at: orderWindow.start, end_at: orderWindow.end },
    })
    eq(r.status, 400, '未传 address_id 返回 400')
    check(/收货地址/.test(r.message || ''), '给出「收货地址」相关的中文提示',
      `实际 message=${JSON.stringify(r.message)}`)
  }
  {
    // 传一个不存在的地址 id：必须是「地址不存在」，而不是悄悄下单成功
    const r = await expectFail('POST', '/app/orders', {
      token: userToken,
      body: {
        equipment_id: equipmentId,
        start_at: orderWindow.start,
        end_at: orderWindow.end,
        address_id: 99999999,
      },
    })
    eq(r.status, 400, 'address_id 不存在返回 400')
    check(/不存在/.test(r.message || ''), '提示地址不存在',
      `实际 message=${JSON.stringify(r.message)}`)
  }

  // ---------- 5b. 收货信息快照 ----------
  group('5b. 订单收货信息快照（不随地址簿变动）')
  {
    const r = await expectOK('GET', `/app/orders/${orderId}`, { token: userToken })
    if (check(r.ok, 'GET 订单详情带出收货信息', r.reason)) {
      eq(r.data?.receiver, '张三', 'receiver 快照正确')
      eq(r.data?.phone, '13800000001', 'phone 快照正确')
      check(
        typeof r.data?.address === 'string' && r.data.address.includes('广东省') &&
          r.data.address.includes('南山区') && r.data.address.includes('科技园路 1 号'),
        'address 为拼好的完整地址', `address=${JSON.stringify(r.data?.address)}`
      )
    }
  }

  // ---------- 6. 订单查询 ----------
  group('6. 订单列表与详情')
  {
    const r = await expectOK('GET', '/app/orders', { token: userToken })
    if (check(r.ok, 'GET /app/orders 我的订单列表', r.reason)) {
      check(Array.isArray(r.data), '返回数组')
      const hit = r.data?.find((o) => o.id === orderId)
      check(!!hit, '刚创建的订单出现在列表中', `列表 ${r.data?.length} 条`)
      if (r.data?.some((o) => o.user_id !== userId)) {
        bad('订单列表只包含自己的订单', '出现他人订单，存在越权风险')
      } else ok('订单列表已按当前用户隔离')
    }
  }
  {
    const r = await expectOK('GET', `/app/orders/${orderId}`, { token: userToken })
    if (check(r.ok, `GET /app/orders/${orderId} 订单详情`, r.reason)) {
      eq(r.data?.id, orderId, '详情 id 一致')
      const fields = ['no', 'status', 'dep_status', 'start_at', 'end_at', 'days',
        'rent_cents', 'deposit_cents']
      const missing = fields.filter((f) => r.data[f] === undefined)
      check(missing.length === 0, '订单字段完整（前端 Order 接口契约）',
        `缺少: ${missing.join(', ')}`)
    }
  }
  {
    const r = await expectFail('GET', '/app/orders/99999999', { token: userToken })
    check(r.status === 404 || r.status === 403, '不存在的订单返回 404/403',
      `实际 HTTP ${r.status}`)
  }

  // ---------- 7. 支付下单 ----------
  group('7. 发起支付（对应 requestPayment / tradePay）')
  {
    const r = await expectOK('POST', `/app/orders/${orderId}/pay`, {
      token: userToken, body: { channel: 'wechat' },
    })
    if (check(r.ok, 'POST /app/orders/:id/pay 微信渠道', r.reason)) {
      check(r.data?.params && typeof r.data.params === 'object',
        '返回支付参数 params', `实际 ${JSON.stringify(r.data)?.slice(0, 120)}`)
    }
  }
  {
    const r = await expectOK('POST', `/app/orders/${orderId}/pay`, {
      token: userToken, body: { channel: 'alipay' },
    })
    check(r.ok, 'POST /app/orders/:id/pay 支付宝渠道', r.reason)
  }
  {
    const r = await expectFail('POST', `/app/orders/${orderId}/pay`, {
      token: userToken, body: { channel: 'paypal' },
    })
    check(r.status === 400 || r.status === 409, '未知支付渠道被拒绝',
      `实际 HTTP ${r.status} / ${r.message}`)
  }

  // ---------- 8. 发票 ----------
  group('8. 发票（对应 packageOrder/invoice-*）')
  let invoiceId = null
  {
    // 开票要求订单已支付；本地无支付回调，用管理员流转把订单推进到 paid
    const adminToken = await adminLogin()
    if (check(!!adminToken, '管理员登录（用于推进订单状态）')) {
      const adv = await advanceOrder(adminToken, orderId, 'paid')
      check(adv.ok, `订单推进到 paid（admin transition）`, adv.reason || '')
      const d = await expectOK('GET', `/app/orders/${orderId}`, { token: userToken })
      eq(d.data?.status, 'paid', '订单状态确认为 paid')
    }
  }
  {
    const r = await expectOK('POST', '/app/invoices', {
      token: userToken,
      body: {
        order_id: orderId, type: 'personal',
        title: '冒烟测试个人', email: 'smoke@example.com',
      },
    })
    if (check(r.ok, 'POST /app/invoices 申请个人发票', r.reason)) {
      invoiceId = r.data?.id
      check(!!invoiceId, '返回 invoice.id')
      eq(r.data?.status, 'pending', '初始 status = pending')
    }
  }
  {
    const r = await expectFail('POST', '/app/invoices', {
      token: userToken,
      body: { order_id: orderId, type: 'personal', title: '重复', email: 'a@b.com' },
    })
    check(r.status === 409, '同一订单重复申请发票被拒（409）',
      `实际 HTTP ${r.status} / ${r.message}`)
  }
  {
    const r = await expectFail('POST', '/app/invoices', {
      token: userToken,
      body: { order_id: orderId, type: 'company', title: '缺税号', email: 'a@b.com' },
    })
    check(r.status === 400 || r.status === 409, '企业发票缺税号被拒',
      `实际 HTTP ${r.status} / ${r.message}`)
  }
  {
    const r = await expectOK('GET', '/app/invoices', { token: userToken })
    if (check(r.ok, 'GET /app/invoices 我的发票列表', r.reason)) {
      check(Array.isArray(r.data), '返回数组')
      const hit = r.data?.find((v) => v.id === invoiceId)
      check(!!hit, '刚申请的发票出现在列表中')
      if (r.data?.some((v) => v.user_id !== userId)) {
        bad('发票列表按用户隔离', '出现他人发票')
      } else ok('发票列表已按当前用户隔离')
    }
  }
  {
    const r = await expectOK('GET', `/app/invoices/${invoiceId}`, { token: userToken })
    if (check(r.ok, `GET /app/invoices/${invoiceId} 发票详情`, r.reason)) {
      const fields = ['no', 'order_id', 'amount_cents', 'type', 'title', 'status']
      const missing = fields.filter((f) => r.data[f] === undefined)
      check(missing.length === 0, '发票字段完整（前端 Invoice 接口契约）',
        `缺少: ${missing.join(', ')}`)
    }
  }

  // ---------- 9. 物流 ----------
  group('9. 物流（对应 packageOrder/logistics）')
  {
    const r = await call('GET', `/app/orders/${orderId}/shipment`, { token: userToken })
    // 尚无发货记录时应是 404 或空结构，二者都算通过；但必须不是 500
    check(r.status !== 500, 'GET /app/orders/:id/shipment 未发货运单不报 500',
      `实际 HTTP ${r.status} / ${r.body?.message ?? r.text?.slice(0, 100)}`)
    if (r.status === 200 && r.body?.code === 0) {
      ok('未发货时返回 200（空结构）', JSON.stringify(r.body.data)?.slice(0, 100))
    } else if (r.status === 404) {
      ok('未发货时返回 404')
    }
  }

  // ---------- 10. 商家入驻申请 ----------
  //
  // ⚠️ 这里的「提交申请」必须用**每次全新**的用户。
  // 申请记录是「一个用户一条」，且状态单向不可回退 ——
  // 同一个用户第二次提交会被 409 拒（pending/active 都不允许重交）。
  // 早期版本复用 userToken，导致脚本只在**首次**运行全绿，
  // 之后每次都报 409，属于典型的「幂等性缺陷」。
  group('10. 商家入驻申请（对应 packageMerchant/apply）')
  {
    const u = await expectOK('POST', '/app/auth/dev-login', {
      body: { platform: 'wechat', code: `smoke_apply_${Date.now()}` },
    })
    if (check(u.ok, '创建申请专用用户（保证可重复运行）', u.reason)) {
      const r = await expectOK('POST', '/app/merchants/apply', {
        token: u.data.token,
        body: {
          name: `冒烟测试商户${Date.now()}`,
          contact: '张三',
          phone: '13800138000',
        },
      })
      if (check(r.ok, 'POST /app/merchants/apply 提交入驻申请', r.reason)) {
        check(!!r.data?.id, '返回 merchant.id')
        check(!!r.data?.status, '返回 status', `status=${r.data?.status}`)
      }
    }
  }
  {
    const r = await expectFail('POST', '/app/merchants/apply', {
      token: userToken,
      body: { name: '缺联系方式' },
    })
    eq(r.status, 400, '缺少必填字段返回 400')
  }
  {
    const r = await expectFail('POST', '/app/merchants/apply', {
      token: userToken,
      body: { name: '手机号错', contact: '李四', phone: '123' },
    })
    eq(r.status, 400, '手机号格式错误返回 400')
  }

  // ---------- 10b. 我的入驻申请（对应 mine 入口路由 + apply-status）----------
  //
  // 这组用例锁死两个 bug：
  //   ①「商家入驻提交后再次点开还是提交界面」—— merchant 表没有 owner_user_id，
  //      申请记录无法回溯到申请人，前端无从判断「我是否已申请」。
  //   ②「未申请返回 404」在开发者工具里刷一屏红色错误 + 完整调用栈，
  //      把「还没申请过」这个**正常业务状态**伪装成接口故障。
  group('10b. 我的入驻申请（对应 pages/mine 入口路由 + packageMerchant/apply-status）')
  {
    // (1) 全新用户查询必须是 **200 + data=null**（不是 404）。
    //     ⚠️ 这条断言的方向很关键：早期实现断言的是 404，后来改成了 200+null。
    //     用 200+null 是因为 404 会在小程序开发者工具 Console 里打红字 + 调用栈，
    //     网络面板也计为失败请求，完全掩盖真实接口错误。
    //     若哪天有人把后端改回 404，这条会立刻失败。
    const fresh = await expectOK('POST', '/app/auth/dev-login', {
      body: { platform: 'wechat', code: `smoke_fresh_${Date.now()}` },
    })
    if (check(fresh.ok, '创建全新用户（用于验证「未申请」状态）', fresh.reason)) {
      const r = await expectOK('GET', '/app/merchants/mine', {
        token: fresh.data.token,
      })
      if (check(r.ok, '未申请时 GET /app/merchants/mine 返回 200（不再是 404）', r.reason)) {
        eq(r.data, null, '未申请时 data 为 null')
      }
    }
  }
  // ⚠️ 状态机部分**必须用独立的新用户**，不能复用 userToken：
  // 入驻申请状态是**单向不可回退**的（active 之后不能再申请，也不会被改回 pending），
  // 而下面要跑通「pending → rejected → 重新申请 → active」整条状态机。
  // 复用共享用户的话，脚本第二次运行时该用户已是 active，整组必然失败 ——
  // 测试会退化成「只能跑一次」，在反复回归里是致命的。
  const mq = await expectOK('POST', '/app/auth/dev-login', {
    body: { platform: 'wechat', code: `smoke_merchant_${Date.now()}` },
  })
  if (!mq.ok) {
    bad('创建入驻申请专用测试用户', mq.reason)
  } else {
    const mTok = mq.data.token
    const mUserId = mq.data.user.id

  {
    // (2) 用已提交过申请的用户查询，必须能取回自己那条，且带 owner_user_id。
    //     owner_user_id 必须与当前登录用户一致 —— 否则就是串号，会看到别人的申请。
    await expectOK('POST', '/app/merchants/apply', {
      token: mTok,
      body: { name: `冒烟进度商户${Date.now()}`, contact: '张三', phone: '13800138000' },
    })
    const r = await expectOK('GET', '/app/merchants/mine', { token: mTok })
    if (check(r.ok, '已申请时 GET /app/merchants/mine 返回 200', r.reason)) {
      check(r.data?.owner_user_id === mUserId,
        '返回的申请归属当前用户（owner_user_id 正确）',
        `期望 ${mUserId}，实际 ${r.data?.owner_user_id}`)
      check(r.data?.status === 'pending',
        '新提交的申请状态为 pending',
        `status=${r.data?.status}`)
    }
  }
  {
    // (3) pending 期间重复提交必须幂等：返回同一条记录（同 id），不新增脏数据。
    //     用户「误以为没提交成功而反复点提交」是极常见场景。
    const first = await expectOK('GET', '/app/merchants/mine', { token: mTok })
    const again = await expectOK('POST', '/app/merchants/apply', {
      token: mTok,
      body: { name: '重复提交改名', contact: '李四', phone: '13900139000' },
    })
    if (check(again.ok, '重复提交申请仍返回成功（不报错）', again.reason)) {
      eq(again.data?.id, first.data?.id,
        '重复提交返回同一条申请（id 不变，未新增脏数据）')
      // pending 期间资料**不应**被改写 —— 管理员可能正在看这份资料
      eq(again.data?.name, first.data?.name,
        'pending 期间重复提交不改写资料（避免审核中被偷改）')
    }
  }
  {
    // (4) 🔴 被拒后必须能重新申请 —— 否则用户被拒一次就永久卡死：
    //     入口永远停在「未通过」的进度页，再也提交不了。
    //     实现要点是**复用同一条记录**（UPDATE 而非 INSERT）：
    //     uq_merchant_owner_user_pending 部分唯一索引限定「一个用户一条申请」，
    //     改成 INSERT 会直接撞唯一约束。
    const adminTok = await adminLogin()
    if (check(!!adminTok, '管理员登录（用于审核入驻申请）')) {
      const mine = await expectOK('GET', '/app/merchants/mine', { token: mTok })
      const appId = mine.data?.id
      if (check(!!appId, '取得待审核申请 id', `id=${appId}`)) {
        // 管理员拒绝
        const rev = await expectOK('POST', `/admin/merchants/${appId}/review`, {
          token: adminTok,
          body: { status: 'rejected' },
        })
        check(rev.ok, '管理员拒绝该申请', rev.reason)

        const after = await expectOK('GET', '/app/merchants/mine', { token: mTok })
        eq(after.data?.status, 'rejected', '用户查询到状态为 rejected')

        // 重新申请：必须成功、id 不变、状态回到 pending、资料已更新
        const re = await expectOK('POST', '/app/merchants/apply', {
          token: mTok,
          body: { name: `重交商户${Date.now()}`, contact: '王五', phone: '13700137000' },
        })
        if (check(re.ok, '被拒后可以重新申请（不再永久卡死）', re.reason)) {
          eq(re.data?.id, appId, '重新申请复用同一条记录（id 不变）')
          eq(re.data?.status, 'pending', '重新申请后状态回到 pending')
          eq(re.data?.contact, '王五', '重新申请后资料已更新')
        }
      }
    }
  }
  {
    // (5) 审核通过后不允许再申请（避免已入驻商家重复提交，也无法靠重交绕过停用）
    const adminTok = await adminLogin()
    const mine = await expectOK('GET', '/app/merchants/mine', { token: mTok })
    const appId = mine.data?.id
    if (adminTok && appId) {
      await expectOK('POST', `/admin/merchants/${appId}/review`, {
        token: adminTok,
        body: { status: 'active' },
      })
      const r = await expectFail('POST', '/app/merchants/apply', {
        token: mTok,
        body: { name: '再申请', contact: '赵六', phone: '13600136000' },
      })
      eq(r.status, 409, '已是入驻商家时再次申请返回 409')
    }
  }

  }

  // ---------- 11. 越权隔离 ----------
  group('11. 越权隔离（换一个用户访问他人订单）')
  {
    const other = await expectOK('POST', '/app/auth/dev-login', {
      body: { platform: 'wechat', code: 'smoke_other' },
    })
    if (other.ok) {
      const otherToken = other.data.token
      check(other.data.user.id !== userId, '第二个用户 id 与第一个不同')
      const r = await expectFail('GET', `/app/orders/${orderId}`, { token: otherToken })
      check(r.status === 403 || r.status === 404,
        '他人订单不可访问（403/404）', `实际 HTTP ${r.status}`)
      const l = await expectOK('GET', '/app/orders', { token: otherToken })
      if (l.ok) {
        check(!l.data?.some((o) => o.id === orderId),
          '他人订单列表不含该订单')
      }
    } else {
      bad('创建第二个测试用户', other.reason)
    }
  }

  // ---------- 12. 收货地址簿 ----------
  // 用一次性用户跑完整 CRUD，避免污染主用户、也保证重复运行互不干扰。
  group('12. 收货地址簿 CRUD（对应 packageUser/address）')
  {
    // 一次性 code：每次运行都是全新用户 → 空地址簿，
    // 「首条自动成默认」这类断言才稳定。
    const u = await expectOK('POST', '/app/auth/dev-login', {
      body: { platform: 'wechat', code: `addr_${Date.now()}` },
    })
    if (!check(u.ok, '创建一次性测试用户', u.reason)) {
      // 用户建不出来，后面的地址用例全部无从谈起，直接收尾
      printSummary()
      process.exit(1)
    }

    const at = u.data.token
    const uid = u.data.user.id

    // ── 空地址簿 ──
    {
      const r = await expectOK('GET', '/app/addresses', { token: at })
      if (check(r.ok, 'GET /app/addresses 空地址簿', r.reason)) {
        check(Array.isArray(r.data), '空地址簿返回 [] 而不是 null',
          `实际类型 ${r.data === null ? 'null' : typeof r.data}`)
        eq(r.data.length, 0, '空地址簿长度为 0')
      }
    }
    {
      const r = await expectOK('GET', '/app/addresses/default', { token: at })
      if (check(r.ok, 'GET /app/addresses/default 无默认地址时仍 200', r.reason)) {
        eq(r.data, null, '无默认地址返回 data:null（不是 404）')
      }
    }

    // ── 首条自动成默认 ──
    let a1 = null
    {
      const r = await expectOK('POST', '/app/addresses', {
        token: at,
        body: {
          receiver: '李四', phone: '13900000002',
          province: '上海市', city: '上海市', district: '黄浦区', detail: '南京路 1 号',
        },
      })
      if (check(r.ok, 'POST /app/addresses 首条地址', r.reason)) {
        a1 = r.data
        eq(r.data?.is_default, true, '首条地址自动成为默认（无需显式传 set_default）')
        eq(r.data?.owner_user_id, uid, 'owner_user_id 归属当前用户')
      }
    }
    {
      // ⚠️ 直辖市去重：province == city == 上海市，
      // 若不去重会得到「上海市 上海市 黄浦区」，与订单快照的拼法不一致。
      const r = await expectOK('GET', '/app/addresses/default', { token: at })
      if (check(r.ok, '默认地址可查询', r.reason)) {
        eq(r.data?.id, a1?.id, '默认地址就是刚建的那条')
      }
    }

    // ── 第三条 + 列表排序 + 默认切换 ──
    let a2 = null
    {
      const r = await expectOK('POST', '/app/addresses', {
        token: at,
        body: {
          receiver: '王五', phone: '13700000003',
          province: '广东省', city: '深圳市', district: '福田区', detail: '深南大道 2 号',
        },
      })
      if (check(r.ok, 'POST /app/addresses 第二条地址', r.reason)) {
        a2 = r.data
        eq(r.data?.is_default, false, '已有默认时，新增地址不再自动成为默认')
      }
    }
    {
      const r = await expectOK('GET', '/app/addresses', { token: at })
      if (check(r.ok, 'GET /app/addresses 列表', r.reason)) {
        eq(r.data?.length, 2, '列表返回 2 条')
        eq(r.data?.[0]?.is_default, true, '列表把默认地址排在最前')
      }
    }
    {
      const r = await expectOK('POST', `/app/addresses/${a2?.id}/default`, { token: at })
      check(r.ok, `POST /app/addresses/${a2?.id}/default 切换默认`, r.reason)
    }
    {
      const r = await expectOK('GET', '/app/addresses', { token: at })
      if (r.ok) {
        const defaults = r.data.filter((x) => x.is_default)
        eq(defaults.length, 1, '切换后「有且只有一条」默认地址')
        eq(defaults[0]?.id, a2?.id, '默认地址已换成切换的那条')
      }
    }

    // ── 更新：改内容不影响 is_default ──
    {
      const r = await expectOK('PUT', `/app/addresses/${a1?.id}`, {
        token: at,
        body: {
          receiver: '李四改名', phone: '13900000002',
          province: '上海市', city: '上海市', district: '静安区', detail: '南京西路 9 号',
        },
      })
      if (check(r.ok, `PUT /app/addresses/${a1?.id} 更新地址`, r.reason)) {
        eq(r.data?.receiver, '李四改名', '内容已更新')
        eq(r.data?.district, '静安区', '区县已更新')
        eq(r.data?.is_default, false, '更新内容不会顺手改掉 is_default')
      }
    }

    // ── 校验：中文错误文案 ──
    {
      const cases = [
        { body: { receiver: '', phone: '13900000002', province: '沪', city: '沪', district: 'a', detail: 'b' }, kw: '收货人' },
        { body: { receiver: '甲', phone: '123', province: '沪', city: '沪', district: 'a', detail: 'b' }, kw: '手机号' },
        { body: { receiver: '甲', phone: '13900000002', province: '', city: '', district: '', detail: '' }, kw: '地区' },
        { body: { receiver: '甲', phone: '13900000002', province: '沪', city: '沪', district: 'a', detail: '' }, kw: '详细地址' },
      ]
      for (const c of cases) {
        const r = await expectFail('POST', '/app/addresses', { token: at, body: c.body })
        check(r.status === 400 && new RegExp(c.kw).test(r.message || ''),
          `非法输入被拦下且提示含「${c.kw}」`,
          `HTTP ${r.status} message=${JSON.stringify(r.message)}`)
      }
    }

    // ── 跨用户越权：读 / 改 / 删 / 设默认 全部 404 ──
    {
      const o = await expectOK('POST', '/app/auth/dev-login', {
        body: { platform: 'wechat', code: `addr_x_${Date.now()}` },
      })
      if (check(o.ok, '创建第二个一次性用户（越权测试）', o.reason)) {
        const ot = o.data.token
        const g = await expectFail('GET', `/app/addresses/${a1?.id}`, { token: ot })
        eq(g.status, 404, '他人地址不可读（404，不泄露是否存在）')

        const p = await expectFail('PUT', `/app/addresses/${a1?.id}`, {
          token: ot,
          body: {
            receiver: '黑客', phone: '13000000000',
            province: '京', city: '京', district: 'x', detail: 'y',
          },
        })
        eq(p.status, 404, '他人地址不可改（404）')

        const d = await expectFail('POST', `/app/addresses/${a1?.id}/default`, { token: ot })
        eq(d.status, 404, '他人地址不可设为默认（404）')

        const x = await expectFail('DELETE', `/app/addresses/${a1?.id}`, { token: ot })
        eq(x.status, 404, '他人地址不可删（404）')

        // 受害者数据未被篡改
        const v = await expectOK('GET', `/app/addresses/${a1?.id}`, { token: at })
        if (v.ok) {
          eq(v.data?.receiver, '李四改名', '越权尝试后受害者数据完好')
        }
        const ol = await expectOK('GET', '/app/addresses', { token: ot })
        if (ol.ok) eq(ol.data?.length, 0, '第二个用户的地址簿为空（数据按用户隔离）')
      }
    }

    // ── 删除默认地址：不自动补位 ──
    {
      const r = await expectOK('DELETE', `/app/addresses/${a2?.id}`, { token: at })
      check(r.ok, `DELETE /app/addresses/${a2?.id} 删除默认地址`, r.reason)
    }
    {
      const r = await expectOK('GET', '/app/addresses/default', { token: at })
      if (check(r.ok, '删除默认后查默认地址仍 200', r.reason)) {
        eq(r.data, null, '删掉默认后默认地址为空（不擅自把别人提为默认）')
      }
    }
    {
      const r = await expectOK('GET', '/app/addresses', { token: at })
      if (r.ok) {
        check(!r.data?.some((x) => x.id === a2?.id), '被删地址已不在列表')
        eq(r.data?.length, 1, '列表只剩 1 条')
      }
    }
    {
      const r = await expectFail('DELETE', '/app/addresses/99999999', { token: at })
      eq(r.status, 404, '删除不存在的地址返回 404')
    }
  }

  // ---------- 汇总 ----------
  printSummary()
  process.exit(failed === 0 ? 0 : 1)
}

/** 打印统计并列出失败明细。末尾与「提前收尾」两处共用。 */
function printSummary() {
  console.log(`\n${C.bold}${'─'.repeat(58)}${C.reset}`)
  if (failed === 0) {
    console.log(`${C.green}${C.bold}全部通过${C.reset}  ${C.green}${passed} passed${C.reset}`)
  } else {
    console.log(`${C.bold}结果：${C.green}${passed} passed${C.reset}  ${C.red}${failed} failed${C.reset}`)
    console.log(`\n${C.red}${C.bold}失败明细：${C.reset}`)
    failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`))
  }
  console.log(`${C.bold}${'─'.repeat(58)}${C.reset}`)
}

main().catch((e) => {
  console.error(`\n${C.red}脚本异常终止:${C.reset}`, e)
  process.exit(1)
})

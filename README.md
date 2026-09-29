# JoyRent Community Edition

一个基于 Go Gin 的设备租赁管理平台，包含三端：

- **用户端（微信小程序 / 支付宝小程序）**：Taro 4 + React 18 + TypeScript
- **管理后台（Web）**：Vite 8 + React 18 + Ant Design 5
- **后端**：Go 1.26 + Gin + sqlx + PostgreSQL 16

业务覆盖设备分类管理、租赁订单、押金支付（含**按芝麻信用分减免押金**）、
发票开具、物流跟踪。初期平台自营，所有业务表预留 `merchant_id`，默认商家 ID = 1。

社区版管理后台默认品牌为 **JoyRent CE**（名称与 Logo 可在代码内替换，白标后台为商业版功能）。

## 版本对照

| 版本 | 白标 / 改 logo | 商户入驻 | 在线客服（IM） | 快递面单打印 | 对外 SaaS |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **社区版（AGPL v3）** | ❌（可自行修改代码实现，但须遵守 AGPL-3.0 与商标政策） | ❌ 官方不支持 | ❌ 官方不支持 | ❌ 官方不支持 | 允许，但须按 AGPL-3.0 向用户提供对应源代码 |
| **Business（商业许可）** | ✅ | ✅ **有数量上限**（在线授权服务器控制） | ✅ | ❌ | 商业合同禁止 |
| **Enterprise（商业许可）** | ✅ | ✅ **不限量** | ✅ | ✅ | 允许 |

| 功能 | 社区版（CE） | Business | Enterprise |
| --- | :---: | :---: | :---: |
| 设备分类 / 设备 / 设备单元管理 | ✅ | ✅ | ✅ |
| 租赁下单、库存排他约束、防超卖 | ✅ | ✅ | ✅ |
| 押金支付（微信 / 支付宝）、押金退款 | ✅ | ✅ | ✅ |
| 押金按信用分减免（≥700 全免 / 650-699 半价） | ✅ | ✅ | ✅ |
| 发票、物流跟踪、收货地址 | ✅ | ✅ | ✅ |
| 物流轨迹自动查询（快递100） | ✅ 代码已就绪，**填 key 即可启用** | ✅ | ✅ |
| **品牌设置（白标：自定义平台名称与 Logo）** | ❌ 后台入口提示升级 | ✅ | ✅ |
| **账号管理（平台客服 / 商家管理员子账号）** | ❌ 后台入口提示升级 | ✅ | ✅ |
| **在线客服工作台（IM 实时接待）** | ❌ 后台入口提示升级 | ✅ | ✅ |
| **快递面单打印（电子面单 + 热敏打印）** | ❌ 后台入口提示升级 | ❌ | ✅ **专属** |
| **商家入驻** | ❌ 后台入口提示升级 | ✅ 数量受限 | ✅ 不限量 |
| 商家管理员登录后台管理自有商品 | — | ✅ | ✅ |

> \* Business 版入驻上限由**在线授权服务器**签发的签名授权控制（客户侧改配置文件无法解除），
> 超限后审核接口返回明确提示并可购买 Enterprise 解除。

> 说明：社区版功能限制是“官方不支持、不提供、不维护”，并非许可证禁止用户自行修改代码实现。
> 根据 AGPL-3.0，你可以修改社区版代码并自行实现上述功能，但修改后的代码若作为网络服务提供，必须按 AGPL-3.0 向用户开放对应源代码。

**后台导航与升级提示**：社区版管理后台保留了 Business / Enterprise 功能的完整导航入口
（品牌设置、账号管理、客服工作台、面单打印、商家管理），点击进入统一的「该功能需要升级」
提示页 —— 让使用者知道能力存在与升级路径，而不是隐藏入口造成「产品缺了这块」的误解。

## 快速开始

### 1. 环境准备

```bash
go version       # 需要 go1.26.x
node -v          # 需要 ^22.12.0 || >=24.0.0
psql --version   # 需要 16.x
```

### 2. 数据库

```bash
sudo apt install postgresql-16 postgresql-contrib-16   # 或 brew install postgresql@16
sudo -u postgres createdb rental
sudo -u postgres psql rental -c "CREATE EXTENSION IF NOT EXISTS btree_gist;"
```

> `btree_gist` 是**必需**的 —— 防超卖依赖 `equipment_unit_occupation`
> 上的 gist 排他约束（`unit_id WITH =, period &&`）。

### 3. 后端

```bash
cd backend
cp configs/config.toml.example configs/config.toml   # 按需填 DSN / 支付配置
mkdir -p data/static/equipment data/static/avatar
go mod download
go run tools/migrate/main.go                         # 执行迁移
go run cmd/api/main.go                               # 默认 :8080
```

### 4. 管理后台

```bash
cd admin-web
npm install
npm run dev      # 默认 http://localhost:5173，账号 admin / admin123
```

### 5. 小程序

```bash
cd taro-app
npm install
npm run build:weapp    # 产物 dist/weapp，用微信开发者工具打开
npm run build:alipay   # 产物 dist/alipay，用支付宝开发者工具打开
```

## 第三方能力接入状态

| 能力 | 状态 |
| --- | --- |
| 微信登录（code2session） | 代码完整，填 `[payment.wechat].app_id` + `app_secret` 即可用 |
| 微信支付（JSAPI） | 已实现，填商户配置即可用 |
| 支付宝登录 / 支付（JSAPI） | 已实现，填 `[payment.alipay]` 即可用 |
| 芝麻信用分 | 抽象接口已就绪；真实芝麻免押为**邀约制**（需企业实名 + 签约），未签约时使用**本地模拟**实现 |
| 物流轨迹（快递100） | **代码已就绪**：配置 `[logistics]` 的 `provider`/`customer`/`key` 后即启用自动拉取；未配置时由管理员手动录入（运单登记、状态流转、轨迹查询不受影响） |

> 支付渠道与物流查询都采用「三态装配」：配置齐全 → 真实渠道；完全未配 → 停用（走
> 本地联调实现）；**只填一部分 → 启动直接报错**，避免「看起来能支付/能查、实际没生效」的静默降级。

## 许可证与商业授权

本项目采用 **双许可模式**：

1. **社区版**
   - 许可证：**GNU Affero General Public License v3.0（AGPL-3.0）**
   - 全文见 [`LICENSE`](./LICENSE)。
   - 你可以自由使用、修改、分发社区版，包括用于商业用途。
   - 如果你修改了社区版，并通过网络向用户提供服务，根据 AGPL-3.0 第 13 节，你必须向这些用户提供**对应源代码**（修改后的完整源码）。
   - 如果你不想承担 AGPL-3.0 的源码公开义务，可以购买商业许可。

2. **Business / Enterprise 商业版**
   - 需购买商业许可，具体权利以商业合同为准。
   - **Business**：支持白标（品牌设置）、商户入驻、在线客服（IM）、账号管理；入驻商家
     **数量受限** —— 上限由在线授权服务器签发的签名授权控制，超限后需升级；**禁止对外提供 SaaS 服务**。
   - **Enterprise**：在 Business 基础上，入驻**不限量**、**允许对外提供 SaaS 服务**，并独享
     **快递面单打印**；还可按合同约定获得更多授权（如 OEM、嵌入、转售等）。
   - 商业许可可替代 AGPL-3.0 的开源义务，具体范围以合同为准。

3. **商标政策**
   - JoyRent 名称、Logo 及相关品牌标识归项目方所有。
   - 你可以修改社区版代码，但修改后的版本必须移除或替换 JoyRent 品牌标识，且不得暗示与官方存在关联。
   - 未经书面许可，不得在修改版或衍生服务中使用 JoyRent 商标。
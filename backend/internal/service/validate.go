// File Name: validate.go
// Created Time: 2026-09-28 10:58:00
//
// 通用字段校验模式。
//
// ⚠️ 本文件是**社区版（CE）专有**的拆分产物：
// `phonePattern` 原本定义在 `service/merchant.go`，但 `address.go` 也在用它
// （收货人手机号校验）。CE 移除了商家入驻模块（含 merchant.go），
// 若不做处理会出现「删掉商家入驻后，收货地址功能编译不过」——
// 即一处删除引发了无关模块的连带故障。
//
// 所以把这类**跨模块共享**的校验模式单独抽到这里：谁需要谁引用，
// 不与任何业务模块耦合。
package service

import "regexp"

// phonePattern 中国大陆手机号：1 开头 + 共 11 位数字。
//
// 只做**格式**校验（足以拦住明显的错填），刻意不做号段白名单 ——
// 号段会随运营商调整，写死号段反而会误拒新号段。
var phonePattern = regexp.MustCompile(`^1\d{10}$`)

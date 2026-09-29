// File Name: money.go
// Created Time: 2026-09-22 18:51:34
// Update Time: 2026-09-22 18:51:34


package money

import (
	"fmt"
	"strconv"
	"strings"
)

// YuanToCents 把元字符串转成整数分，不接受浮点输入
// "12.34" -> 1234, "12" -> 1200, "12.3" -> 1230
func YuanToCents(yuan string) (int64, error) {
	yuan = strings.TrimSpace(yuan)
	if yuan == "" {
		return 0, fmt.Errorf("empty amount")
	}

	neg := false
	if strings.HasPrefix(yuan, "-") {
		neg = true
		yuan = yuan[1:]
	}

	parts := strings.SplitN(yuan, ".", 2)
	intPart := parts[0]
	if intPart == "" {
		intPart = "0"
	}
	fracPart := "00"
	if len(parts) == 2 {
		fracPart = parts[1]
		if len(fracPart) > 2 {
			fracPart = fracPart[:2]
		}
	}
	for len(fracPart) < 2 {
		fracPart += "0"
	}

	intVal, err := strconv.ParseInt(intPart, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid amount %q: %w", yuan, err)
	}
	fracVal, err := strconv.ParseInt(fracPart, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid amount %q: %w", yuan, err)
	}

	cents := intVal*100 + fracVal
	if neg {
		cents = -cents
	}
	return cents, nil
}

// CentsToYuan 把分格式化元字符串，始终保留两位小数
// 1234 -> "12.34", -1 -> "-0.01"
func CentsToYuan(cents int64) string {
	neg := cents < 0
	if neg {
		cents = -cents
	}
	yuan := cents / 100
	frac := cents % 100
	s := fmt.Sprintf("%d.%02d", yuan, frac)
	if neg {
		return "-" + s
	}
	return s
}

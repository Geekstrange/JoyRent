//go:build ignore

// 一次性迁移执行器：读取 TOML 里的 dsn，按文件名顺序执行 migrations/*.up.sql。
// 仅用于本地开发（项目未引入 golang-migrate 等工具）。
// 运行：go run tools/migrate/main.go
package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
	"golang.org/x/net/context"
)

func main() {
	dsn := os.Getenv("DSN")
	if dsn == "" {
		raw, err := os.ReadFile("configs/config.toml")
		if err != nil {
			panic(err)
		}
		for _, line := range strings.Split(string(raw), "\n") {
			line = strings.TrimSpace(line)
			if strings.HasPrefix(line, "dsn") {
				if i := strings.Index(line, "\""); i >= 0 {
					rest := line[i+1:]
					if j := strings.Index(rest, "\""); j >= 0 {
						dsn = rest[:j]
					}
				}
			}
		}
	}
	if dsn == "" {
		panic("dsn 未找到")
	}

	files, err := filepath.Glob("migrations/*.up.sql")
	if err != nil {
		panic(err)
	}
	sort.Strings(files)

	ctx := context.Background()
	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		panic(err)
	}
	defer conn.Close(ctx)

	for _, f := range files {
		body, err := os.ReadFile(f)
		if err != nil {
			panic(err)
		}
		// 000001 是建库脚本，跳过（库里已有数据，重跑必然 42710/42P07）
		if strings.Contains(f, "000001_init") {
			fmt.Printf("· %s (已应用，跳过)\n", f)
			continue
		}
		if _, err := conn.Exec(ctx, string(body)); err != nil {
			fmt.Printf("✗ %s: %v\n", f, err)
			os.Exit(1)
		}
		fmt.Printf("✓ %s\n", f)
	}
	fmt.Println("全部迁移执行完成")
}

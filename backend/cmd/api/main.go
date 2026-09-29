package main

import (
	"context"
	"errors"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/jmoiron/sqlx"

	"rental-platform/internal/config"
	"rental-platform/internal/router"
)

func main() {
	cfgPath := flag.String("config", "configs/config.toml", "config file path")
	flag.Parse()

	cfg, err := config.Load(*cfgPath)
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	gin.SetMode(cfg.Server.Mode)

	db, err := sqlx.Connect("pgx", cfg.DB.DSN)
	if err != nil {
		log.Fatalf("connect db: %v", err)
	}
	defer func() { _ = db.Close() }()

	db.SetMaxOpenConns(cfg.DB.MaxOpen)
	db.SetMaxIdleConns(cfg.DB.MaxIdle)
	db.SetConnMaxLifetime(cfg.ConnMaxLifetime())

	if err := db.Ping(); err != nil {
		log.Fatalf("ping db: %v", err)
	}

	engine, cleanup, err := router.New(cfg, db)
	if err != nil {
		log.Fatalf("init router: %v", err)
	}
	defer cleanup()

	srv := &http.Server{
		Addr:              cfg.Server.Addr,
		Handler:           engine,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("api listening on %s (mode=%s)", cfg.Server.Addr, cfg.Server.Mode)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("listen: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("shutting down...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("shutdown: %v", err)
	}
	log.Println("server exited")
}

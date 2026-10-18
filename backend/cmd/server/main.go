package main

import (
	"context"
	"home-streaming-backend/internal/app"
	"home-streaming-backend/internal/config"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/joho/godotenv"
)

func main() {
	if err := run(); err != nil {
		slog.Error("fatal", "error", err)
		os.Exit(1)
	}
}

// run holds the real logic so main stays a one-liner and every error is returned (not panicked).
func run() error {
	// .env is a developer convenience: it only fills variables that are not already set, so a real
	// deployment (variables injected by the container/orchestrator) always wins. A missing file is
	// not an error.
	_ = godotenv.Load()

	cfg, err := config.Load()
	if err != nil {
		return err
	}

	logger := newLogger(cfg)
	slog.SetDefault(logger)

	// Cancel the context on Ctrl-C / SIGTERM, and hand it to every component so they can shut down
	// gracefully.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	newApp, err := app.New(cfg, logger)
	if err != nil {
		return err
	}

	return newApp.Run(ctx)
}

func newLogger(cfg *config.Config) *slog.Logger {
	level := slog.LevelInfo
	if cfg.Environment == "development" {
		level = slog.LevelDebug
	}
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: level})).With(
		"service", "worker",
		"env", cfg.Environment,
	)
}
